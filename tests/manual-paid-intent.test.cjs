const test=require('node:test');
const assert=require('node:assert/strict');
const dashboard=require('../backend/business-dashboard.cjs');
const order={version:1,manualRequestHash:'a'.repeat(64),id:'11111111-1111-4111-8111-111111111111',method:'manual_dashboard',status:'awaiting_payment',totalCents:12345};
const input={version:0,action:'confirm_payment',acknowledged:true,reference:'receipt',expectedOrderDigest:dashboard.safeOrder(order,null).orderDigest};
test('manual confirmation records the digest without creating an email intent',()=>{
 const previous={...dashboard.blankOperations(),notes:'keep',custom:'keep'};
 const op=dashboard.applyAction(order,previous,input,'owner','2026-01-02T03:04:05.000Z');
 assert.equal(op.paidEmail,undefined);assert.equal(op.paymentConfirmation.orderDigest,input.expectedOrderDigest);
 assert.equal(op.paymentConfirmation.amountCents,12345);assert.equal(op.notes,'keep');assert.equal(op.custom,'keep');assert.equal(previous.paidEmail,undefined);
});
test('safe order exposes only paid email status, not delivery metadata',()=>{
 const op={...dashboard.blankOperations(),paidEmail:{status:'pending',eventId:'private-event',createdAt:'date',providerId:'private'}};
 const safe=dashboard.safeOrder(order,op);assert.deepEqual(safe.operations.paidEmail,{status:'pending'});assert.equal(op.paidEmail.providerId,'private');
});
test('invalid, unacknowledged, already paid, and non-manual actions never create intents',()=>{
 const op=dashboard.blankOperations();
 for(const [o,i] of [[order,{...input,acknowledged:false}],[order,{...input,reference:'  '}],[{...order,status:'paid'},input],[order,{...input,version:3}]]){
  assert.throws(()=>dashboard.applyAction(o,op,i,'owner'));assert.equal(op.paidEmail,undefined);
 }
 const orange=dashboard.applyAction({...order,method:'orange_money'},op,input,'owner');assert.equal(orange.paidEmail,undefined);
 const note=dashboard.applyAction(order,op,{version:0,action:'note',notes:'keep'},'owner');assert.equal(note.paidEmail,undefined);
 const paid=dashboard.applyAction(order,op,input,'owner');assert.throws(()=>dashboard.applyAction(order,paid,{...input,version:1},'owner'));
 const progressed=dashboard.applyAction(order,paid,{version:1,action:'supplier_sent',acknowledged:true},'owner');assert.deepEqual(progressed.paidEmail,paid.paidEmail);
});
test('concurrent authenticated confirmations commit one whole operation by CAS',async()=>{
 const crypto=require('node:crypto'),data=new Map();let n=0,writes=[];
 const bucket={async get(k){const x=data.get(k);return x?{etag:x.etag,text:async()=>x.text}:null},async put(k,text,o={}){const x=data.get(k);if(o.onlyIf?.etagDoesNotMatch==='*'&&x||o.onlyIf?.etagMatches&&o.onlyIf.etagMatches!==x?.etag)return null;const etag=String(++n);data.set(k,{etag,text});if(k.startsWith('business-operations/'))writes.push(JSON.parse(text));return {etag}}};
 const token='a'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
 await bucket.put('management-auth/sessions/'+hash+'.json',JSON.stringify({email:'owner@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:15,expiresAt:Date.now()+60000}));
 await bucket.put('business-orders/'+order.id+'.json',JSON.stringify(order));
 const env={REVIEW_MEDIA:bucket,MANAGEMENT_ALLOWED_EMAILS:'owner@example.invalid'},origin='https://example.invalid';
 const request=()=>new Request(origin+'/management-api/orders/'+order.id,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-ah_management='+token},body:JSON.stringify(input)});
 const results=await Promise.all([dashboard.handle(request(),env),dashboard.handle(request(),env)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(writes.length,1);const saved=writes[0];assert.equal(saved.paidEmail,undefined);assert.equal(saved.paymentConfirmation.orderDigest,input.expectedOrderDigest);assert.equal(saved.events.length,1);
 const response=await results.find(r=>r.status===200).json();assert.equal(response.order.operations.paidEmail,undefined);
 assert.deepEqual([...data.keys()].filter(k=>!k.startsWith('management-auth/')).sort(),['business-operations/'+order.id+'.json','business-orders/'+order.id+'.json']);
});
