'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const d=require('../backend/business-dashboard.cjs'),{fixture}=require('../backend/preview-order-email.cjs');
const {runScheduledPaidEmail}=require('../backend/manual-paid-email.cjs');
function setup(){
 const order={...fixture,id:'11111111-1111-4111-8111-111111111111',version:1,manualRequestHash:'a'.repeat(64),method:'manual_dashboard',status:'awaiting_payment',totalCents:12345};
 const digest=d.safeOrder(order,null).orderDigest;let op=d.applyAction(order,d.blankOperations(),{version:0,action:'confirm_payment',acknowledged:true,reference:'receipt',expectedOrderDigest:digest},'owner');
 op=d.applyAction(order,op,{version:1,action:'approve_paid_email',acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:'x'.repeat(32)},'owner');
 const data=new Map(),ok='business-operations/'+order.id+'.json',sk='business-orders/'+order.id+'.json';let v=0;
 data.set(ok,{value:JSON.stringify(op),etag:'a'});data.set(sk,{value:JSON.stringify(order),etag:'b'});
 const bucket={async list(){return {objects:[{key:ok}],truncated:false}},async get(k){const x=data.get(k);return x?{etag:x.etag,text:async()=>x.value}:null},async put(k,value,{onlyIf}){const x=data.get(k);if(onlyIf.etagMatches!==undefined&&x?.etag!==onlyIf.etagMatches||onlyIf.etagDoesNotMatch==='*'&&x)return null;const etag=String(++v);data.set(k,{value,etag});return {etag}}};
 let time=Date.parse('2026-11-14T00:00:00Z');const calls=[];
 const env={ORDER_EMAIL_ENABLED:'1',MANUAL_PAID_SCHEDULER_ENABLED:'1',REVIEW_MEDIA:bucket,RESEND_API_KEY:'fake',WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'};
 const options={now:()=>new Date(time),fetch:async(u,o)=>{calls.push(o);return {ok:true,json:async()=>({id:'fake-id'})}}};
 return {env,options,calls,get op(){return JSON.parse(data.get(ok).value)},set op(o){data.set(ok,{value:JSON.stringify(o),etag:String(++v)})},advance(ms){time+=ms}};
}
test('scheduled delivery sends only approved snapshot using injected provider',async()=>{const f=setup();assert.equal((await runScheduledPaidEmail(f.env,f.options)).status,'ok');assert.equal(f.op.paidEmail.status,'accepted');assert.equal(f.calls.length,1);await runScheduledPaidEmail(f.env,f.options);assert.equal(f.calls.length,1)});
test('disabled flag and missing injected transport do not touch storage',async()=>{const f=setup();delete f.env.MANUAL_PAID_SCHEDULER_ENABLED;assert.equal((await runScheduledPaidEmail(f.env,f.options)).status,'disabled');f.env.MANUAL_PAID_SCHEDULER_ENABLED='1';assert.equal((await runScheduledPaidEmail(f.env)).status,'disabled');assert.equal(f.op.paidEmail.status,'pending')});
test('invalid approval is filtered before claim',async()=>{const f=setup(),o=f.op;delete o.paidEmail.approvalKeyHash;f.op=o;await runScheduledPaidEmail(f.env,f.options);assert.equal(f.op.paidEmail.status,'pending');assert.equal(f.calls.length,0)});
test('ambiguous crash retries sealed bytes and idempotency key after lease expiry',async()=>{const f=setup(),requests=[];f.options.fetch=async(u,o)=>{requests.push(o);if(requests.length===1)throw Error('lost response');return {ok:true,json:async()=>({id:'fake-id'})}};await runScheduledPaidEmail(f.env,f.options);assert.equal(f.op.paidEmail.status,'claimed');f.advance(300001);await runScheduledPaidEmail(f.env,f.options);assert.equal(f.op.paidEmail.status,'accepted');assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key'])});
test('concurrent schedulers cannot both claim the same pending approval',async()=>{const f=setup();await Promise.all([runScheduledPaidEmail(f.env,f.options),runScheduledPaidEmail(f.env,f.options)]);assert.equal(f.calls.length,1);assert.equal(f.op.paidEmail.status,'accepted')});
test('retry cutoff moves expired claim to needs_review without sending',async()=>{const f=setup();f.options.fetch=async()=>{throw Error('lost response')};await runScheduledPaidEmail(f.env,f.options);f.advance(23*60*60*1000);await runScheduledPaidEmail(f.env,f.options);assert.equal(f.op.paidEmail.status,'needs_review');assert.equal(f.op.paidEmail.reviewReason,'retry_window_expired')});

test('worker scheduler uses runtime fetch only when both flags are enabled',async()=>{
 const security=require('../backend/public-security.cjs'),newsletter=require('../backend/newsletter.cjs'),monitor=require('../backend/checkout-monitor.cjs');
 const email=require('../backend/order-email.cjs');
 const originals=[security.cleanup,newsletter.processQueue,monitor.run,email.retryPending,globalThis.fetch];
 security.cleanup=newsletter.processQueue=monitor.run=email.retryPending=async()=>{};
 try{
  const worker=(await import('../backend/worker.mjs')).default;
  const f=setup(),calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:'runtime-fake'})}};
  const run=async()=>{const pending=[];worker.scheduled({},f.env,{waitUntil:p=>pending.push(p)});await Promise.all(pending)};
  delete f.env.MANUAL_PAID_SCHEDULER_ENABLED;await run();assert.equal(calls.length,0);assert.equal(f.op.paidEmail.status,'pending');
  f.env.MANUAL_PAID_SCHEDULER_ENABLED='1';delete f.env.ORDER_EMAIL_ENABLED;await run();assert.equal(calls.length,0);assert.equal(f.op.paidEmail.status,'pending');
  f.env.ORDER_EMAIL_ENABLED='1';await run();assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(f.op.paidEmail.status,'accepted');
 }finally{[security.cleanup,newsletter.processQueue,monitor.run,email.retryPending,globalThis.fetch]=originals}
});
