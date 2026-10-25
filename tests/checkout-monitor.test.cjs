'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run,LATEST}=require('../backend/checkout-monitor.cjs');
const {bucket}=require('./helpers/mock-r2.cjs');
const {gasHarness}=require('./helpers/gas-harness.cjs');
const NOW=Date.parse('2026-10-25T16:00:00Z');
function environment(){return {WORKER_GAS_SECRET:'monitor-test-secret',STRIPE_SECRET_KEY:'synthetic-secret-never-store',GAS_WEBHOOK_URL:'https://accounting.example.invalid',MANUAL_ORDER_GAS_URL:'https://accounting.example.invalid',CATALOG_URL:'https://catalog.example.invalid/catalog.json',REVIEW_MEDIA:bucket(),CHECKOUT_MONITOR_TIMEOUT_MS:250};}
function mock(t,env,change={}){
 const original=global.fetch,calls=[];const gas=gasHarness(env.WORKER_GAS_SECRET);
 global.fetch=async(url,options={})=>{
  calls.push({url,method:options.method,body:options.body});
  if(url===env.GAS_WEBHOOK_URL){
   assert.equal(options.method,'POST');const wrapper=JSON.parse(options.body);const payload=JSON.parse(wrapper.payload);
   assert.equal(payload.action,'security_probe');assert.equal(payload.encodingProbe,'\u00e9\u2014\ud83e\uddea');
   assert.doesNotMatch(wrapper.payload,/[^\x00-\x7f]/);
   if(change.hangBody)return {ok:true,status:200,json:()=>new Promise(()=>{})};
   return Response.json(change.rejectProbe?{ok:false,error:'private rejection detail'}:gas.context.doPost({postData:{contents:options.body}}));
  }
  if(url==='https://api.stripe.com/v1/account'){
   assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer '+env.STRIPE_SECRET_KEY);
   return change.stripeReject?Response.json({error:{message:'private secret and customer details'}},{status:401}):Response.json({object:'account',id:'acct_SyntheticMonitor'});
  }
  if(url===env.CATALOG_URL)return Response.json(change.badCatalog?{products:[]}:{currency:'EUR',products:[{handle:'synthetic-wig',variants:[{price_eur:100}]}]});
  throw Error('Unexpected request');
 };t.after(()=>global.fetch=original);return {calls,gas};
}
test('recurring probe authenticates Unicode without transactions, accounting rows or emails',async t=>{
 const env=environment(),{calls,gas}=mock(t,env);const result=await run(env,NOW);
 assert.equal(result.status,'healthy');assert.equal(result.failureStreak,0);assert.equal(result.checks.stripeAccounting.reason,'signed_unicode_probe_accepted');
 assert.equal(calls.length,3,'identical accounting targets must share one probe');
 assert.equal(calls.filter(c=>c.url.startsWith('https://api.stripe.com/')).length,1);
 assert.equal(gas.sheets.Orders.length,1);assert.equal(gas.mails.length,0);
 const stored=JSON.parse((await env.REVIEW_MEDIA.get(LATEST)).body);
 assert.equal(stored.checkedAt,new Date(NOW).toISOString());
 assert.doesNotMatch(JSON.stringify(stored),/https:|acct_|synthetic-secret|monitor-test-secret/);
 assert.equal([...env.REVIEW_MEDIA.data.keys()].filter(k=>k.startsWith('monitoring/checkout/history/')).length,1);
});
test('signature rejection is detected and consecutive failed checks are counted',async t=>{
 const env=environment();mock(t,env,{rejectProbe:true});
 const first=await run(env,NOW),second=await run(env,NOW+600000);
 assert.equal(first.status,'degraded');assert.equal(first.checks.stripeAccounting.reason,'signed_probe_rejected');assert.equal(second.failureStreak,2);
 assert.doesNotMatch(JSON.stringify(second),/private rejection detail/);
});
test('deadline covers a stalled JSON response body after headers arrive',async t=>{
 const env=environment();env.CHECKOUT_MONITOR_TIMEOUT_MS=25;mock(t,env,{hangBody:true});const started=Date.now();const result=await run(env,NOW);
 assert.equal(result.status,'degraded');assert.equal(result.checks.stripeAccounting.reason,'timeout');assert.ok(Date.now()-started<500);
});
test('Stripe authentication failure and invalid catalogue are separate sanitized findings',async t=>{
 const env=environment();mock(t,env,{stripeReject:true,badCatalog:true});const result=await run(env,NOW);
 assert.equal(result.checks.stripeAuthentication.reason,'authentication_failed');assert.equal(result.checks.catalog.reason,'invalid_catalog');
 assert.doesNotMatch(JSON.stringify(result),/private secret|customer details/);
});
test('anomaly result stores counts only and never customer details or order identifiers',async t=>{
 const env=environment();mock(t,env);
 await env.REVIEW_MEDIA.put('business-orders/private-ref.json',JSON.stringify({id:'private-reference',method:'stripe',status:'pending_checkout',createdAt:new Date(NOW-600000).toISOString(),customer:{name:'PRIVATE CUSTOMER',email:'private@example.invalid'}}));
 const result=await run(env,NOW);assert.equal(result.status,'degraded');assert.equal(result.checks.orderAnomalies.stalledCount,1);
 assert.doesNotMatch(JSON.stringify(result),/private-ref|PRIVATE CUSTOMER|private@example/);
});
test('partial order scan cannot claim absence of checkout anomalies',async t=>{
 const env=environment();mock(t,env);
 for(let i=0;i<201;i++)await env.REVIEW_MEDIA.put('business-orders/'+String(i).padStart(3,'0')+'.json',JSON.stringify({method:'stripe',status:'paid'}));
 const result=await run(env,NOW);assert.equal(result.status,'unknown');assert.equal(result.checks.orderAnomalies.partial,true);assert.equal(result.checks.orderAnomalies.scanned,200);
});
test('recent definitively failed checkout attempts cannot be reported healthy',async t=>{
 const env=environment();mock(t,env);
 await env.REVIEW_MEDIA.put('business-orders/failed-private-ref.json',JSON.stringify({method:'stripe',status:'checkout_failed',createdAt:new Date(NOW-90000000).toISOString(),failedAt:new Date(NOW-60000).toISOString(),failureReason:'private-provider-detail'}));
 await env.REVIEW_MEDIA.put('business-orders/old-failed.json',JSON.stringify({method:'stripe',status:'checkout_failed',createdAt:new Date(NOW-90000000).toISOString()}));
 const result=await run(env,NOW);assert.equal(result.status,'degraded');assert.equal(result.checks.orderAnomalies.failedCount,1);assert.equal(result.checks.orderAnomalies.reason,'checkout_start_failures');
 assert.doesNotMatch(JSON.stringify(result),/failed-private-ref|private-provider-detail/);
});
test('catalogue with zero, negative or nonfinite product prices is not healthy',async t=>{
 const env=environment();mock(t,env);const base=global.fetch;
 for(const price of [0,-1,null,'not-a-number']){
  global.fetch=async(url,options)=>url===env.CATALOG_URL?Response.json({currency:'EUR',products:[{handle:'synthetic-wig',variants:[{price_eur:price}]}]}):base(url,options);
  const result=await run(env,NOW);assert.equal(result.checks.catalog.status,'degraded');assert.equal(result.checks.catalog.reason,'invalid_catalog');
 }
});
test('monitor storage failure is reported unknown, not a successful persisted check',async t=>{
 const env=environment();mock(t,env);env.REVIEW_MEDIA.put=async()=>{throw Error('private storage failure');};
 const result=await run(env,NOW);assert.equal(result.status,'unknown');assert.equal(result.checks.monitorStorage.reason,'snapshot_write_failed');
});
test('history reuses a bounded 144-slot ring instead of accumulating records indefinitely',async t=>{
 const env=environment();mock(t,env);await run(env,NOW);await run(env,NOW+144*600000);
 assert.equal([...env.REVIEW_MEDIA.data.keys()].filter(k=>k.startsWith('monitoring/checkout/history/')).length,1);
});
