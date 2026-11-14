'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const dashboard=require('../backend/business-dashboard.cjs');
const mail=require('../backend/manual-paid-email.cjs');
test('explicit approval snapshots the reviewed order in the operations record',()=>{
 const order={version:1,manualRequestHash:'a'.repeat(64),id:'12345678-1234-1234-1234-123456789abc',method:'manual_dashboard',status:'awaiting_payment',totalCents:100,customer:{email:'original@example.com'}};
 const op=dashboard.applyAction(order,{version:0,stage:'new',events:[]},{version:0,action:'confirm_payment',acknowledged:true,reference:'ref',expectedOrderDigest:dashboard.safeOrder(order,null).orderDigest},'operator');
 const digest=dashboard.safeOrder(order,null).orderDigest;
 const approved=dashboard.applyAction(order,op,{version:1,action:'approve_paid_email',acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:'z'.repeat(32)},'operator');
 order.customer.email='changed@example.com';
 assert.equal(approved.paidEmail.confirmedSnapshot.customer.email,'original@example.com');
});
test('missing approval cannot be sealed and sender stays disabled with fake fetch',async()=>{
 let calls=0,reads=0;const env={WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long',RESEND_API_KEY:'fake',REVIEW_MEDIA:{get(){reads++;return null}}};
 const args={id:'12345678-1234-1234-1234-123456789abc',eventId:'event',leaseId:'lease',fetch:async()=>{calls++;}};
 assert.deepEqual(await mail.preparePaidEmail(env,args),{prepared:false});
 assert.deepEqual(await mail.sendClaimedPaidEmail(env,args),{status:'blocked'});
 assert.equal(calls,0);assert.equal(reads,1);
});
