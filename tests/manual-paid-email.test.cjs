'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {processPending}=require('../backend/manual-paid-email.cjs');

test('public sender remains disabled even when email flags and credentials are set',async()=>{
 const {sendClaimedPaidEmail}=require('../backend/manual-paid-email.cjs');
 let calls=0;const bucket={get(){throw Error('unexpected storage access')},put(){throw Error('unexpected storage write')}};
 const result=await sendClaimedPaidEmail({ORDER_EMAIL_ENABLED:'1',MANUAL_PAID_EMAIL_ENABLED:'1',RESEND_API_KEY:'fake',REVIEW_MEDIA:bucket},{id:'12345678-1234-1234-1234-123456789abc',eventId:'event',leaseId:'lease',fetch:async()=>{calls++}});
 assert.deepEqual(result,{status:'blocked'});assert.equal(calls,0);
});

test('discovery passes a supplied cursor and returns the next cursor without sending',async()=>{
 const seen=[],bucket={async list(opts){seen.push(opts);return {objects:[],truncated:true,cursor:'page-3'}},async get(){throw Error('unexpected read')}};
 const result=await processPending({ORDER_EMAIL_ENABLED:'1',REVIEW_MEDIA:bucket},{cursor:'page-2'});
 assert.equal(seen[0].cursor,'page-2');assert.deepEqual(result,{candidates:[],cursor:'page-3'});
});

test('disabled scheduler does not access storage',async()=>{
 await processPending({ORDER_EMAIL_ENABLED:'0',REVIEW_MEDIA:{list(){throw Error('unexpected storage access');}}});
});

test('unconfirmed operations cannot trigger a paid email',async()=>{
 let sends=0;
 const objects={'business-operations/12345678-1234-1234-1234-123456789abc.json':JSON.stringify({paidEmail:{status:'pending',eventId:'event',createdAt:'2026-11-14T00:00:00.000Z'}})};
 const bucket={async get(k){return objects[k]?{text:async()=>objects[k],etag:'1'}:null;},async list(){return {objects:Object.keys(objects).map(key=>({key})),truncated:false};},async put(){return {etag:'2'};}};
 const result=await processPending({ORDER_EMAIL_ENABLED:'1',REVIEW_MEDIA:bucket}, {send:async()=>{sends++;}});
 assert.deepEqual(result.candidates,[]);
 assert.equal(sends,0);
});

test('confirmed pending events are discovered in a bounded page',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const records={[`business-operations/${id}.json`]:{paymentConfirmation:{amountCents:100},paidEmail:{status:'pending',eventId:'event',createdAt:'2026-11-14T00:00:00Z'}},[`business-orders/${id}.json`]:{id,method:'manual_dashboard',status:'awaiting_payment',totalCents:100}};
 let sends=0;
 const bucket={async get(k){return records[k]?{text:async()=>JSON.stringify(records[k])}:null;},async list(o){assert.equal(o.limit,10);return {objects:[{key:`business-operations/${id}.json`}],truncated:true,cursor:'next'};},async put(){throw Error('read-only');}};
 assert.deepEqual(await processPending({ORDER_EMAIL_ENABLED:'1',REVIEW_MEDIA:bucket},{send:async()=>{sends++;}}),{candidates:[{id,eventId:'event'}],cursor:'next'});
 assert.equal(sends,0,'delivery remains disabled even for confirmed pending events');
});


test('claim writes a CAS lease while preserving unrelated fields',async()=>{
 const {claimPending}=require('../backend/manual-paid-email.cjs');
 const id='12345678-1234-1234-1234-123456789abc',key='business-operations/'+id+'.json';
 const op={version:4,notes:'keep',paymentConfirmation:{amountCents:100},paidEmail:{status:'pending',eventId:'event',createdAt:'2026-11-14T00:00:00Z',extra:'keep'}};
 const order={id,method:'manual_dashboard',status:'awaiting_payment',totalCents:100};
 let saved,options;const bucket={async get(k){return k===key?{etag:'etag-1',text:async()=>JSON.stringify(op)}:{text:async()=>JSON.stringify(order)}},async put(k,value,o){assert.equal(k,key);saved=JSON.parse(value);options=o;return {etag:'etag-2'}}};
 const result=await claimPending({REVIEW_MEDIA:bucket},{id,eventId:'event',leaseId:'lease-1',now:'2026-11-14T00:00:00.000Z'});
 assert.equal(result.claimed,true);assert.equal(options.onlyIf.etagMatches,'etag-1');
 assert.equal(saved.paidEmail.status,'claimed');assert.equal(saved.paidEmail.leaseId,'lease-1');assert.equal(saved.paidEmail.extra,'keep');assert.equal(saved.notes,'keep');assert.deepEqual(saved.paymentConfirmation,op.paymentConfirmation);
 assert.equal(saved.paidEmail.claimedAt,'2026-11-14T00:00:00.000Z');assert.equal(saved.paidEmail.expiresAt,'2026-11-14T00:05:00.000Z');
});

function claimFixture(){
 const id='12345678-1234-1234-1234-123456789abc',key='business-operations/'+id+'.json',orderKey='business-orders/'+id+'.json';
 const data=new Map([[key,{etag:'1',text:JSON.stringify({version:2,notes:'keep',paymentConfirmation:{amountCents:100},paidEmail:{status:'pending',eventId:'event',createdAt:'2026-11-14T00:00:00Z'}})}],[orderKey,{etag:'order',text:JSON.stringify({id,method:'manual_dashboard',status:'awaiting_payment',totalCents:100})}]]);
 let writes=0;
 const bucket={async get(k){const x=data.get(k);return x?{etag:x.etag,text:async()=>x.text}:null},async put(k,text,options){const current=data.get(k);if(options.onlyIf.etagMatches!==current?.etag)return null;writes++;data.set(k,{etag:'new-'+writes,text});return {etag:'new-'+writes}}};
 return {id,key,orderKey,data,bucket,get writes(){return writes}};
}

test('competing claims use CAS so exactly one wins',async()=>{
 const {claimPending}=require('../backend/manual-paid-email.cjs'),f=claimFixture();
 const args={id:f.id,eventId:'event',now:'2026-11-14T00:00:00Z'};
 const results=await Promise.all([claimPending({REVIEW_MEDIA:f.bucket},{...args,leaseId:'one'}),claimPending({REVIEW_MEDIA:f.bucket},{...args,leaseId:'two'})]);
 assert.deepEqual(results.map(x=>x.claimed).sort(),[false,true]);assert.equal(f.writes,1);
 assert.equal(JSON.parse(f.data.get(f.key).text).notes,'keep');
 assert.equal((await claimPending({REVIEW_MEDIA:f.bucket},{...args,leaseId:'three',now:'2027-01-01T00:00:00Z'})).claimed,false,'expired claims are not automatically reclaimed');
});

test('stale etag rejects claim without overwriting concurrent updates',async()=>{
 const {claimPending}=require('../backend/manual-paid-email.cjs'),f=claimFixture(),original=f.bucket.put;
 f.bucket.put=async(k,text,options)=>{const current=JSON.parse(f.data.get(k).text);current.notes='concurrent';f.data.set(k,{etag:'changed',text:JSON.stringify(current)});return original(k,text,options)};
 const result=await claimPending({REVIEW_MEDIA:f.bucket},{id:f.id,eventId:'event',leaseId:'one'});
 assert.equal(result.claimed,false);assert.equal(f.writes,0);assert.equal(JSON.parse(f.data.get(f.key).text).notes,'concurrent');
});

test('claim rejects unconfirmed, wrong event, non-manual, and mismatched amount without writes',async()=>{
 const {claimPending}=require('../backend/manual-paid-email.cjs');
 for(const scenario of ['unconfirmed','wrong-event','non-manual','amount','invalid-amount','missing-etag']){
  const f=claimFixture();const op=JSON.parse(f.data.get(f.key).text),order=JSON.parse(f.data.get(f.orderKey).text);
  if(scenario==='unconfirmed')delete op.paymentConfirmation;
  if(scenario==='wrong-event')op.paidEmail.eventId='other';
  if(scenario==='non-manual')order.method='orange_money';
  if(scenario==='amount')order.totalCents=101;
  if(scenario==='invalid-amount'){delete order.totalCents;delete op.paymentConfirmation.amountCents;}
  f.data.set(f.key,{etag:scenario==='missing-etag'?'':'1',text:JSON.stringify(op)});f.data.set(f.orderKey,{etag:'order',text:JSON.stringify(order)});
  assert.equal((await claimPending({REVIEW_MEDIA:f.bucket},{id:f.id,eventId:'event',leaseId:'one'})).claimed,false,scenario);assert.equal(f.writes,0,scenario);
 }
});


async function preparedFixture(){
 const f=claimFixture(),{fixture}=require('../backend/preview-order-email.cjs');
 f.data.set(f.orderKey,{etag:'order',text:JSON.stringify({...fixture,id:f.id,method:'manual_dashboard',status:'awaiting_payment',totalCents:100})});
 await require('../backend/manual-paid-email.cjs').claimPending({REVIEW_MEDIA:f.bucket},{id:f.id,eventId:'event',leaseId:'one',now:'2026-11-14T00:00:00Z'});
 const original=f.bucket.put;let creates=0;f.bucket.put=async(k,text,o)=>{if(o.onlyIf.etagDoesNotMatch==='*'){if(f.data.has(k))return null;creates++;f.data.set(k,{etag:'payload',text});return {etag:'payload'}}return original(k,text,o)};
 return {...f,get creates(){return creates}};
}

test('preparation rejects wrong, expired, unconfirmed or superseded claims',async()=>{
 const {preparePaidEmail}=require('../backend/manual-paid-email.cjs');
 for(const scenario of ['lease','event','expired','future','unconfirmed','status','amount']){
  const f=await preparedFixture(),args={id:f.id,eventId:'event',leaseId:'one',now:'2026-11-14T00:01:00Z'},op=JSON.parse(f.data.get(f.key).text);
  if(scenario==='lease')args.leaseId='other';if(scenario==='event')args.eventId='other';if(scenario==='expired')args.now='2026-11-14T00:05:00Z';if(scenario==='future')args.now='2026-11-13T23:59:59Z';
  if(scenario==='unconfirmed')delete op.paymentConfirmation;if(scenario==='status')op.paidEmail.status='pending';if(scenario==='amount')op.paymentConfirmation.amountCents=101;
  f.data.set(f.key,{etag:'changed',text:JSON.stringify(op)});
  assert.deepEqual(await preparePaidEmail({REVIEW_MEDIA:f.bucket},args),{prepared:false},scenario);assert.equal(f.creates,0,scenario);
 }
});


test('invalid first-attempt metadata fails closed without regenerating payload or sending',async()=>{
 const f=await preparedFixture(),m=require('../backend/manual-paid-email.cjs'),op=JSON.parse(f.data.get(f.key).text);op.paidEmail.firstAttemptAt='';f.data.set(f.key,{etag:'x',text:JSON.stringify(op)});let calls=0;
 const r=await m.sendClaimedPaidEmail({REVIEW_MEDIA:f.bucket,RESEND_API_KEY:'fake'},{id:f.id,eventId:'event',leaseId:'one',now:()=>new Date('2026-11-14T00:01:00Z'),fetch:async()=>{calls++}});assert.equal(calls,0);assert.notEqual(r.status,'accepted');
});
