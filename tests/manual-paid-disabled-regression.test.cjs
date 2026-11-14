'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mail=require('../backend/manual-paid-email.cjs');

const id='12345678-1234-1234-1234-123456789abc';
test('concurrent delivery invocations fail closed without storage or network',async()=>{
 let accesses=0,sends=0;
 const env={ORDER_EMAIL_ENABLED:'1',RESEND_API_KEY:'fake',REVIEW_MEDIA:{get(){accesses++;throw Error('unexpected storage access')},put(){accesses++;throw Error('unexpected storage access')}}};
 const args={id,eventId:'approved-event',leaseId:'lease',fetch:async()=>{sends++;throw Error('unexpected send')}};
 const results=await Promise.all(Array.from({length:25},()=>mail.sendClaimedPaidEmail(env,args)));
 assert.ok(results.every(result=>result.status==='blocked'));
 assert.equal(accesses,0);assert.equal(sends,0);
});
test('payload preparation rejects missing approval records without writes',async()=>{
 let accesses=0;
 const env={WORKER_GAS_SECRET:'test-secret-at-least-32-characters-long',REVIEW_MEDIA:{get(){accesses++;return null},put(){throw Error('unexpected write')}}};
 for(const eventId of ['', 'pending', 'approved-event']){
  assert.deepEqual(await mail.preparePaidEmail(env,{id,eventId,leaseId:'lease'}),{prepared:false});
 }
 assert.equal(accesses,2);
});
