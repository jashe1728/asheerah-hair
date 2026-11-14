'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const d=require('../backend/business-dashboard.cjs'),mail=require('../backend/manual-paid-email.cjs');
const {fixture}=require('../backend/preview-order-email.cjs');
function setup(){
 const order={...fixture,id:'11111111-1111-4111-8111-111111111111',version:1,manualRequestHash:'a'.repeat(64),method:'manual_dashboard',status:'awaiting_payment',totalCents:12345};
 const digest=d.safeOrder(order,null).orderDigest;
 let op=d.applyAction(order,d.blankOperations(),{version:0,action:'confirm_payment',acknowledged:true,reference:'receipt',expectedOrderDigest:digest},'owner');
 op=d.applyAction(order,op,{version:1,action:'approve_paid_email',acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:'x'.repeat(32)},'owner');
 Object.assign(op.paidEmail,{status:'claimed',leaseId:'one',claimedAt:'2026-11-14T00:00:00.000Z',expiresAt:'2026-11-14T00:05:00.000Z'});op.notes='preserve';
 const key='business-operations/'+order.id+'.json';let value=JSON.stringify(op),etag='1',writes=0;
 const bucket={async get(k){assert.equal(k,key,'must read only operations');return {etag,text:async()=>value}},async put(k,v,o){assert.equal(k,key);if(o.onlyIf.etagMatches!==etag)return null;value=v;etag=String(++writes+1);return {etag}}};
 return {order,key,bucket,get op(){return JSON.parse(value)},set op(v){value=JSON.stringify(v);etag+='x'},get writes(){return writes},args:{id:order.id,eventId:op.paidEmail.eventId,leaseId:'one',now:'2026-11-14T00:01:00Z'}};
}
test('seals approved snapshot in operations with digest and preserves fields',async()=>{
 const f=setup(),before=f.op,r=await mail.preparePaidEmail({REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'},f.args);assert.equal(r.prepared,true);const op=f.op,p=op.paidEmail;
 assert.equal(p.payload,r.payload);assert.equal(p.payloadDigest,crypto.createHash('sha256').update(p.payload).digest('hex'));assert.equal(op.notes,before.notes);assert.deepEqual(op.paymentConfirmation,before.paymentConfirmation);assert.deepEqual(p.confirmedSnapshot,before.paidEmail.confirmedSnapshot);assert.deepEqual(JSON.parse(p.payload).to,[f.order.customer.email]);assert.equal(f.writes,1);
});
test('rejects stale lease and invalid approval evidence without writes',async()=>{
 for(const mode of ['expired','lease','snapshot','hash','digest','amount']){const f=setup(),op=f.op;if(mode==='expired')f.args.now=op.paidEmail.expiresAt;if(mode==='lease')op.paidEmail.leaseId='other';if(mode==='snapshot')op.paidEmail.confirmedSnapshot.customer.email='attacker@example.invalid';if(mode==='hash')delete op.paidEmail.approvalKeyHash;if(mode==='digest')op.paymentConfirmation.orderDigest='0'.repeat(64);if(mode==='amount')op.paymentConfirmation.amountCents++;f.op=op;assert.deepEqual(await mail.preparePaidEmail({REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'},f.args),{prepared:false},mode);assert.equal(f.writes,0,mode)}
});
test('concurrent seal attempts have one CAS winner',async()=>{
 const f=setup(),results=await Promise.all([mail.preparePaidEmail({REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'},f.args),mail.preparePaidEmail({REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'},f.args)]);assert.equal(results.filter(r=>r.prepared).length,1);assert.equal(f.writes,1);
});
test('lease replacement during sealing cannot overwrite new claim',async()=>{
 const f=setup(),put=f.bucket.put;f.bucket.put=async(k,v,o)=>{const op=f.op;op.paidEmail.leaseId='other';op.notes='new';f.op=op;return put(k,v,o)};assert.deepEqual(await mail.preparePaidEmail({REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'},f.args),{prepared:false});assert.equal(f.op.paidEmail.leaseId,'other');assert.equal(f.op.notes,'new');assert.equal(f.writes,0);
});

test('rejects changed payload even when its digest is recomputed',async()=>{
 const f=setup(),env={REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'};assert.equal((await mail.preparePaidEmail(env,f.args)).prepared,true);const o=f.op;o.paidEmail.payload=JSON.stringify({to:['attacker@example.invalid']});o.paidEmail.payloadDigest=crypto.createHash('sha256').update(o.paidEmail.payload).digest('hex');f.op=o;assert.deepEqual(await mail.preparePaidEmail(env,f.args),{prepared:false});
});

test('binds snapshot and order identity even if storage digests are recomputed',async()=>{for(const mode of ['snapshot','order']){const f=setup(),env={REVIEW_MEDIA:f.bucket,WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long'};assert.equal((await mail.preparePaidEmail(env,f.args)).prepared,true);const o=f.op;if(mode==='snapshot')o.paidEmail.confirmedSnapshot.customer.email='attacker@example.invalid';else {o.paidEmail.confirmedSnapshot.id='22222222-2222-4222-8222-222222222222';f.args.id=o.paidEmail.confirmedSnapshot.id}o.paymentConfirmation.orderDigest=crypto.createHash('sha256').update(JSON.stringify(o.paidEmail.confirmedSnapshot)).digest('hex');if(mode==='order'){const original=f.bucket.get;f.bucket.get=async()=>original(f.key)}f.op=o;assert.deepEqual(await mail.preparePaidEmail(env,f.args),{prepared:false},mode)}});
test('missing secret fails closed before writing',async()=>{const f=setup();assert.deepEqual(await mail.preparePaidEmail({REVIEW_MEDIA:f.bucket},f.args),{prepared:false});assert.equal(f.writes,0)});
