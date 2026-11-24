'use strict';
// Real dashboard adapter. The immutable order is read-only; all communication
// state is committed inside the existing operations object by a single R2 CAS.
const crypto=require('node:crypto');
const {workflow,hash}=require('./dashboard-tracking.cjs');
const security=require('./public-security.cjs');
const {digestEntries}=require('./dashboard-customer-inventory.cjs');
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const enabled=env=>env.DASHBOARD_CUSTOMER_EMAIL_UI_ENABLED==='1';
const active=m=>['queued','sending','retryable','ambiguous','needs_review'].includes(m.status);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'}});
function diagnostic(phase,id,error){const codes={409:'conflict',413:'size_limit',429:'rate_limit',503:'unavailable'};console.error(JSON.stringify({event:'dashboard_customer_email_error',phase,orderTag:id?hash(id).slice(0,16):null,code:codes[error?.status]||'internal_error'}));}
async function read(bucket,key){const obj=await bucket.get(key);if(!obj)return null;if(!obj.etag)throw Error('Storage has no CAS token');return {value:JSON.parse(await obj.text()),etag:obj.etag};}
function signingKey(env){const secret=env.DASHBOARD_CUSTOMER_EMAIL_SECRET||env.WORKER_GAS_SECRET;if(typeof secret!=='string'||secret.trim().length<32)throw Object.assign(Error('Comunicação indisponível: chave privada não configurada.'),{status:503});return crypto.createHmac('sha256',secret).update('asheerah/dashboard-customer/v1').digest('hex');}
function storeFor(env){const bucket=env.REVIEW_MEDIA;
 return {
  async read(id){if(!ID.test(id))return null;const saved=await read(bucket,'business-orders/'+id+'.json');if(!saved||saved.value.isTest||saved.value.id!==id)return null;
   const current=await read(bucket,'business-operations/'+id+'.json'),op=current?.value||require('./business-dashboard.cjs').blankOperations(saved.value,env);if(op.removed)return null;
   const {customerComms,...operations}=op,c=customerComms||{schema:1,tracking:null,messages:[],audit:[]};if(c.schema!==1||!Array.isArray(c.messages)||!Array.isArray(c.audit))throw Error('Unsupported communication state');
   return {etag:current?.etag||null,value:{order:saved.value,sourceEtag:saved.etag,operations,version:op.version,receiptOwner:c.receiptOwner||(c.messages.some(m=>m.kind==='receipt')?'dashboard-v1':null),tracking:c.tracking,messages:c.messages,audit:c.audit}};
  },
  async cas(id,etag,next){if(!ID.test(id))return false;const source=await read(bucket,'business-orders/'+id+'.json');if(!source||source.etag!==next.sourceEtag||hash(JSON.stringify(source.value))!==hash(JSON.stringify(next.order)))return false;
   const op={...next.operations,version:next.version,customerComms:{schema:1,receiptOwner:next.receiptOwner||null,tracking:next.tracking,messages:next.messages,audit:next.audit}};
   // Older API revisions already reject any existing paidEmail record. This
   // inert status reserves that slot too, so a code rollback cannot resend it.
   if(next.receiptOwner&&!op.paidEmail)op.paidEmail={status:'dashboard_owned',owner:'dashboard-v1'};
   if(next.tracking)op.tracking=next.tracking.code;
   const body=JSON.stringify(op);if(Buffer.byteLength(body)>1500000)throw Object.assign(Error('Documento demasiado grande.'),{status:413});
   return !!await bucket.put('business-operations/'+id+'.json',body,{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  }
 };
}
// Provider acceptance is never treated as delivery. Timeout/5xx are uncertain,
// not proof that an email failed. Only an explicit 429 is automatically retried.
function providerFor(env,transport=globalThis.fetch,timeoutMs=20000){return async({payload,idempotencyKey})=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.min(20000,Math.max(1,timeoutMs)));
 try{
  const work=(async()=>{const r=await transport('https://api.resend.com/emails',{method:'POST',signal:controller.signal,redirect:'error',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:payload});
   if(r.status===429){const n=Number(r.headers?.get('retry-after'));return {status:'retryable',retryAfterMs:Number.isFinite(n)?Math.min(3600000,Math.max(60000,n*1000)):60000};}
   if(r.status>=400&&r.status<500&&![408,409].includes(r.status))return {status:'rejected',httpStatus:r.status};
   if(!r.ok)return {status:'ambiguous',httpStatus:r.status};
   const reader=r.body?.getReader();if(!reader)return {status:'ambiguous'};const decoder=new TextDecoder();let text='',bytes=0;
   for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4096){reader.cancel().catch(()=>{});return {status:'ambiguous'}}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
   let value;try{value=JSON.parse(text)}catch{return {status:'ambiguous'}};
   return typeof value?.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value.id)?{status:'accepted',id:value.id}:{status:'ambiguous'};
  })();
  // Also bounds transports/body readers that ignore AbortSignal.
  return await Promise.race([work,new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve({status:'ambiguous'}),{once:true}))]);
 }catch{return {status:'ambiguous'}}finally{clearTimeout(timeout)}
};}
function service(env,options={}){return workflow({store:storeFor(env),secret:signingKey(env),...options});}
async function previewResponse(request,env,by,id,eventId,format){
 if(!enabled(env)||!by||request.method!=='GET')return json({error:'Indisponível.'},404);
 try{const p=await service(env).previewContent(id,eventId),headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(format==='pdf'){const a=p.attachments.find(a=>a.filename.endsWith('.pdf'));return new Response(Buffer.from(a.content,'base64'),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+a.filename+'"','X-Frame-Options':'DENY'}});}
  const logo=p.attachments.find(a=>a.content_id==='asheerah-logo');return new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+p.html.replace('cid:asheerah-logo','data:image/png;base64,'+logo.content)+'</body></html>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox"}});
 }catch(e){if(!e.status||e.status>=500)diagnostic('preview',id,e);return json({error:e.status?e.message:'Pré-visualização indisponível.'},e.status||503)}
}
async function handle(request,env,by,id,action){
 if(!enabled(env))return json({error:'Funcionalidade ainda não disponível.'},404);
 if(!by||!env.REVIEW_MEDIA)return json({error:'Área privada.'},401);
 try{
  const flow=service(env),url=new URL(request.url);
  if(request.method==='GET'&&!action){const r=await flow.get(id),safe=require('./business-dashboard.cjs').safeOrder(r.order,{...r.operations,customerComms:{receiptOwner:r.receiptOwned?'dashboard-v1':null,messages:r.messages}},env),gate=await senderGate(env);return json({...r,order:safe,operations:safe.operations,senderEnabled:!!gate,receiptAvailable:!!gate&&env.DASHBOARD_CUSTOMER_RECEIPT_CUTOVER==='1'});}
  if(request.method!=='POST'||!['record','preview','approve','resolve'].includes(action)||request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Pedido inválido.'},403);
  if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'Pedido demasiado grande.'},413);
  const raw=await request.text();if(Buffer.byteLength(raw)>4096)return json({error:'Pedido demasiado grande.'},413);let input;try{input=JSON.parse(raw)}catch{return json({error:'JSON inválido.'},400)};
  if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Pedido inválido.'},400);
  await security.take(env,'dashboard-customer:global:day',300,86400000);
  await security.take(env,'dashboard-customer:'+by+':'+id,action==='preview'?30:100,86400000);
  if(action==='preview'&&input.kind==='receipt'){
   const r=await flow.get(id),legacy=r.operations.paidEmail;if(legacy&&!(r.receiptOwned&&legacy.status==='dashboard_owned'&&legacy.owner==='dashboard-v1'))return json({error:'O email anterior requer revisão; não duplique a confirmação.'},409);
   if(env.DASHBOARD_CUSTOMER_RECEIPT_CUTOVER!=='1'||!await senderGate(env))return json({error:'Use a confirmação de pagamento existente. O novo resumo aguarda ativação e cutover explícitos.'},409);
  }
  const result=await flow[action](id,input,by);return json(action==='record'?{status:'saved',version:result.version}:result);
 }catch(e){if(!e.status||e.status>=500)diagnostic('api',id,e);return json({error:e.status?e.message:'Não foi possível confirmar o resultado. Atualize o estado antes de repetir.'},e.status||503)}
}
async function inventory(env,{cursor}={}){
 const page=await env.REVIEW_MEDIA.list({prefix:'business-operations/',limit:50,...(cursor?{cursor}:{})}),entries=[];
 for(const item of page.objects){if(!item.key.startsWith('business-operations/')||!item.key.endsWith('.json'))continue;const id=item.key.slice('business-operations/'.length,-5);if(!ID.test(id))continue;const op=await read(env.REVIEW_MEDIA,item.key);
  for(const m of op?.value.customerComms?.messages||[])if(active(m))entries.push({channel:'dashboard',id,eventId:m.eventId,status:m.status,digest:m.digest||null,approvedAt:m.approvedAt||null,leaseExpiresAt:m.leaseExpiresAt||null,firstAttemptAt:m.firstAttemptAt||null,reviewReason:m.reviewReason||null,reconciliationRequired:['ambiguous','needs_review'].includes(m.status)||m.status==='sending'&&(!Number.isFinite(m.leaseExpiresAt)||Date.now()>=m.leaseExpiresAt)});
  const p=op?.value.paidEmail;if(p&&['pending','claimed','needs_review','ambiguous'].includes(p.status))entries.push({channel:'legacy_paid',id,eventId:p.eventId||null,status:p.status,digest:p.payloadDigest||null,createdAt:p.createdAt||null,leaseExpiresAt:p.expiresAt||null,reconciliationRequired:['needs_review','ambiguous'].includes(p.status)||p.status==='claimed'&&(!Number.isFinite(Date.parse(p.expiresAt))||Date.now()>=Date.parse(p.expiresAt))});
 }
 return {schemaVersion:1,kind:'dashboard-customer-inventory-page',hashScope:'page-only-not-activation',canonicalization:'sorted-object-keys-v1',requestedCursor:cursor||null,entries,cursor:page.truncated?page.cursor:null,pageDigest:digestEntries(entries)};
}
async function senderGate(env){
 if(!enabled(env)||env.DASHBOARD_CUSTOMER_EMAIL_SEND_ENABLED!=='1'||!env.RESEND_API_KEY||!env.REVIEW_MEDIA||! /^[a-f0-9]{64}$/.test(env.DASHBOARD_CUSTOMER_EMAIL_INVENTORY_HASH||''))return null;
 const approved=await read(env.REVIEW_MEDIA,'private/dashboard-customer-email-activation.json'),a=approved?.value;
 if(!a||a.inventoryKind!=='dashboard-customer-full-inventory'||a.inventorySchemaVersion!==1||!Number.isSafeInteger(a.inventoryPageCount)||a.inventoryPageCount<1||!Number.isSafeInteger(a.inventoryEntryCount)||a.inventoryEntryCount<0||a.inventoryHash!==env.DASHBOARD_CUSTOMER_EMAIL_INVENTORY_HASH||typeof a.approvedBy!=='string'||!String(env.MANAGEMENT_ALLOWED_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(a.approvedBy)||!Number.isFinite(Date.parse(a.notBefore))||Date.parse(a.notBefore)>Date.now()||!Number.isFinite(Date.parse(a.authorizedAt))||Date.parse(a.authorizedAt)>Date.now()||Date.parse(a.notBefore)<Date.parse(a.authorizedAt))return null;
 return a;
}
async function runScheduled(env,{fetch:transport=globalThis.fetch,now=()=>Date.now()}={}){
 // Do not inspect the queue, let alone send, until all activation gates pass.
 const gate=await senderGate(env);if(!gate)return {status:'disabled'};
 const bucket=env.REVIEW_MEDIA,key='private/dashboard-customer-email-cursor.json';
 const saved=await read(bucket,key),cursor=saved?.value.cursor||undefined;
 const page=await bucket.list({prefix:'business-operations/',limit:10,...(cursor?{cursor}:{})});
 if(!await bucket.put(key,JSON.stringify({cursor:page.truncated?page.cursor:null}),{onlyIf:saved?{etagMatches:saved.etag}:{etagDoesNotMatch:'*'}}))return {status:'conflict'};
 const flow=service(env,{now,provider:providerFor(env,transport)});let processed=0;
 for(const obj of page.objects){const id=obj.key.slice('business-operations/'.length,-5);if(!ID.test(id))continue;
  try{await flow.recover(id);const r=await flow.get(id),m=r.messages.find(m=>['queued','retryable'].includes(m.status));if(!m||m.approvedAt<Date.parse(gate.notBefore)||m.nextAttemptAt&&now()<m.nextAttemptAt)continue;await security.take(env,'dashboard-customer:dispatch:day',100,86400000,now());await flow.deliver(id);processed++;}catch(e){diagnostic('dispatch',id,e);}
 }
 return {status:'ok',processed};
}
async function scheduled(env,options){try{return await runScheduled(env,options)}catch(e){diagnostic('scheduler',null,e);return {status:'error'}}}
module.exports={enabled,storeFor,service,handle,previewResponse,providerFor,inventory,scheduled,senderGate};
