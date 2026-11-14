'use strict';

// Delivery requires both flags and an explicitly injected transport; no default network.
const ID=/^[a-f0-9-]{36}$/i;
const crypto=require('node:crypto');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
// Version 1 derives an isolated key from a server secret, never from storage.
function envelopeTag(env,id,eventId,snapshot,payload,digest,version=1,keyVersion=1){
  if(typeof env?.WORKER_GAS_SECRET!=='string'||!env.WORKER_GAS_SECRET.trim()||version!==1||keyVersion!==1)return null;
  const key=crypto.createHmac('sha256',env.WORKER_GAS_SECRET).update('asheerah/manual-paid-email/key/v1').digest();
  return crypto.createHmac('sha256',key).update(JSON.stringify(['asheerah/manual-paid-email/envelope',version,keyVersion,id,eventId,sha(JSON.stringify(snapshot)),snapshot.customer.email,digest,payload])).digest('hex');
}
function verifyEnvelope(env,id,eventId,c){
  try{
    const e=c.envelope,payload=c.payload,digest=c.payloadDigest;
    if(!e||Object.keys(e).sort().join(',')!=='keyVersion,schemaVersion,tag'||e.schemaVersion!==1||e.keyVersion!==1||typeof e.tag!=='string'||!/^[a-f0-9]{64}$/.test(e.tag)||typeof payload!=='string'||typeof digest!=='string'||sha(payload)!==digest)return false;
    const p=JSON.parse(payload),keys=Object.keys(p).sort().join(',');
    if(keys!=='attachments,from,html,reply_to,subject,text,to'||!Array.isArray(p.to)||p.to.length!==1||p.to[0]!==c.confirmedSnapshot.customer.email)return false;
    const tag=envelopeTag(env,id,eventId,c.confirmedSnapshot,payload,digest,e.schemaVersion,e.keyVersion);
    return !!tag&&crypto.timingSafeEqual(Buffer.from(tag,'hex'),Buffer.from(e.tag,'hex'));
  }catch{return false}
}
async function processPending(env,{cursor}={}) {
  if(env.ORDER_EMAIL_ENABLED!=='1'||!env.REVIEW_MEDIA)return {candidates:[],cursor:null};
  const bucket=env.REVIEW_MEDIA;
  const batch=await bucket.list({prefix:'business-operations/',limit:10,...(cursor?{cursor}:{})});
  const candidates=[];
  for(const item of batch.objects){
    const id=item.key.slice('business-operations/'.length,-'.json'.length);
    if(!item.key.endsWith('.json')||!ID.test(id))continue;
    const object=await bucket.get(item.key);
    if(!object)continue;
    let op;try{op=JSON.parse(await object.text());}catch{continue;}
    if(!op.paymentConfirmation||op.paidEmail?.status!=='pending'||typeof op.paidEmail.eventId!=='string'||!op.paidEmail.eventId||!op.paidEmail.createdAt)continue;
    const saved=await bucket.get('business-orders/'+id+'.json');
    if(!saved)continue;
    let order;try{order=JSON.parse(await saved.text());}catch{continue;}
    if(order.id!==id||order.method!=='manual_dashboard'||order.status!=='awaiting_payment'||op.paymentConfirmation.amountCents!==order.totalCents)continue;
    candidates.push({id,eventId:op.paidEmail.eventId});
  }
  return {candidates,cursor:batch.truncated?batch.cursor:null};
}
async function claimPending(env,{id,eventId,leaseId,now=new Date().toISOString()}={}) {
  if(!env.REVIEW_MEDIA||typeof id!=='string'||!ID.test(id)||typeof eventId!=='string'||!eventId||typeof leaseId!=='string'||!leaseId||typeof now!=='string'||!Number.isFinite(Date.parse(now)))return {claimed:false};
  const bucket=env.REVIEW_MEDIA,key='business-operations/'+id+'.json';
  const current=await bucket.get(key);
  if(!current||typeof current.etag!=='string'||!current.etag)return {claimed:false};
  let op;try{op=JSON.parse(await current.text());}catch{return {claimed:false};}
  if(!op||!op.paymentConfirmation||op.paidEmail?.status!=='pending'||op.paidEmail.eventId!==eventId||!op.paidEmail.createdAt)return {claimed:false};
  const saved=await bucket.get('business-orders/'+id+'.json');
  if(!saved)return {claimed:false};
  let order;try{order=JSON.parse(await saved.text());}catch{return {claimed:false};}
  if(!order||order.id!==id||order.method!=='manual_dashboard'||order.status!=='awaiting_payment'||!Number.isSafeInteger(order.totalCents)||order.totalCents<0||op.paymentConfirmation.amountCents!==order.totalCents)return {claimed:false};
  const claimedAt=new Date(now).toISOString(),expiresAt=new Date(Date.parse(now)+300000).toISOString();
  const updated={...op,paidEmail:{...op.paidEmail,status:'claimed',leaseId,claimedAt,expiresAt}};
  const written=await bucket.put(key,JSON.stringify(updated),{onlyIf:{etagMatches:current.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  return {claimed:!!written};
}
// Seal only the explicitly approved snapshot into the same CAS-protected record.
async function preparePaidEmail(env,{id,eventId,leaseId,now=new Date().toISOString()}={}) {
  const start=Date.parse(now),tick=performance.now();
  if(!env?.REVIEW_MEDIA||typeof env.WORKER_GAS_SECRET!=='string'||!env.WORKER_GAS_SECRET.trim()||typeof id!=='string'||!ID.test(id)||typeof eventId!=='string'||!eventId||typeof leaseId!=='string'||!leaseId||typeof now!=='string'||!Number.isFinite(start))return {prepared:false};
  const bucket=env.REVIEW_MEDIA,key='business-operations/'+id+'.json',obj=await bucket.get(key);
  if(!obj?.etag)return {prepared:false};
  let op;try{op=JSON.parse(await obj.text())}catch{return {prepared:false}}
  const c=op?.paidEmail,order=c?.confirmedSnapshot,confirmation=op?.paymentConfirmation;
  const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
  const active=()=>Number.isFinite(Date.parse(c?.claimedAt))&&Number.isFinite(Date.parse(c?.expiresAt))&&Date.parse(c.expiresAt)>Date.parse(c.claimedAt)&&start+performance.now()-tick>=Date.parse(c.claimedAt)&&start+performance.now()-tick<Date.parse(c.expiresAt);
  if(!confirmation||c?.status!=='claimed'||c.eventId!==eventId||c.leaseId!==leaseId||!Number.isFinite(Date.parse(c.createdAt))||!active()||!/^[a-f0-9]{64}$/.test(c.approvalKeyHash||'')||!order||order.id!==id||order.method!=='manual_dashboard'||order.version!==1||!/^[a-f0-9]{64}$/.test(order.manualRequestHash||'')||order.status!=='awaiting_payment'||!Number.isSafeInteger(order.totalCents)||order.totalCents<0||confirmation.amountCents!==order.totalCents||confirmation.orderDigest!==hash(JSON.stringify(order))||typeof order.customer?.email!=='string'||!order.customer.email.trim())return {prepared:false};
  if(Object.hasOwn(c,'payload')||Object.hasOwn(c,'payloadDigest')||Object.hasOwn(c,'envelope')){
    if(!verifyEnvelope(env,id,eventId,c))return {prepared:false};
    return {prepared:true,payload:c.payload};
  }
  if(Object.hasOwn(c,'firstAttemptAt'))return {prepared:false};
  const {renderEmail,makePdf,FROM,REPLY}=require('./order-email.cjs');
  const paidOrder={...order,status:'paid'},email=renderEmail(paidOrder),pdf=await makePdf(paidOrder);
  const payload=JSON.stringify({from:FROM,to:[order.customer.email],reply_to:REPLY,...email,attachments:[{filename:'Asheerah-Hair-'+id+'.pdf',content:Buffer.from(pdf).toString('base64')}]});
  if(!active())return {prepared:false};
  const payloadDigest=hash(payload),envelope={schemaVersion:1,keyVersion:1,tag:envelopeTag(env,id,eventId,order,payload,payloadDigest)};
  if(!verifyEnvelope(env,id,eventId,{...c,payload,payloadDigest,envelope}))return {prepared:false};
  const updated={...op,paidEmail:{...c,payload,payloadDigest,envelope}};
  const written=await bucket.put(key,JSON.stringify(updated),{onlyIf:{etagMatches:obj.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  return written?{prepared:true,payload}:{prepared:false};
}
async function recoverClaim(env,{id,eventId,leaseId,now=new Date().toISOString()}={}) {
  if(!env.REVIEW_MEDIA||typeof id!=='string'||!ID.test(id)||typeof eventId!=='string'||!eventId||typeof leaseId!=='string'||!leaseId||!Number.isFinite(Date.parse(now)))return {claimed:false};
  const bucket=env.REVIEW_MEDIA,key='business-operations/'+id+'.json',obj=await bucket.get(key);if(!obj?.etag)return {claimed:false};
  let op,order;try{op=JSON.parse(await obj.text());const saved=await bucket.get('business-orders/'+id+'.json');order=JSON.parse(await saved.text())}catch{return {claimed:false}}
  const c=op?.paidEmail,t=Date.parse(now),expiry=Date.parse(c?.expiresAt),claimed=Date.parse(c?.claimedAt);
  if(!op?.paymentConfirmation||c?.status!=='claimed'||c.eventId!==eventId||!c.leaseId||c.leaseId===leaseId||!Number.isFinite(expiry)||!Number.isFinite(claimed)||expiry<=claimed||t<expiry||!order||order.id!==id||order.method!=='manual_dashboard'||order.status!=='awaiting_payment'||!Number.isSafeInteger(order.totalCents)||order.totalCents<0||op.paymentConfirmation.amountCents!==order.totalCents)return {claimed:false};
  if(Object.hasOwn(c,'firstAttemptAt')&&(!Number.isFinite(Date.parse(c.firstAttemptAt))||t<Date.parse(c.firstAttemptAt)||t-Date.parse(c.firstAttemptAt)>=23*60*60*1000))return {claimed:false};
  const updated={...op,paidEmail:{...c,leaseId,claimedAt:new Date(t).toISOString(),expiresAt:new Date(t+300000).toISOString()}};
  const written=await bucket.put(key,JSON.stringify(updated),{onlyIf:{etagMatches:obj.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});return {claimed:!!written};
}
// Explicit invocation only; no scheduler or default network transport.
async function sendClaimedPaidEmail(env,{id,eventId,leaseId,now=()=>new Date(),fetch:send}={}) {
  if(!env.REVIEW_MEDIA||!env.RESEND_API_KEY||typeof send!=='function'||typeof now!=='function'||!ID.test(id||'')||typeof eventId!=='string'||!eventId||typeof leaseId!=='string'||!leaseId)return {status:'blocked'};
  const bucket=env.REVIEW_MEDIA,key='business-operations/'+id+'.json';
  const read=async()=>{const obj=await bucket.get(key);if(!obj?.etag)return null;try{return {op:JSON.parse(await obj.text()),etag:obj.etag}}catch{return null}};
  const instant=()=>{const n=now();return n instanceof Date?n.getTime():NaN};
  const valid=(op,t)=>{const c=op?.paidEmail;return Number.isFinite(t)&&op?.paymentConfirmation&&c?.status==='claimed'&&c.eventId===eventId&&c.leaseId===leaseId&&Number.isFinite(Date.parse(c.claimedAt))&&Number.isFinite(Date.parse(c.expiresAt))&&t>=Date.parse(c.claimedAt)&&t<Date.parse(c.expiresAt)};
  const review=async(current,reason)=>{
    const c=current?.op?.paidEmail;
    if(!current||c?.status!=='claimed'||c.eventId!==eventId||c.leaseId!==leaseId)return {status:'conflict'};
    const updated={...current.op,paidEmail:{...c,status:'needs_review',reviewReason:reason}};
    const wrote=await bucket.put(key,JSON.stringify(updated),{onlyIf:{etagMatches:current.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
    return {status:wrote?'needs_review':'conflict'};
  };
  let t=instant(),current=await read();if(!current)return {status:'blocked'};
  if(!valid(current.op,t)){const c=current.op?.paidEmail;if(Number.isFinite(t)&&Number.isFinite(Date.parse(c?.expiresAt))&&t>=Date.parse(c.expiresAt))return review(current,'lease_expired');return {status:'blocked'}};
  const prepared=await preparePaidEmail(env,{id,eventId,leaseId,now:new Date(t).toISOString()});
  if(!prepared.prepared){
    current=await read();t=instant();
    const p=current?.op?.paidEmail;
    if(current&&valid(current.op,t)&&(Object.hasOwn(p,'payload')||Object.hasOwn(p,'payloadDigest')||Object.hasOwn(p,'envelope'))&&!verifyEnvelope(env,id,eventId,p))return review(current,'payload_mismatch');
    return {status:'blocked'};
  }
  current=await read();t=instant();if(!current||!valid(current.op,t))return {status:'blocked'};
  const c=current.op.paidEmail,first=Object.hasOwn(c,'firstAttemptAt')?Date.parse(c.firstAttemptAt):t;
  if(!Number.isFinite(first)||t<first||t-first>=23*60*60*1000)return review(current,'retry_window_expired');
  const marked={...current.op,paidEmail:{...c,firstAttemptAt:new Date(first).toISOString(),lastAttemptAt:new Date(t).toISOString()}};
  const wrote=await bucket.put(key,JSON.stringify(marked),{onlyIf:{etagMatches:current.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  if(!wrote)return {status:'conflict'};
  current=await read();t=instant();if(!current||!valid(current.op,t)||current.op.paidEmail.firstAttemptAt!==marked.paidEmail.firstAttemptAt||current.op.paidEmail.lastAttemptAt!==marked.paidEmail.lastAttemptAt||t<first||t-first>=23*60*60*1000)return {status:'blocked'};
  const saved=await bucket.get('business-orders/'+id+'.json');let order;try{order=JSON.parse(await saved.text())}catch{return {status:'blocked'}}
  if(!order||order.id!==id||order.method!=='manual_dashboard'||order.status!=='awaiting_payment'||!Number.isSafeInteger(order.totalCents)||order.totalCents<0||current.op.paymentConfirmation.amountCents!==order.totalCents)return {status:'blocked'};
  // Check again after all asynchronous reads, immediately before the request.
  current=await read();t=instant();if(!current||!valid(current.op,t)||current.op.paymentConfirmation.amountCents!==order.totalCents||current.op.paidEmail.firstAttemptAt!==marked.paidEmail.firstAttemptAt||current.op.paidEmail.lastAttemptAt!==marked.paidEmail.lastAttemptAt||t<first||t-first>=23*60*60*1000)return {status:'blocked'};
  const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
  const finalClaim=current.op.paidEmail;
  const snapshot=finalClaim.confirmedSnapshot;
  if(!/^[a-f0-9]{64}$/.test(finalClaim.approvalKeyHash||'')||finalClaim.approvalKeyHash!==c.approvalKeyHash||!Number.isFinite(Date.parse(finalClaim.createdAt))||finalClaim.createdAt!==c.createdAt||!snapshot||snapshot.id!==id||snapshot.method!=='manual_dashboard'||snapshot.version!==1||snapshot.status!=='awaiting_payment'||!/^[a-f0-9]{64}$/.test(snapshot.manualRequestHash||'')||!Number.isSafeInteger(snapshot.totalCents)||snapshot.totalCents<0||typeof snapshot.customer?.email!=='string'||!snapshot.customer.email.trim()||current.op.paymentConfirmation.amountCents!==snapshot.totalCents||current.op.paymentConfirmation.orderDigest!==hash(JSON.stringify(snapshot))||JSON.stringify(snapshot)!==JSON.stringify(c.confirmedSnapshot)||JSON.stringify(current.op.paymentConfirmation)!==JSON.stringify(marked.paymentConfirmation))return {status:'blocked'};
  if(finalClaim.payload!==prepared.payload||!verifyEnvelope(env,id,eventId,finalClaim))return review(current,'payload_mismatch');
  const digest=hash(JSON.stringify([id,eventId]));
  let response,body;try{response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'manual-paid/'+digest},body:prepared.payload});if(response.ok)body=await response.json()}catch{return {status:'ambiguous'}}
  if(!response.ok){
    if(response.status===429)return {status:'retryable',httpStatus:response.status};
    if(response.status>=400&&response.status<500){const result=await review(current,'provider_'+response.status);return {...result,httpStatus:response.status}}
    return {status:'ambiguous',httpStatus:response.status};
  }
  if(!body||typeof body.id!=='string'||!body.id)return {status:'ambiguous'};
  // Only the same still-live claim can record acceptance. Merge fresh operations.
  for(let attempt=0;attempt<3;attempt++){
    current=await read();t=instant();if(!current||!valid(current.op,t)||current.op.paidEmail.firstAttemptAt!==marked.paidEmail.firstAttemptAt)return {status:'ambiguous'};
    const updated={...current.op,paidEmail:{...current.op.paidEmail,status:'accepted',providerId:body.id,acceptedAt:new Date(t).toISOString()}};
    if(await bucket.put(key,JSON.stringify(updated),{onlyIf:{etagMatches:current.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}}))return {status:'accepted',providerId:body.id};
  }
  return {status:'ambiguous'};
}
// Scheduled orchestration is inert without an explicitly injected transport.
async function runScheduledPaidEmail(env,{process,fetch:transport,now=()=>new Date()}={}) {
  if(env?.MANUAL_PAID_SCHEDULER_ENABLED!=='1'||env?.ORDER_EMAIL_ENABLED!=='1'||!env?.REVIEW_MEDIA||(typeof process!=='function'&&typeof transport!=='function'))return {status:'disabled'};
  const bucket=env.REVIEW_MEDIA,key='private/manual-paid-scheduler-cursor.json';
  try {
    const state=await bucket.get(key);let cursor=null;
    if(state){
      if(typeof state.etag!=='string'||!state.etag)return {status:'error'};
      let value;try{value=JSON.parse(await state.text())}catch{return {status:'error'}}
      if(!value||!(value.cursor===null||(typeof value.cursor==='string'&&value.cursor.length>0&&value.cursor.length<=2048)))return {status:'error'};
      cursor=value.cursor;
    }
    const page=await bucket.list({prefix:'business-operations/',limit:10,...(cursor?{cursor}:{})});
    if(!Array.isArray(page.objects)||page.objects.length>10||typeof page.truncated!=='boolean'||(page.truncated&&(typeof page.cursor!=='string'||!page.cursor||page.cursor.length>2048||page.cursor===cursor)))return {status:'error'};
    const candidates=[],hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
    for(const item of page.objects){
      if(typeof item?.key!=='string'||!item.key.startsWith('business-operations/')||!item.key.endsWith('.json'))continue;
      const id=item.key.slice('business-operations/'.length,-5);if(!ID.test(id))continue;
      const obj=await bucket.get(item.key);if(!obj)continue;
      const raw=await obj.text();let op;try{op=JSON.parse(raw)}catch{continue}
      const c=op?.paidEmail,s=c?.confirmedSnapshot,p=op?.paymentConfirmation;
      if(!['pending','claimed'].includes(c?.status)||typeof c.eventId!=='string'||!c.eventId||c.eventId.length>512||!Number.isFinite(Date.parse(c.createdAt))||typeof c.approvalKeyHash!=='string'||!/^[a-f0-9]{64}$/.test(c.approvalKeyHash)||!s||s.id!==id||s.method!=='manual_dashboard'||s.version!==1||s.status!=='awaiting_payment'||typeof s.manualRequestHash!=='string'||!/^[a-f0-9]{64}$/.test(s.manualRequestHash)||!Number.isSafeInteger(s.totalCents)||s.totalCents<0||typeof s.customer?.email!=='string'||!s.customer.email.trim()||!p||p.amountCents!==s.totalCents||p.orderDigest!==hash(JSON.stringify(s)))continue;
      if(c.status==='claimed'&&(typeof process==='function'||!Number.isFinite(Date.parse(c.expiresAt))||now().getTime()<Date.parse(c.expiresAt)))continue;
      const saved=await bucket.get('business-orders/'+id+'.json');if(!saved)continue;
      const savedRaw=await saved.text();let order;try{order=JSON.parse(savedRaw)}catch{continue}
      if(!order||order.id!==id||order.method!=='manual_dashboard'||order.status!=='awaiting_payment'||order.totalCents!==s.totalCents)continue;
      candidates.push({id,eventId:c.eventId});
    }
    // A crash delays this page until wraparound; CAS prevents competing reservations.
    const wrote=await bucket.put(key,JSON.stringify({cursor:page.truncated?page.cursor:null}),{onlyIf:state?{etagMatches:state.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
    if(!wrote)return {status:'conflict'};
    for(const candidate of candidates){try{
      if(typeof process==='function'){await process(candidate);continue}
      const leaseId=require('node:crypto').randomUUID(), instant=now().toISOString();
      let result=await claimPending(env,{...candidate,leaseId,now:instant});
      if(!result.claimed)result=await recoverClaim(env,{...candidate,leaseId,now:instant});
      if(result.claimed){await sendClaimedPaidEmail(env,{...candidate,leaseId,now,fetch:transport});continue}
      const opKey='business-operations/'+candidate.id+'.json',obj=await bucket.get(opKey);
      if(!obj?.etag)continue;
      const op=JSON.parse(await obj.text()),c=op?.paidEmail,t=Date.parse(instant),first=Date.parse(c?.firstAttemptAt);
      if(c?.status==='claimed'&&c.eventId===candidate.eventId&&Number.isFinite(Date.parse(c.expiresAt))&&t>=Date.parse(c.expiresAt)&&Object.hasOwn(c,'firstAttemptAt')&&(!Number.isFinite(first)||t<first||t-first>=23*60*60*1000)){
        await bucket.put(opKey,JSON.stringify({...op,paidEmail:{...c,status:'needs_review',reviewReason:'retry_window_expired'}}),{onlyIf:{etagMatches:obj.etag},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
      }
    }catch{/* Retry after wrap; do not reveal callback errors. */}}
    return {status:'ok'};
  }catch{return {status:'error'}}
}
// Delivery remains disabled; sealing alone does not authorize a network request.
module.exports={processPending,claimPending,preparePaidEmail,recoverClaim,runScheduledPaidEmail,sendClaimedPaidEmail:async()=>({status:'blocked'})};
