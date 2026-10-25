'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {handleRequest}=require('../backend/stripe-worker.cjs');
const orderEmail=require('../backend/order-email.cjs');
const {bucket}=require('./helpers/mock-r2.cjs');
const origin='https://asheerahhair.com';
const catalog={currency:'EUR',products:[{handle:'synthetic',title:'Synthetic Wig',variants:[{title:'16',opt1:'16',price_eur:100}]}]};
const cart={customer:{name:'Synthetic Customer',email:'buyer@example.invalid',phone:'123456789',country:'PT',address:'Synthetic address',city:'Synthetic city',postalCode:'0000'},items:[{handle:'synthetic',options:{opt1:'16'},quantity:1}]};
function environment(){return {SITE_ORIGIN:origin,SITE_BASE_URL:origin,CATALOG_URL:'https://catalog.example.invalid',GAS_WEBHOOK_URL:'https://gas.example.invalid',WORKER_GAS_SECRET:'synthetic-secret',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'whsec_synthetic',STRIPE_MODE:'test',ORDER_EMAIL_ENABLED:'1',RESEND_API_KEY:'synthetic-mail-key',MANAGEMENT_CAPTURE_ENABLED:'1',REVIEW_MEDIA:bucket(),UPSTREAM_TIMEOUT_MS:25,CLEANUP_TIMEOUT_MS:15,CHECKOUT_DIAGNOSTIC:'1'};}
const request=()=>new Request(origin+'/create-checkout-session',{method:'POST',headers:{Origin:origin},body:JSON.stringify(cart)});
const never=()=>new Promise(()=>{});
function stalledBody(){return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}}),{headers:{'Content-Type':'application/json'}});}
function install(t,implementation){const original=global.fetch,oldError=console.error,logs=[];global.fetch=implementation;console.error=entry=>logs.push(JSON.parse(entry));t.after(()=>{global.fetch=original;console.error=oldError;});return logs;}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Checkout exceeded the test deadline')),1000);})]);}finally{clearTimeout(timer);}}
function savedOrder(env){const key=[...env.REVIEW_MEDIA.data.keys()].find(key=>key.startsWith('order-notifications/'));return key?JSON.parse(env.REVIEW_MEDIA.data.get(key).value):null;}

for(const stalledStage of ['catalog','record_pending','create_stripe_session','record_session'])test(`deadline includes the complete response body at ${stalledStage}`,async t=>{
 const env=environment(),actions=[],signals=[];let stripeCalls=0;
 install(t,async(url,options)=>{
  signals.push(options.signal);
  if(url===env.CATALOG_URL)return stalledStage==='catalog'?stalledBody():Response.json(catalog);
  if(url===env.GAS_WEBHOOK_URL){
   const action=JSON.parse(JSON.parse(options.body).payload).action;actions.push(action);
   if((stalledStage==='record_pending'&&action==='stripe_pending')||(stalledStage==='record_session'&&action==='stripe_session_created')||action==='stripe_checkout_failed')return stalledBody();
   return Response.json({ok:true});
  }
  if(url==='https://api.stripe.com/v1/checkout/sessions'){stripeCalls++;return stalledStage==='create_stripe_session'?stalledBody():Response.json({id:'cs_test_synthetic',url:'https://checkout.stripe.com/c/pay/synthetic'});}
  throw Error('Unexpected external request');
 });
 const response=await bounded(handleRequest(request(),env));
 assert.equal(response.status,502);
 const expectedReason=stalledStage==='catalog'?'catalog_timeout':stalledStage==='create_stripe_session'?'stripe_timeout':'gas_timeout';
 assert.deepEqual(await response.json(),{error:'Unable to start secure checkout',stage:stalledStage,reason:expectedReason});
 assert.ok(signals.some(signal=>signal.aborted),'timed-out HTTP operation is aborted');
 assert.equal(stripeCalls,['create_stripe_session','record_session'].includes(stalledStage)?1:0);
 if(stalledStage==='catalog'){assert.equal(savedOrder(env),null);assert.deepEqual(actions,[]);return;}
 const order=savedOrder(env);
 assert.equal(order.status,'checkout_failed');
 assert.equal(order.failureReason,expectedReason);
 assert.equal(order.failureOutcome,stalledStage==='record_pending'?'not_started':stalledStage==='create_stripe_session'?'unknown':'session_created');
 if(stalledStage==='record_session')assert.equal(order.sessionId,'cs_test_synthetic');
 if(stalledStage==='create_stripe_session')assert.equal(order.sessionId,undefined);
 if(stalledStage!=='record_pending')assert.equal(order.accountingStatus,'needs_review');
 assert.equal(actions.at(-1),'stripe_checkout_failed');
});

test('a transport that ignores abort still cannot block pending and cleanup forever',async t=>{
 const env=environment();let gasCalls=0;
 install(t,async url=>{if(url===env.CATALOG_URL)return Response.json(catalog);if(url===env.GAS_WEBHOOK_URL){gasCalls++;return never();}throw Error('Stripe must not be called');});
 const response=await bounded(handleRequest(request(),env));
 assert.equal((await response.json()).reason,'gas_timeout');
 assert.equal(gasCalls,2);assert.equal(savedOrder(env).failureOutcome,'not_started');
});

test('stalled failure persistence and stalled GAS cleanup share a bounded deadline without masking the original rejection',async t=>{
 const env=environment();let gasCalls=0;
 const logs=install(t,async(url,options)=>{
  if(url===env.CATALOG_URL)return Response.json(catalog);
  if(url===env.GAS_WEBHOOK_URL){
   gasCalls++;const action=JSON.parse(JSON.parse(options.body).payload).action;
   if(action==='stripe_pending'){env.REVIEW_MEDIA.get=never;return Response.json({ok:false,error:'Invalid pending order'});}
   return never();
  }
  throw Error('Stripe must not be called');
 });
 const response=await bounded(handleRequest(request(),env));
 assert.deepEqual(await response.json(),{error:'Unable to start secure checkout',stage:'record_pending',reason:'gas_invalid_pending_order'});
 assert.equal(logs[0].reason,'gas_invalid_pending_order');assert.equal(gasCalls,2);
 assert.doesNotMatch(JSON.stringify(logs),/buyer@|Synthetic address|synthetic-secret/);
});

test('initial snapshot storage has its own bounded stage and does not call GAS or Stripe after timeout',async t=>{
 const env=environment();env.REVIEW_MEDIA.put=never;let calls=0;
 install(t,async url=>{calls++;assert.equal(url,env.CATALOG_URL);return Response.json(catalog);});
 const response=await bounded(handleRequest(request(),env));
 assert.deepEqual(await response.json(),{error:'Unable to start secure checkout',stage:'record_snapshot',reason:'storage_timeout'});
 assert.equal(calls,1);
});

test('a stalled session snapshot reports the known provider session without an unbounded failure write',async t=>{
 const env=environment(),actions=[];
 const logs=install(t,async(url,options)=>{
  if(url===env.CATALOG_URL)return Response.json(catalog);
  if(url===env.GAS_WEBHOOK_URL){actions.push(JSON.parse(JSON.parse(options.body).payload).action);return Response.json({ok:true});}
  if(url==='https://api.stripe.com/v1/checkout/sessions'){
   env.REVIEW_MEDIA.get=never;
   return Response.json({id:'cs_test_synthetic',url:'https://checkout.stripe.com/c/pay/synthetic'});
  }
  throw Error('Unexpected external request');
 });
 const response=await bounded(handleRequest(request(),env));
 assert.deepEqual(await response.json(),{error:'Unable to start secure checkout',stage:'record_session_snapshot',reason:'storage_timeout'});
 assert.equal(logs[0].outcome,'session_created');
 assert.deepEqual(actions,['stripe_pending','stripe_checkout_failed']);
});

test('failure handling never downgrades a paid order that arrives while session acknowledgement fails',async t=>{
 const env=environment();
 install(t,async(url,options)=>{
  if(url===env.CATALOG_URL)return Response.json(catalog);
  if(url===env.GAS_WEBHOOK_URL){
   const payload=JSON.parse(JSON.parse(options.body).payload);
   if(payload.action==='stripe_session_created'){
    const order=await orderEmail.readOrder(env,payload.orderId);order.status='paid';await orderEmail.writeOrder(env,order);
    return Response.json({ok:false,error:'Order already paid'});
   }
   return Response.json({ok:true});
  }
  if(url==='https://api.stripe.com/v1/checkout/sessions')return Response.json({id:'cs_test_synthetic',url:'https://checkout.stripe.com/c/pay/synthetic'});
  throw Error('Unexpected external request');
 });
 const response=await bounded(handleRequest(request(),env));assert.equal(response.status,502);
 assert.equal(savedOrder(env).status,'paid');assert.equal(savedOrder(env).failureReason,undefined);
 const business=[...env.REVIEW_MEDIA.data].find(([key])=>key.startsWith('business-orders/'));
 assert.equal(JSON.parse(business[1].value).status,'paid');
});

test('CAS preserves a paid update arriving between the failure read and write',async t=>{
 const env=environment(),read=env.REVIEW_MEDIA.get.bind(env.REVIEW_MEDIA),write=env.REVIEW_MEDIA.put.bind(env.REVIEW_MEDIA);
 let failureWindow=false,failureReads=0;
 env.REVIEW_MEDIA.get=async key=>{
  if(failureWindow&&key.startsWith('order-notifications/')&&++failureReads===2){
   const current=await read(key),paid=JSON.parse(await current.text());paid.status='paid';
   await write(key,JSON.stringify(paid));await write('business-orders/'+paid.id+'.json',JSON.stringify(paid));
  }
  return read(key);
 };
 install(t,async(url,options)=>{
  if(url===env.CATALOG_URL)return Response.json(catalog);
  if(url===env.GAS_WEBHOOK_URL){
   if(JSON.parse(JSON.parse(options.body).payload).action==='stripe_pending'){
    failureWindow=true;return Response.json({ok:false,error:'Invalid pending order'});
   }
   return Response.json({ok:true});
  }
  throw Error('Unexpected external request');
 });
 assert.equal((await bounded(handleRequest(request(),env))).status,502);
 assert.equal(savedOrder(env).status,'paid');
 const business=[...env.REVIEW_MEDIA.data].find(([key])=>key.startsWith('business-orders/'));
 assert.equal(JSON.parse(business[1].value).status,'paid');
});
