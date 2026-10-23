const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const dashboard=require('../backend/business-dashboard.cjs');
const email=require('../backend/order-email.cjs');
const order=()=>({id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-10-23T10:00:00Z',language:'pt',method:'stripe',status:'paid',customer:{name:'Synthetic customer',email:'customer@example.com'},items:[],totalCents:20000,sessionId:'private-session',requestDigest:'private-digest',emailProviderId:'private-provider'});
function bucket(){const data=new Map();let sequence=0;return {data,async get(key){const o=data.get(key);return o?{etag:o.etag,text:async()=>o.text}:null;},async put(key,text,opts={}){const current=data.get(key);if(opts.onlyIf?.etagDoesNotMatch==='*'&&current)return null;if(opts.onlyIf?.etagMatches&&opts.onlyIf.etagMatches!==current?.etag)return null;const etag=String(++sequence);data.set(key,{text,etag});return {etag};},async list({prefix}){return {objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};},async delete(key){data.delete(key);}};}
const envFor=b=>({REVIEW_MEDIA:b,MANAGEMENT_CAPTURE_ENABLED:'1'});
test('business history survives email-spool deletion and excludes fictional tests',async()=>{
 const b=bucket(),env=envFor(b),o=order();await email.writeOrder(env,o);
 assert.ok(b.data.has('business-orders/'+o.id+'.json'));
 await b.delete('order-notifications/'+o.id+'.json');assert.ok(b.data.has('business-orders/'+o.id+'.json'));
 await dashboard.persistOrder(env,{...o,id:'22222222-2222-4222-8222-222222222222',isTest:true});assert.equal(b.data.size,1);
});
test('an old unpaid snapshot cannot overwrite confirmed payment in business history',async()=>{
 const b=bucket(),env=envFor(b),o=order();await dashboard.persistOrder(env,o);await dashboard.persistOrder(env,{...o,status:'pending_checkout'});
 assert.equal(JSON.parse(b.data.get('business-orders/'+o.id+'.json').text).status,'paid');
});
test('capture is inert unless explicitly enabled',async()=>{const b=bucket();await dashboard.persistOrder({REVIEW_MEDIA:b},order());assert.equal(b.data.size,0);});
test('supplier flow requires paid order, acknowledgement and consecutive steps',()=>{
 const o=order(),op=dashboard.blankOperations();assert.throws(()=>dashboard.applyAction({...o,status:'awaiting_payment'},op,{version:0,action:'supplier_sent',acknowledged:true},'owner@example.com'),/pagamento/);
 assert.throws(()=>dashboard.applyAction(o,op,{version:0,action:'supplier_sent'},'owner@example.com'),/Confirma/);
 assert.throws(()=>dashboard.applyAction(o,op,{version:0,action:'courier_accepted',acknowledged:true},'owner@example.com'),/próximo passo/);
 let result=op;for(const action of ['supplier_sent','supplier_accepted','courier_accepted','delivered'])result=dashboard.applyAction(o,result,{version:result.version,action,acknowledged:true,reference:'Synthetic confirmation',tracking:action==='courier_accepted'?'TRACK-123':''},'owner@example.com');
 assert.equal(result.stage,'delivered');assert.equal(result.tracking,'TRACK-123');assert.equal(result.events.length,4);assert.equal(result.events[0].by,'owner@example.com');assert.equal(op.version,0);
});
test('pickup has its own ready-and-collected flow',()=>{
 const o={...order(),fulfillmentMethod:'pickup'};let result=dashboard.blankOperations();
 for(const action of ['supplier_sent','supplier_accepted','pickup_ready','delivered'])result=dashboard.applyAction(o,result,{version:result.version,action,acknowledged:true},'owner@example.com');assert.equal(result.stage,'delivered');
});
test('manual receipts are limited to awaiting Orange Money and capture full order amount',()=>{
 const input={version:0,action:'confirm_payment',acknowledged:true,reference:'OM-RECEIPT'},op=dashboard.blankOperations(),o=order();
 assert.throws(()=>dashboard.applyAction({...o,status:'awaiting_payment'},op,input,'owner@example.com'),/Orange Money/);
 assert.throws(()=>dashboard.applyAction({...o,method:'orange_money',status:'awaiting_payment'},op,{...input,reference:''},'owner@example.com'),/référence|referência/);
 const result=dashboard.applyAction({...o,method:'orange_money',status:'awaiting_payment'},op,input,'owner@example.com');
 assert.equal(result.paymentConfirmation.amountCents,o.totalCents);assert.equal(result.paymentConfirmation.reference,'OM-RECEIPT');assert.equal(o.status,'paid');
 assert.throws(()=>dashboard.applyAction({...o,method:'orange_money',status:'awaiting_payment'},result,{...input,version:1},'owner@example.com'),/Orange Money/);
});
test('concurrent edits and oversized notes are rejected',()=>{
 const o=order(),op=dashboard.blankOperations();assert.throws(()=>dashboard.applyAction(o,op,{version:1,action:'note',notes:'text'},'owner@example.com'),/outra pessoa/);
 assert.throws(()=>dashboard.applyAction(o,op,{version:0,action:'note',notes:'x'.repeat(2001)},'owner@example.com'),/2000/);
 const saved=dashboard.applyAction(o,op,{version:0,action:'note',notes:'Supplier follow-up'},'owner@example.com');assert.equal(saved.notes,'Supplier follow-up');assert.equal(saved.stage,'new');
});
test('dashboard responses omit provider/session identifiers',()=>{const safe=dashboard.safeOrder(order());for(const key of ['sessionId','requestDigest','emailProviderId'])assert.equal(safe[key],undefined);});
test('dashboard page proxy prevents framing and never forwards credentials to static hosting',async()=>{
 const original=global.fetch;global.fetch=async(url,opts)=>{assert.equal(url,'https://jashe1728.github.io/asheerah-hair/gestao/');assert.equal(opts.headers,undefined);return new Response('<html></html>',{headers:{'content-type':'text/html'}});};
 try{const response=await dashboard.handlePage(new Request('https://asheerahhair.com/gestao/',{headers:{Cookie:'private-cookie'}}));assert.equal(response.status,200);assert.equal(response.headers.get('x-frame-options'),'DENY');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('cache-control'),'no-store');}finally{global.fetch=original;}
});
test('recent-order import excludes test notifications and marks its completed sweep',async()=>{
 const b=bucket(),env=envFor(b);await b.put('order-notifications/'+order().id+'.json',JSON.stringify(order()));await b.put('order-notifications/test.json',JSON.stringify({...order(),isTest:true,id:'22222222-2222-4222-8222-222222222222'}));
 await dashboard.backfill(env);assert.ok(b.data.has('business-backfill-complete'));assert.equal([...b.data.keys()].filter(k=>k.startsWith('business-orders/')).length,1);
});
