'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const dashboard=require('../backend/business-dashboard.cjs');
const origin='https://example.invalid',token='a'.repeat(64);
function createBucket({onPut}={}){
 const data=new Map();let n=0;
 return {
  data,
  async get(k){const x=data.get(k);return x?{etag:x.etag,text:async()=>x.text}:null;},
  async put(k,text,o={}){
   if(onPut)await onPut(k,text,o);
   const x=data.get(k);
   if((o.onlyIf?.etagDoesNotMatch==='*'&&x)||(o.onlyIf?.etagMatches&&o.onlyIf.etagMatches!==x?.etag))return null;
   const etag=String(++n);data.set(k,{etag,text});return {etag};
  },
  async list({prefix}){return {objects:[...data.keys()].filter(k=>k.startsWith(prefix)).sort().map(key=>({key})),truncated:false};},
  async delete(k){data.delete(k);}
 };
}
function makeOrder(overrides={}){
 return {
  version:1,
  id:'64bada3c-2c23-49de-9576-351de7e56cad',
  createdAt:'2026-11-15T12:00:00.000Z',
  method:'manual_dashboard',
  status:'awaiting_payment',
  manualRequestHash:'a'.repeat(64),
  language:'pt',
  totalCents:12345,
  subtotalCents:12345,
  discountCents:0,
  shippingCents:0,
  fulfillmentMethod:'pickup',
  fulfillmentAddress:'Midana Beauty',
  customer:{name:'Alice',email:'alice@example.invalid',phone:'+351 900 000 000'},
  items:[{title:'Wig',variant:'Long',qty:1,unitCents:12345}],
  ...overrides
 };
}
async function setupBackend(orderOverrides={},op=null,bucketOpts={}){
 const bucket=createBucket(bucketOpts);
 const order=makeOrder(orderOverrides);
 await bucket.put('management-auth/sessions/'+crypto.createHash('sha256').update(token).digest('hex')+'.json',JSON.stringify({email:'owner@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:15,expiresAt:Date.now()+60000}));
 await bucket.put('business-orders/'+order.id+'.json',JSON.stringify(order));
 if(op)await bucket.put('business-operations/'+order.id+'.json',JSON.stringify(op));
 const env={REVIEW_MEDIA:bucket,MANAGEMENT_ALLOWED_EMAILS:'owner@example.invalid',MANAGEMENT_HISTORY_CUTOFF:'2026-10-23T13:18:28Z',MANUAL_PAID_SCHEDULER_ENABLED:'1',ORDER_EMAIL_ENABLED:'1'};
 const post=(body,{hdrs={},id=order.id}={})=>dashboard.handle(new Request(origin+'/management-api/orders/'+id,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-ah_management='+token,...hdrs},body:JSON.stringify(body)}),env);
 const getOrders=()=>dashboard.handle(new Request(origin+'/management-api/orders',{headers:{Cookie:'__Host-ah_management='+token}}),env);
 return {bucket,order,env,post,getOrders,digest:dashboard.safeOrder(order,op,env).orderDigest};
}
function setupUI(initialOrders=[],env,bucket){
 const elements=new Map(),requests=[];
 class Element{
  constructor(id=''){this.id=id;this.dataset={};const classes=new Set();this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle(){}};this.value='';this.hidden=false;this.disabled=false;this.open=false;this.innerHTML='';this.textContent='';this.elements={fulfillmentMethod:{value:'delivery'}};}
  addEventListener(name,fn){this['on'+name]=fn;}
  querySelector(selector){
   if(this.id==='detail'&&selector==='.detail-actions'){
    return this._actions||(this._actions={before:()=>{},append:()=>{},insertAdjacentHTML:(_where,html)=>{this.innerHTML+=html;}});
   }
   return new Element();
  }
  querySelectorAll(){return [];}
  insertAdjacentHTML(_where,html){this.innerHTML+=html;}
  before(){} after(){} closest(){return new Element();} append(){} replaceChildren(){} setAttribute(){} getAttribute(){return null;}
  showModal(){this.open=true;} close(){this.open=false;} focus(){} reset(){} cloneNode(){return new Element();}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 const document={getElementById:get,createElement:()=>new Element(),querySelector:()=>new Element(),querySelectorAll:()=>[],body:new Element()};
 const context={
  document,
  location:{hostname:'example.invalid',search:'',origin},
  URL,URLSearchParams,Intl,Date,Uint8Array,crypto:crypto.webcrypto,structuredClone,console,
  setTimeout:()=>0,clearTimeout(){},setInterval(){},matchMedia:()=>({matches:false}),localStorage:{},navigator:{},
  window:{AHSession:{start:async()=>{}},AHManualOrder:{createManualController:()=>({reset(){}})}},
  fetch:async(reqPath,init)=>{
   const body=init?.body?JSON.parse(init.body):null;
   requests.push({path:reqPath,body});
   return dashboard.handle(new Request(origin+reqPath,{...init,headers:{...init?.headers,Origin:origin,Cookie:'__Host-ah_management='+token}}),env);
  }
 };
 let src=fs.readFileSync(path.join(__dirname,'../gestao/dashboard.js'),'utf8');
 src=src.replace('load();setInterval(','window.__test={state,openOrder,renderDetail,beginAction,render};setInterval(');
 vm.runInNewContext(src,context);
 const ui=context.window.__test;
 ui.state.orders=initialOrders;
 return {ui,get,requests,bucket};
}

test('unpaid manual order removal deletes order and operations (even after internal note) and excludes it from orders list',async()=>{
 for(const withNote of [false,true]){
  const x=await setupBackend();
  let version=0;
  if(withNote){
   const noteRes=await x.post({version:0,action:'note',notes:'Cliente desistiu antes de pagar'});
   assert.equal(noteRes.status,200);
   version=1;
  }
  const removeRes=await x.post({version,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest});
  assert.equal(removeRes.status,200);
  const body=await removeRes.json();
  assert.deepEqual(body,{removed:true,id:x.order.id});
  assert.equal(await x.bucket.get('business-orders/'+x.order.id+'.json'),null);
  assert.equal(await x.bucket.get('business-operations/'+x.order.id+'.json'),null);
  const listed=await (await x.getOrders()).json();
  assert.equal(listed.orders.length,0);
  const retryRes=await x.post({version,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest});
  assert.equal(retryRes.status,404);
 }
});

test('removed marker hides order from GET /orders and blocks POST even if delete has not completed yet',async()=>{
 const order=makeOrder();
 const removedOp={version:1,stage:'new',notes:'',tracking:'',events:[{action:'remove_manual_order',at:'2026-11-15T12:05:00.000Z',by:'owner@example.invalid',stage:'new',reference:''}],removed:true,removedAt:'2026-11-15T12:05:00.000Z',removedBy:'owner@example.invalid'};
 const x=await setupBackend({},removedOp);
 const listed=await (await x.getOrders()).json();
 assert.equal(listed.orders.length,0);
 const postRes=await x.post({version:1,action:'confirm_payment',acknowledged:true,reference:'late',expectedOrderDigest:x.digest});
 assert.equal(postRes.status,404);
 assert.throws(()=>dashboard.applyAction(order,removedOp,{version:1,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest},'owner@example.invalid'),/removida/i);
});

test('strict boundary rejections forbid removing non-manual, paid, email-approved, staged, unacknowledged, invalid-digest, wrong-version, unauthenticated, or cross-origin requests',async()=>{
 // Non-manual methods
 for(const method of ['stripe','orange_money']){
  const x=await setupBackend({method,status:'awaiting_payment'});
  const r=await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest});
  assert.equal(r.status,409,method);
  assert.ok(await x.bucket.get('business-orders/'+x.order.id+'.json'));
 }
 // Paid via status or paymentConfirmation
 {
  const x=await setupBackend({status:'paid'});
  const r=await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest});
  assert.equal(r.status,409);
  assert.ok(await x.bucket.get('business-orders/'+x.order.id+'.json'));
 }
 {
  const order=makeOrder();
  const digest=dashboard.safeOrder(order,null).orderDigest;
  const paidOp=dashboard.applyAction(order,dashboard.blankOperations(order),{version:0,action:'confirm_payment',acknowledged:true,reference:'bank',expectedOrderDigest:digest},'owner');
  const x=await setupBackend({},paidOp);
  const r=await x.post({version:1,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:digest});
  assert.equal(r.status,409);
  assert.ok(await x.bucket.get('business-orders/'+order.id+'.json'));
 }
 // paidEmail present or stage advanced / needs_review
 {
  const order=makeOrder();
  const digest=dashboard.safeOrder(order,null).orderDigest;
  const opWithEmail={...dashboard.blankOperations(order),paidEmail:{status:'pending'}};
  const x=await setupBackend({},opWithEmail);
  assert.equal((await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:digest})).status,409);
  assert.ok(await x.bucket.get('business-orders/'+order.id+'.json'));
 }
 for(const stage of ['needs_review','supplier_sent']){
  const x=await setupBackend({},{version:0,stage,notes:'',tracking:'',events:[]});
  assert.equal((await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest})).status,409,stage);
  assert.ok(await x.bucket.get('business-orders/'+x.order.id+'.json'));
 }
 // Unacknowledged, wrong version, wrong/missing digest
 {
  const x=await setupBackend();
  assert.equal((await x.post({version:0,action:'remove_manual_order',acknowledged:false,expectedOrderDigest:x.digest})).status,409);
  assert.equal((await x.post({version:1,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest})).status,409);
  assert.equal((await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:'0'.repeat(64)})).status,409);
  assert.equal((await x.post({version:0,action:'remove_manual_order',acknowledged:true})).status,409);
  assert.ok(await x.bucket.get('business-orders/'+x.order.id+'.json'));
 }
 // Unauthenticated & cross-origin
 {
  const x=await setupBackend();
  const unauth=await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest},{hdrs:{Cookie:'__Host-ah_management='+'b'.repeat(64)}});
  assert.equal(unauth.status,401);
  const cross=await x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest},{hdrs:{Origin:'https://evil.invalid'}});
  assert.equal(cross.status,403);
  assert.ok(await x.bucket.get('business-orders/'+x.order.id+'.json'));
 }
});

test('concurrent confirm_payment and remove_manual_order at version 0 serialize via CAS so paid order stays intact',async()=>{
 let releaseRemove,markConfirmWrote;
 const confirmWrote=new Promise(r=>markConfirmWrote=r);
 const removeGate=new Promise(r=>releaseRemove=r);
 const x=await setupBackend({},null,{
  async onPut(k,text){
   if(k.startsWith('business-operations/')){
    const parsed=JSON.parse(text);
    if(parsed.paymentConfirmation)markConfirmWrote();
    if(parsed.removed)await removeGate;
   }
  }
 });
 const confirmReq=x.post({version:0,action:'confirm_payment',acknowledged:true,reference:'bank',expectedOrderDigest:x.digest});
 await confirmWrote;
 const removeReq=x.post({version:0,action:'remove_manual_order',acknowledged:true,expectedOrderDigest:x.digest});
 releaseRemove();
 const [confirmRes,removeRes]=await Promise.all([confirmReq,removeReq]);
 assert.equal(confirmRes.status,200);
 assert.equal(removeRes.status,409);
 assert.ok(await x.bucket.get('business-orders/'+x.order.id+'.json'));
 const op=JSON.parse(await (await x.bucket.get('business-operations/'+x.order.id+'.json')).text());
 assert.equal(op.paymentConfirmation.reference,'bank');
 assert.equal(op.removed,undefined);
});

test('dashboard UI shows remove action only for unpaid manual orders and removes order on confirmation',async()=>{
 const x=await setupBackend();
 const manualUnpaid=dashboard.safeOrder(x.order,null,x.env);
 const manualPaid=dashboard.safeOrder(makeOrder({id:'22222222-2222-4222-8222-222222222222'}),dashboard.applyAction(makeOrder({id:'22222222-2222-4222-8222-222222222222'}),dashboard.blankOperations(),{version:0,action:'confirm_payment',acknowledged:true,reference:'ref',expectedOrderDigest:dashboard.safeOrder(makeOrder({id:'22222222-2222-4222-8222-222222222222'}),null).orderDigest},'owner'),x.env);
 const orangeUnpaid=dashboard.safeOrder(makeOrder({id:'33333333-3333-4333-8333-333333333333',method:'orange_money',status:'awaiting_payment'}),null,x.env);
 const stripeUnpaid=dashboard.safeOrder(makeOrder({id:'44444444-4444-4444-8444-444444444444',method:'stripe',status:'pending_checkout'}),null,x.env);
 const uiHarness=setupUI([manualUnpaid,manualPaid,orangeUnpaid,stripeUnpaid],x.env,x.bucket);

 for(const ineligible of [manualPaid,orangeUnpaid,stripeUnpaid]){
  uiHarness.ui.openOrder(ineligible.id);
  assert.doesNotMatch(uiHarness.get('detail').innerHTML,/data-action="remove_manual_order"/,ineligible.method);
  uiHarness.ui.beginAction('remove_manual_order');
  assert.equal(uiHarness.get('actionDialog').open,false,ineligible.method);
 }

 uiHarness.ui.openOrder(manualUnpaid.id);
 assert.match(uiHarness.get('detail').innerHTML,/data-action="remove_manual_order"/);
 uiHarness.ui.beginAction('remove_manual_order');
 assert.equal(uiHarness.get('actionDialog').open,true);
 assert.equal(uiHarness.get('paidEmailReview').hidden,false);
 assert.equal(uiHarness.get('referenceLabel').hidden,true);
 assert.match(uiHarness.get('paidEmailReview').innerHTML,/Encomenda:<\/strong> #E7E56CAD/);
 assert.ok(!uiHarness.get('paidEmailReview').innerHTML.includes(manualUnpaid.id));

 uiHarness.get('actionAcknowledged').checked=true;
 await uiHarness.get('actionForm').onsubmit({preventDefault(){}});
 assert.equal(uiHarness.requests.length,1);
 assert.equal(uiHarness.requests[0].path,'/management-api/orders/'+manualUnpaid.id);
 const sent=uiHarness.requests[0].body;
 assert.equal(sent.action,'remove_manual_order');
 assert.equal(sent.version,0);
 assert.equal(sent.acknowledged,true);
 assert.equal(sent.expectedOrderDigest,manualUnpaid.orderDigest);
 assert.equal(uiHarness.ui.state.orders.some(o=>o.id===manualUnpaid.id),false);
 assert.equal(uiHarness.ui.state.selected,null);
 assert.equal(uiHarness.get('orderDialog').open,false);
 assert.equal(uiHarness.get('actionDialog').open,false);
 assert.equal(await x.bucket.get('business-orders/'+manualUnpaid.id+'.json'),null);
});
