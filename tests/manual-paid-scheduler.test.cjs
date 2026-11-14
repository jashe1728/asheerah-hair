'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runScheduledPaidEmail}=require('../backend/manual-paid-email.cjs');

test('scheduler is off by default and does not touch storage',async()=>{
 const result=await runScheduledPaidEmail({REVIEW_MEDIA:{get(){throw Error('storage')}}},{process:async()=>{throw Error('callback')}});
 assert.deepEqual(result,{status:'disabled'});
});
function fixture(){
 const crypto=require('node:crypto'),data=new Map(),pages=[];let version=0;
 for(let i=0;i<12;i++){
  const id=`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`,key=`business-operations/${id}.json`;
  const snapshot={id,method:'manual_dashboard',version:1,status:'awaiting_payment',manualRequestHash:'a'.repeat(64),totalCents:100,customer:{email:'private@example.com'}};
  const paymentConfirmation={amountCents:100,orderDigest:crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')};
  data.set(key,{value:JSON.stringify({paymentConfirmation,paidEmail:{status:'pending',eventId:`event-${i}`,createdAt:'2026-11-14T00:00:00Z',approvalKeyHash:'b'.repeat(64),confirmedSnapshot:snapshot}}),etag:'op'});
  data.set(`business-orders/${id}.json`,{value:JSON.stringify(snapshot),etag:'order'});pages.push({key});
 }
 const bucket={async list({cursor,limit}){assert.equal(limit,10);const start=cursor?Number(cursor):0;return {objects:pages.slice(start,start+limit),truncated:start+limit<pages.length,cursor:String(start+limit)}},async get(key){const x=data.get(key);return x?{etag:x.etag,text:async()=>x.value}:null},async put(key,value,options){const old=data.get(key);if(options.onlyIf.etagMatches!==undefined&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf.etagDoesNotMatch==='*'&&old)return null;data.set(key,{value,etag:String(++version)});return {etag:String(version)}}};
 return {bucket,data,pages,env:{ORDER_EMAIL_ENABLED:'1',MANUAL_PAID_SCHEDULER_ENABLED:'1',REVIEW_MEDIA:bucket}};
}
test('durable pages wrap and failures do not starve later candidates',async()=>{
 const f=fixture(),seen=[];const callback=async({id})=>{seen.push(id);if(seen.length===1)throw Error('secret')};
 for(let i=0;i<3;i++)assert.equal((await runScheduledPaidEmail(f.env,{process:callback})).status,'ok');
 assert.equal(seen.length,22);assert.equal(new Set(seen).size,12);assert.equal(seen[0],seen[12]);
});
test('storage errors do not advance cursor or expose error contents',async()=>{
 const f=fixture(),orig=f.bucket.list;f.bucket.list=async()=>{throw Error('secret')};
 assert.deepEqual(await runScheduledPaidEmail(f.env,{process:async()=>{}}),{status:'error'});
 f.bucket.list=orig;let count=0;await runScheduledPaidEmail(f.env,{process:async()=>{count++}});assert.equal(count,10);
});
test('invalid approval and snapshot bindings are skipped',async()=>{
 const f=fixture();for(const [i,change] of [[0,o=>delete o.paidEmail.approvalKeyHash],[1,o=>delete o.paidEmail.confirmedSnapshot],[2,o=>delete o.paymentConfirmation],[3,o=>o.paymentConfirmation.orderDigest='bad']]){const key=f.pages[i].key,entry=f.data.get(key),op=JSON.parse(entry.value);change(op);entry.value=JSON.stringify(op)}
 let count=0;await runScheduledPaidEmail(f.env,{process:async()=>{count++}});assert.equal(count,6);
});
