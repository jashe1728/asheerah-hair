'use strict';
const crypto=require('node:crypto');
const PREFIX='security-limits/';
function signingSecret(env){return String(env.WORKER_GAS_SECRET||'').normalize('NFKC').trim().replace(/^(['"])([\s\S]*)\1$/,'$2').replace(/\s+/g,'').toLowerCase();}
function envelope(env,payload){const secret=signingSecret(env);if(!secret)throw Error('Signing is not configured');const raw=JSON.stringify(payload);return {payload:raw,signature:crypto.createHmac('sha256',secret).update(raw).digest('hex')};}
function failure(status,message,retryAfter=60){const e=Error(message);e.status=status;e.retryAfter=retryAfter;return e;}
// R2 conditional writes provide a shared counter across Worker instances. Never use a local Map for admission.
async function take(env,scope,limit,period,now=Date.now()){
 if(!env.REVIEW_MEDIA)throw failure(503,'Protection is temporarily unavailable');
 const start=Math.floor(now/period)*period,day=new Date(start).toISOString().slice(0,10);
 const key=PREFIX+day+'/'+crypto.createHash('sha256').update(scope).digest('hex')+'/'+start+'.json';
 for(let attempt=0;attempt<6;attempt++){
  const current=await env.REVIEW_MEDIA.get(key),value=current?JSON.parse(await current.text()):{count:0};
  if(!Number.isSafeInteger(value.count)||value.count<0)throw failure(503,'Protection is temporarily unavailable');
  if(value.count>=limit)throw failure(429,'Please try again later',Math.max(1,Math.ceil((start+period-now)/1000)));
  const written=await env.REVIEW_MEDIA.put(key,JSON.stringify({count:value.count+1,expiresAt:start+period+86400000}),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  if(written)return;
 }
 throw failure(503,'Protection is busy. Please try again');
}
async function admit(request,env,kind){
 const secret=signingSecret(env);if(!secret)throw failure(503,'Protection is not configured');
 // CF-Connecting-IP is supplied by Cloudflare on the deployed route, not X-Forwarded-For.
 const client=crypto.createHmac('sha256',secret).update(request.headers.get('CF-Connecting-IP')||'unknown').digest('hex');
 // Check global ceilings first so rotating IPs cannot allocate unlimited counter objects.
 await take(env,kind+':daily',kind==='csp'?300:300,86400000);
 await take(env,kind+':hourly',kind==='csp'?100:60,3600000);
 await take(env,kind+':client:'+client,kind==='csp'?20:5,600000);
}
async function ownerMailAllowed(env){try{await take(env,'chat-owner-mail:daily',20,86400000);await take(env,'chat-owner-mail:hourly',5,3600000);return true;}catch{return false;}}
function documentPath(value){try{const url=new URL(value);return ['asheerahhair.com','www.asheerahhair.com'].includes(url.hostname)&&/^\/(?:[a-z-]+\/)?(?:[a-z-]+\.html)?$/.test(url.pathname)?url.pathname:'other';}catch{return 'other';}}
function sanitizeReport(input){
 const report=input?.['csp-report']||input?.body;if(!report||typeof report!=='object')throw failure(400,'Invalid report');
 const raw=String(report['effective-directive']||report.effectiveDirective||report['violated-directive']||'').split(' ')[0];
 const directive=/^(default|script|style|img|font|media|connect|frame|worker|manifest|object)-src(?:-elem|-attr)?$|^(base-uri|frame-ancestors|form-action)$/.test(raw)?raw:'other';
 let blocked='other';try{const value=String(report['blocked-uri']||report.blockedURL||'');blocked=['inline','eval','data','blob'].includes(value)?value:new URL(value).origin;if(blocked.length>200)blocked='other';}catch{}
 return {path:documentPath(report['document-uri']||report.documentURL),directive,blocked};
}
async function csp(request,env){
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
 try{
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
  if(!['application/csp-report','application/reports+json'].includes((request.headers.get('Content-Type')||'').split(';')[0]))throw failure(415,'Unsupported report format');
  if(Number(request.headers.get('Content-Length')||0)>16000)throw failure(413,'Report too large');
  const raw=await request.text();if(Buffer.byteLength(raw)>16000)throw failure(413,'Report too large');
  let input;try{input=JSON.parse(raw);}catch{throw failure(400,'Invalid report');}
  const list=Array.isArray(input)?input:[input];if(!list.length||list.length>10)throw failure(400,'Invalid report');
  const reports=list.map(sanitizeReport);
  await admit(request,env,'csp');
  const at=new Date().toISOString();
  await env.REVIEW_MEDIA.put('security-reports/'+at.slice(0,10)+'/'+crypto.randomUUID()+'.json',JSON.stringify({at,reports}),{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  return new Response(null,{status:204,headers});
 }catch(e){return new Response(JSON.stringify({error:e.status?e.message:'Report could not be recorded'}),{status:e.status||503,headers:{...headers,'content-type':'application/json','retry-after':String(e.retryAfter||60)}});}
}
async function cleanup(env){
 if(!env.REVIEW_MEDIA)return;
 // Date-first namespaces allow a bounded oldest-first sweep, independent of customer order retention.
 const before=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
 for(const prefix of [PREFIX,'security-reports/']){
  const batch=await env.REVIEW_MEDIA.list({prefix,limit:100});
  for(const item of batch.objects){if(item.key.slice(prefix.length,prefix.length+10)<before)await env.REVIEW_MEDIA.delete(item.key);}
 }
}
module.exports={signingSecret,envelope,take,admit,ownerMailAllowed,csp,cleanup,sanitizeReport};
