'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dashboard=require('../backend/business-dashboard.cjs');
const id='11111111-1111-4111-8111-111111111111';
function bucket(){const data=new Map();let n=0;return {data,async get(k){const x=data.get(k);return x?{etag:x.etag,text:async()=>x.text}:null},async put(k,text,o={}){const x=data.get(k);if(o.onlyIf?.etagDoesNotMatch==='*'&&x||o.onlyIf?.etagMatches&&o.onlyIf.etagMatches!==x?.etag)return null;const etag=String(++n);data.set(k,{etag,text});return {etag}}}}
const order={version:1,id,manualRequestHash:'a'.repeat(64),method:'manual_dashboard',status:'awaiting_payment',totalCents:100,customer:{email:'original@example.com'}};
test('stale reviewed order is rejected before confirmation',async()=>{
 const b=bucket(),token='a'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex'),origin='https://example.invalid';
 await b.put('management-auth/sessions/'+hash+'.json',JSON.stringify({email:'owner@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:15,expiresAt:Date.now()+60000}));
 const reviewed=dashboard.safeOrder(order,null);await b.put('business-orders/'+id+'.json',JSON.stringify({...order,customer:{email:'changed@example.com'}}));
 const req=new Request(origin+'/management-api/orders/'+id,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-ah_management='+token},body:JSON.stringify({version:0,action:'confirm_payment',acknowledged:true,reference:'ref',expectedOrderDigest:reviewed.orderDigest})});
 const res=await dashboard.handle(req,{REVIEW_MEDIA:b,MANAGEMENT_ALLOWED_EMAILS:'owner@example.invalid'});assert.equal(res.status,409);assert.equal(await b.get('business-operations/'+id+'.json'),null);
});
test('persistOrder cannot overwrite an existing manual order',async()=>{
 const b=bucket();await b.put('business-orders/'+id+'.json',JSON.stringify(order));
 await assert.rejects(dashboard.persistOrder({MANAGEMENT_CAPTURE_ENABLED:'1',REVIEW_MEDIA:b},{id,method:'stripe',totalCents:999}));
 assert.deepEqual(JSON.parse(await (await b.get('business-orders/'+id+'.json')).text()),order);
});
test('manual confirmation requires a digest and a create-only manual snapshot',()=>{
 const base={version:0,stage:'new',events:[]},input={version:0,action:'confirm_payment',acknowledged:true,reference:'ref'};
 assert.throws(()=>dashboard.applyAction(order,base,input,'owner'));
 const legacy={...order};delete legacy.manualRequestHash;
 assert.throws(()=>dashboard.applyAction(legacy,base,{...input,expectedOrderDigest:dashboard.safeOrder(order,null).orderDigest},'owner'));
 const op=dashboard.applyAction(order,base,{...input,expectedOrderDigest:dashboard.safeOrder(order,null).orderDigest},'owner');
 assert.equal(op.paidEmail,undefined);assert.equal(op.paymentConfirmation.orderDigest,dashboard.safeOrder(order,null).orderDigest);
});
test('persistOrder cannot introduce manual snapshots through its update path',async()=>{
 const b=bucket();await assert.rejects(dashboard.persistOrder({MANAGEMENT_CAPTURE_ENABLED:'1',REVIEW_MEDIA:b},order));
 assert.equal(await b.get('business-orders/'+id+'.json'),null);
});
