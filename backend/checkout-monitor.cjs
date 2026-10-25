'use strict';
const security=require('./public-security.cjs');
const PREFIX='monitoring/checkout/';
const LATEST=PREFIX+'latest.json';
const INTERVAL_MS=10*60*1000;
const HISTORY_SLOTS=144;
const DEFAULT_TIMEOUT_MS=8000;
const MAX_ORDER_PAGES=2;
const PAGE_SIZE=100;
const LIMITS=[
 'Non-writing checks do not create a Checkout Session, charge a payment, append an accounting row, or send an email.',
 'Stripe account authentication does not prove permission to create Checkout Sessions.',
 'Accounting signature compatibility does not prove spreadsheet append permission or remaining quota.',
 'Order anomaly counts cover at most 200 records; a partial scan cannot establish absence of anomalies.',
 'A specialist must review degraded, unknown, or stale results; this monitor does not deploy repairs.'
];
function timeoutMs(env){const n=Number(env.CHECKOUT_MONITOR_TIMEOUT_MS);return Number.isFinite(n)&&n>=10&&n<=15000?Math.floor(n):DEFAULT_TIMEOUT_MS;}
async function bounded(operation,ms){
 const controller=new AbortController();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const e=Error('Monitor deadline exceeded');e.monitorReason='timeout';reject(e);},ms);})]);}
 finally{clearTimeout(timer);}
}
async function readJson(url,options,ms){return bounded(async signal=>{const response=await fetch(url,{...options,signal});let body;try{body=await response.json();}catch{const error=Error('Invalid JSON');error.monitorReason='invalid_response';throw error;}return {ok:response.ok,status:response.status,body};},ms);}
async function check(operation){const start=Date.now();try{return {...await operation(),durationMs:Date.now()-start};}catch(error){return {status:'degraded',reason:error.monitorReason==='timeout'?'timeout':error.monitorReason==='invalid_response'?'invalid_response':'request_failed',durationMs:Date.now()-start};}}
async function accountingCheck(env,target){
 if(!target||!security.signingSecret(env))return {status:'degraded',reason:'missing_configuration'};
 const payload=security.envelope(env,{action:'security_probe',encodingProbe:'\u00e9\u2014\ud83e\uddea'});
 const result=await readJson(target,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)},timeoutMs(env));
 if(!result.ok)return {status:'degraded',reason:'http_error'};
 return result.body?.ok===true&&result.body.securityVersion===2&&result.body.manualOrderIdempotent===true?{status:'healthy',reason:'signed_unicode_probe_accepted'}:{status:'degraded',reason:'signed_probe_rejected'};
}
async function stripeAuthCheck(env){
 if(!env.STRIPE_SECRET_KEY)return {status:'degraded',reason:'missing_configuration'};
 const result=await readJson('https://api.stripe.com/v1/account',{method:'GET',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY}},timeoutMs(env));
 if(!result.ok)return {status:'degraded',reason:result.status===401||result.status===403?'authentication_failed':'http_error'};
 return result.body?.object==='account'&&/^acct_[A-Za-z0-9]+$/.test(result.body.id||'')?{status:'healthy',reason:'account_read_accepted'}:{status:'degraded',reason:'invalid_response'};
}
async function catalogCheck(env){
 if(!env.CATALOG_URL)return {status:'degraded',reason:'missing_configuration'};
 const result=await readJson(env.CATALOG_URL,{method:'GET',headers:{Accept:'application/json'}},timeoutMs(env));
 if(!result.ok)return {status:'degraded',reason:'http_error'};
 const products=result.body?.products;
 const valid=result.body?.currency==='EUR'&&Array.isArray(products)&&products.length>0&&products.every(p=>typeof p.handle==='string'&&p.handle.length>0&&Array.isArray(p.variants)&&p.variants.length>0&&p.variants.every(v=>Number.isFinite(Number(v.price_eur))&&Number(v.price_eur)>0));
 return valid?{status:'healthy',reason:'catalog_shape_valid'}:{status:'degraded',reason:'invalid_catalog'};
}
async function orderAnomalies(env,now){
 if(!env.REVIEW_MEDIA)return {status:'unknown',reason:'storage_unavailable',scanned:0,stalledCount:0,failedCount:0,partial:true};
 return bounded(async()=>{
  let cursor,partial=false,scanned=0,stalledCount=0,failedCount=0,unreadableCount=0;
  for(let page=0;page<MAX_ORDER_PAGES;page++){
   const batch=await env.REVIEW_MEDIA.list({prefix:'business-orders/',limit:PAGE_SIZE,...(cursor?{cursor}:{})});
   for(let offset=0;offset<batch.objects.length;offset+=10){
    const values=await Promise.all(batch.objects.slice(offset,offset+10).map(async item=>{try{const object=await env.REVIEW_MEDIA.get(item.key);return object?JSON.parse(await object.text()):null;}catch{return null;}}));
    for(const order of values){scanned++;if(!order){unreadableCount++;continue;}if(order.isTest||order.method!=='stripe')continue;const age=now-Date.parse(order.createdAt);if(Number.isFinite(age)&&age>=5*60*1000&&age<=24*60*60*1000&&order.status==='pending_checkout'&&!order.sessionId)stalledCount++;const failureAge=now-Date.parse(order.failedAt||order.createdAt);if(order.status==='checkout_failed'&&Number.isFinite(failureAge)&&failureAge>=0&&failureAge<=24*60*60*1000)failedCount++;}
   }
   partial=!!batch.truncated;if(!partial)break;cursor=batch.cursor;
   if(!cursor)break;
  }
  return {status:failedCount||stalledCount?'degraded':partial||unreadableCount?'unknown':'healthy',reason:failedCount?'checkout_start_failures':stalledCount?'unfinished_without_session':partial?'partial_scan':unreadableCount?'unreadable_records':'no_observed_stalled_attempts',scanned,stalledCount,failedCount,unreadableCount,partial};
 },timeoutMs(env));
}
async function run(env,now=Date.now()){
 const start=Date.now();let previous=null;
 if(env.REVIEW_MEDIA){try{previous=await bounded(async()=>{const object=await env.REVIEW_MEDIA.get(LATEST);return object?JSON.parse(await object.text()):null;},timeoutMs(env));}catch{}}
 const gasTargets={stripeAccounting:env.GAS_WEBHOOK_URL,manualAccounting:env.MANUAL_ORDER_GAS_URL||env.GAS_WEBHOOK_URL};
 const shared=new Map();
 const accounting=Object.entries(gasTargets).map(async([name,target])=>{if(!shared.has(target))shared.set(target,check(()=>accountingCheck(env,target)));return [name,await shared.get(target)];});
 const entries=await Promise.all([...accounting,check(()=>stripeAuthCheck(env)).then(value=>['stripeAuthentication',value]),check(()=>catalogCheck(env)).then(value=>['catalog',value]),check(()=>orderAnomalies(env,now)).then(value=>['orderAnomalies',value])]);
 const checks=Object.fromEntries(entries);
 let status=entries.some(([,value])=>value.status==='degraded')?'degraded':entries.some(([,value])=>value.status==='unknown')?'unknown':'healthy';
 const report={version:1,checkedAt:new Date(now).toISOString(),status,scope:'non_writing_checkout_readiness',failureStreak:status==='degraded'?(previous?.status==='degraded'?Math.min(100000,Number(previous.failureStreak)||0)+1:1):0,unknownStreak:status==='unknown'?(previous?.status==='unknown'?Math.min(100000,Number(previous.unknownStreak)||0)+1:1):0,lastHealthyAt:status==='healthy'?new Date(now).toISOString():previous?.lastHealthyAt||null,checks,durationMs:Date.now()-start,limits:LIMITS};
 try{
  if(!env.REVIEW_MEDIA)throw Error('Storage unavailable');
  const slot=String(Math.floor(now/INTERVAL_MS)%HISTORY_SLOTS).padStart(3,'0');
  const metadata={httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}};
  await bounded(async()=>{await env.REVIEW_MEDIA.put(PREFIX+'history/'+slot+'.json',JSON.stringify(report),metadata);await env.REVIEW_MEDIA.put(LATEST,JSON.stringify(report),metadata);},timeoutMs(env));
 }catch{
  status=report.status='unknown';report.checks.monitorStorage={status:'unknown',reason:'snapshot_write_failed'};
 }
 // Do not log provider bodies, exception messages, URLs, account/order IDs, or personal details.
 console.log(JSON.stringify({event:'checkout_monitor',status,checkedAt:report.checkedAt,failureStreak:report.failureStreak,storageFailed:!!report.checks.monitorStorage}));
 return report;
}
module.exports={run,LATEST,LIMITS};
