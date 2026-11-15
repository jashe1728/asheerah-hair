'use strict';
const auth=require('./management-auth.cjs');
const ID=/^[a-f0-9-]{36}$/i;
const snapshotKey=id=>'business-orders/'+id+'.json';
const operationsKey=id=>'business-operations/'+id+'.json';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function readJson(bucket,key){const object=await bucket.get(key);return object?{value:JSON.parse(await object.text()),etag:object.etag}:null;}
async function persistOrder(env,order){
 if(env.MANAGEMENT_CAPTURE_ENABLED!=='1'||!env.REVIEW_MEDIA||order.isTest||!ID.test(order.id||''))return;
 if(order.method==='manual_dashboard')throw Error('Manual orders are immutable');
 // The email spool has a 30-day lifetime. Business history has a separate namespace.
 // CAS prevents an old checkout write from overwriting a newer paid snapshot.
 for(let i=0;i<5;i++){
  const current=await readJson(env.REVIEW_MEDIA,snapshotKey(order.id));
  if(current?.value.method==='manual_dashboard')throw Error('Manual orders are immutable');
  const merged={...current?.value,...order};
  if(current?.value.status==='paid')merged.status='paid';
  const saved=await env.REVIEW_MEDIA.put(snapshotKey(order.id),JSON.stringify(merged),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  if(saved)return;
 }
 throw Error('Business order update conflict');
}
const identity=auth.identity;
const orderDigest=order=>require('node:crypto').createHash('sha256').update(JSON.stringify(order)).digest('hex');
const immutableManual=order=>order.method==='manual_dashboard'&&order.version===1&&/^[a-f0-9]{64}$/.test(order.manualRequestHash||'');
const manualEmailAvailable=env=>env.MANUAL_PAID_SCHEDULER_ENABLED==='1'&&env.ORDER_EMAIL_ENABLED==='1';
function blankOperations(order={},env={}){return {version:0,stage:Date.parse(order.createdAt)<Date.parse(env.MANAGEMENT_HISTORY_CUTOFF)?'needs_review':'new',notes:'',tracking:'',events:[]};}
async function backfill(env){
 if(env.MANAGEMENT_CAPTURE_ENABLED!=='1'||!env.REVIEW_MEDIA||await env.REVIEW_MEDIA.get('business-backfill-complete'))return;
 const position=await env.REVIEW_MEDIA.get('business-backfill-cursor'),cursor=position?await position.text():'';
 const batch=await env.REVIEW_MEDIA.list({prefix:'order-notifications/',limit:50,...(cursor?{cursor}:{})});
 for(const item of batch.objects){const saved=await readJson(env.REVIEW_MEDIA,item.key);if(saved)await persistOrder(env,saved.value);}
 if(batch.truncated)await env.REVIEW_MEDIA.put('business-backfill-cursor',batch.cursor);
 else await env.REVIEW_MEDIA.put('business-backfill-complete',new Date().toISOString());
}
function safeOrder(order,operations,env={}){
 const {id,createdAt,language,method,status,customer,items,subtotalCents,discountCents,shippingCents,totalCents,couponCode,fulfillmentMethod,fulfillmentAddress,channel,createdBy}=order;
 const op=operations||blankOperations(order,env),safeOperations={...op};
 if(op.paidEmail)safeOperations.paidEmail={status:op.paidEmail.status};
 return {id,createdAt,language,method,status,customer,items,subtotalCents,discountCents,shippingCents,totalCents,couponCode,fulfillmentMethod,fulfillmentAddress,channel,createdBy,...(immutableManual(order)?{orderDigest:orderDigest(order),manualEmailAvailable:manualEmailAvailable(env)}:{}),operations:safeOperations};
}
function applyAction(order,previous,input,by,at=new Date().toISOString()){
 if(!input||!Number.isSafeInteger(input.version)||input.version!==previous.version)throw Error('Este pedido foi atualizado por outra pessoa. Atualiza a página antes de continuar.');
 const op=structuredClone(previous),action=input.action;
 const reference=input.reference??'',tracking=input.tracking??'';
 if(typeof reference!=='string'||reference.length>200||typeof tracking!=='string'||tracking.length>100)throw Error('Referência demasiado longa.');
 if((op.events||[]).length>=1000)throw Error('O histórico desta encomenda precisa de revisão técnica.');
 if(action==='note'){
  if(typeof input.notes!=='string'||input.notes.length>2000)throw Error('A nota deve ter até 2000 caracteres.');
  op.notes=input.notes.trim();
 }else{
  if(input.acknowledged!==true)throw Error('Confirma a ação antes de guardar.');
  const paid=order.status==='paid'||!!op.paymentConfirmation;
  if(action==='confirm_payment'){
   if(!['orange_money','manual_dashboard'].includes(order.method)||order.status!=='awaiting_payment'||paid||!reference.trim())throw Error('Só é possível confirmar um pagamento Orange Money pendente, com referência.');
   if(order.method==='manual_dashboard'&&(!immutableManual(order)||input.expectedOrderDigest!==orderDigest(order)))throw Error('A encomenda mudou ou não é imutável. Atualiza e revê antes de confirmar.');
   op.paymentConfirmation={at,by,reference:reference.trim(),amountCents:order.totalCents};
   if(order.method==='manual_dashboard')op.paymentConfirmation.orderDigest=orderDigest(order);
  }else if(action==='approve_paid_email'){
   if(!immutableManual(order)||order.status!=='awaiting_payment'||!op.paymentConfirmation||op.paymentConfirmation.orderDigest!==orderDigest(order)||input.expectedOrderDigest!==orderDigest(order)||typeof order.customer?.email!=='string'||!order.customer.email.trim()||input.recipient!==order.customer.email||typeof input.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{32,128}$/.test(input.idempotencyKey)||op.paidEmail)throw Error('Revê a encomenda e o destinatário antes de aprovar o email.');
   op.paidEmail={status:'pending',eventId:require('node:crypto').randomUUID(),createdAt:at,confirmedSnapshot:structuredClone(order),approvalKeyHash:require('node:crypto').createHash('sha256').update(input.idempotencyKey).digest('hex')};
  }else if(action==='classify_history'){
   const stages=['new','supplier_sent','supplier_accepted',order.fulfillmentMethod==='pickup'?'pickup_ready':'courier_accepted','delivered'];
   if(!paid||op.stage!=='needs_review'||!stages.includes(input.stage)||!reference.trim())throw Error('Confirma o pagamento e o estado real deste pedido anterior, com uma observação.');
   op.stage=input.stage;
  }else{
   if(!paid)throw Error('Confirma o pagamento antes de avançar com a encomenda.');
   const next={new:'supplier_sent',supplier_sent:'supplier_accepted',supplier_accepted:order.fulfillmentMethod==='pickup'?'pickup_ready':'courier_accepted',courier_accepted:'delivered',pickup_ready:'delivered'}[op.stage];
   if(action!==next)throw Error('Esta ação não corresponde ao próximo passo da encomenda.');
   op.stage=action;
   if(action==='courier_accepted')op.tracking=tracking.trim();
  }
 }
 op.version++;op.updatedAt=at;op.events.push({action,at,by,stage:op.stage,reference:action==='note'?'':reference.trim()});return op;
}
function manualOrderId(user,key){
 const bytes=require('node:crypto').createHash('sha1').update('asheerah-manual-order-v1\0'+user+'\0'+key).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
 const hex=bytes.toString('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
async function createManual(request,env,user,url){
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return response({error:'Pedido inválido.'},403);
 if(env.MANAGEMENT_CAPTURE_ENABLED!=='1'||!env.CATALOG_URL)return response({error:'Criação não configurada.'},503);
 const key=request.headers.get('Idempotency-Key')||'';
 if(!/^[a-zA-Z0-9_-]{32,128}$/.test(key))return response({error:'Chave de repetição inválida.'},400);
 if(Number(request.headers.get('Content-Length')||0)>8000)return response({error:'Pedido demasiado grande.'},413);
 const raw=await request.text();if(Buffer.byteLength(raw)>8000)return response({error:'Pedido demasiado grande.'},413);
 let input;try{input=JSON.parse(raw);}catch{return response({error:'Pedido inválido.'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||!['whatsapp','instagram'].includes(input.channel))return response({error:'Pedido inválido.'},400);
 const crypto=require('node:crypto');
 // Stable UUID per operator and client-supplied high-entropy key; a single R2 CAS
 // atomically commits both the idempotency record and order snapshot.
 const id=manualOrderId(user,key);
 const digest=crypto.createHash('sha256').update(raw).digest('hex'), storageKey=snapshotKey(id);
 const existingResponse=async()=>{const existing=await readJson(env.REVIEW_MEDIA,storageKey);if(!existing)return null;if(existing.value.manualRequestHash!==digest)return response({error:'Chave já usada para outro pedido.'},409);const op=await readJson(env.REVIEW_MEDIA,operationsKey(id));return response({order:safeOrder(existing.value,op?.value,env)},200);};
 try{
  const existing=await existingResponse();if(existing)return existing;
  const {channel,quoteId,...checkoutInput}=input;
  if(typeof quoteId!=='string')return response({error:'Revê o orçamento antes de criar.'},400);
  const key=quoteKey(env);if(!key)return response({error:'Criação não configurada.'},503);
  const quote=verifyQuote(quoteId,key,user,{channel,...checkoutInput});
  if(!quote)return response({error:'O orçamento mudou ou expirou. Revê novamente.',code:'manual_quote_rejected'},422);
  const result=await fetch(env.CATALOG_URL,{headers:{accept:'application/json'}});if(!result.ok)return response({error:'Catálogo indisponível.'},503);
  let checkout;try{checkout=require('./stripe-worker.cjs').normalizeCheckoutRequest(checkoutInput,await result.json(),env);}catch{return response({error:'Dados ou produto inválidos.'},400);}
  if(quote.price!==quoteDigest(key,'pricing',manualPricing(checkout)))return response({error:'O preço mudou. Revê novamente.',code:'manual_quote_rejected'},422);
  const order={version:1,id,createdAt:new Date().toISOString(),createdBy:user,channel,manualRequestHash:digest,method:'manual_dashboard',status:'awaiting_payment',language:checkout.language,customer:checkout.customer,items:checkout.orderItems,subtotalCents:checkout.subtotalCents,discountCents:checkout.discountCents,shippingCents:checkout.shippingCents,totalCents:checkout.totalCents,couponCode:checkout.couponCode,fulfillmentMethod:checkout.fulfillmentMethod,fulfillmentAddress:checkout.fulfillmentAddress};
  const written=await env.REVIEW_MEDIA.put(storageKey,JSON.stringify(order),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  if(!written)return await existingResponse()||response({error:'Conflito. Tenta novamente.'},409);
  return response({order:safeOrder(order,null,env)},201);
 }catch{return response({error:'Não foi possível guardar. Tenta novamente com a mesma chave.'},503);}
}
// Derive an isolated signing key; never expose raw customer or operator data.
function quoteKey(env){const secret=env.MANUAL_ORDER_SIGNING_SECRET??env.WORKER_GAS_SECRET;if(typeof secret!=='string'||Buffer.byteLength(secret.trim())<32)return null;return require('node:crypto').createHmac('sha256',secret).update('asheerah/manual-quote/key/v1').digest();}
function quoteDigest(key,domain,value){return require('node:crypto').createHmac('sha256',key).update(domain+'\0'+JSON.stringify(value)).digest('hex');}
function signQuote(key,user,input,pricing){const crypto=require('node:crypto'),payload=Buffer.from(JSON.stringify({v:1,operator:quoteDigest(key,'operator',user),request:quoteDigest(key,'request',input),price:quoteDigest(key,'pricing',pricing),expires:Date.now()+15*60*1000})).toString('base64url');return payload+'.'+crypto.createHmac('sha256',key).update('token\0'+payload).digest('base64url');}
function verifyQuote(token,key,user,input){
 const crypto=require('node:crypto');if(token.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))return null;
 const [payload,signature]=token.split('.'),actual=Buffer.from(signature,'base64url'),expected=crypto.createHmac('sha256',key).update('token\0'+payload).digest();
 if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
 try{const q=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));if(q.v!==1||!Number.isSafeInteger(q.expires)||q.expires<=Date.now()||q.expires>Date.now()+15*60*1000||q.operator!==quoteDigest(key,'operator',user)||q.request!==quoteDigest(key,'request',input)||!/^[a-f0-9]{64}$/.test(q.price))return null;return q;}catch{return null;}
}
function manualPricing(c){return {items:c.orderItems,subtotalCents:c.subtotalCents,discountCents:c.discountCents,shippingCents:c.shippingCents,totalCents:c.totalCents};}
async function quoteManual(request,env,user,url){
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return response({error:'Pedido inválido.'},403);
 if(env.MANAGEMENT_CAPTURE_ENABLED!=='1'||!env.CATALOG_URL)return response({error:'Criação não configurada.'},503);
 if(Number(request.headers.get('Content-Length')||0)>8000)return response({error:'Pedido demasiado grande.'},413);
 const raw=await request.text();if(Buffer.byteLength(raw)>8000)return response({error:'Pedido demasiado grande.'},413);
 let input;try{input=JSON.parse(raw);}catch{return response({error:'Pedido inválido.'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||!['whatsapp','instagram'].includes(input.channel))return response({error:'Pedido inválido.'},400);
 const {channel,...checkoutInput}=input;
 try{
  const result=await fetch(env.CATALOG_URL,{headers:{accept:'application/json'}});if(!result.ok)return response({error:'Catálogo indisponível.'},503);
  let checkout;try{checkout=require('./stripe-worker.cjs').normalizeCheckoutRequest(checkoutInput,await result.json(),env);}catch{return response({error:'Dados ou produto inválidos.'},400);}
  const key=quoteKey(env);if(!key)return response({error:'Criação não configurada.'},503);
  const pricing=manualPricing(checkout),quoteId=signQuote(key,user,{channel,...checkoutInput},pricing);
  return response({quoteId,...pricing});
 }catch{return response({error:'Não foi possível obter o orçamento.'},503);}
}
async function handle(request,env){
 if(new URL(request.url).pathname.startsWith('/management-api/auth/'))return auth.handle(request,env);
 const user=await identity(request,env);
 if(!user)return response({error:'Área privada. Inicia sessão com uma conta autorizada.'},401);
 if(!env.REVIEW_MEDIA)return response({error:'Área de gestão ainda não configurada.'},503);
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='GET'&&path==='/management-api/security-status'){
  const security=require('./public-security.cjs'),checks={};
  for(const [name,target] of Object.entries({stripe:env.GAS_WEBHOOK_URL,manual:env.MANUAL_ORDER_GAS_URL||env.GAS_WEBHOOK_URL})){
   try{const reply=await fetch(target,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(security.envelope(env,{action:'security_probe',encodingProbe:'é—🧪'}))});const result=await reply.json();checks[name]={compatible:reply.ok&&result.ok===true&&result.securityVersion===2&&result.manualOrderIdempotent===true};}catch{checks[name]={compatible:false};}
  }
  const reports=await env.REVIEW_MEDIA.list({prefix:'security-reports/'+new Date().toISOString().slice(0,10)+'/',limit:100});
  return response({checks,newsletterEnabled:env.NEWSLETTER_ENABLED==='1',cspReportsToday:reports.objects.length,cspReportsTruncated:!!reports.truncated});
 }
 if(path==='/management-api/newsletter'||path.startsWith('/management-api/newsletter/'))return require('./newsletter.cjs').handle(request,env,user);
 if(request.method==='GET'&&path==='/management-api/manual-catalog'){
  if(!env.CATALOG_URL)return response({error:'Catálogo não configurado.'},503);
  try{const result=await fetch(env.CATALOG_URL,{headers:{accept:'application/json'}});if(!result.ok)throw Error('catalog');return response(await result.json());}catch{return response({error:'Catálogo indisponível.'},503);}
 }
 if(request.method==='GET'&&path==='/management-api/manual-order-status'){
  const key=request.headers.get('Idempotency-Key')||'';if(!/^[a-zA-Z0-9_-]{32,128}$/.test(key))return response({error:'Chave inválida.'},400);
  try{const id=manualOrderId(user,key),saved=await readJson(env.REVIEW_MEDIA,snapshotKey(id));
   if(saved&&saved.value.id===id&&saved.value.createdBy===user&&saved.value.method==='manual_dashboard')return response({status:'committed',key,orderId:id});
   return response({status:'unknown',key});
  }catch{return response({error:'Não foi possível verificar o resultado.'},503);}
 }
 if(request.method==='POST'&&path==='/management-api/orders')return createManual(request,env,user,url);
 if(request.method==='POST'&&path==='/management-api/manual-quote')return quoteManual(request,env,user,url);
 if(request.method==='GET'&&path==='/management-api/orders'){
  const cursor=url.searchParams.get('cursor')||undefined;
  if(cursor&&cursor.length>2048)return response({error:'Página inválida.'},400);
  try{
   const batch=await env.REVIEW_MEDIA.list({prefix:'business-orders/',limit:100,...(cursor?{cursor}:{})});
   const orders=(await Promise.all(batch.objects.map(async obj=>{const saved=await readJson(env.REVIEW_MEDIA,obj.key);if(!saved||saved.value.isTest)return null;const op=await readJson(env.REVIEW_MEDIA,operationsKey(saved.value.id));return safeOrder(saved.value,op?.value,env);}))).filter(Boolean);
   return response({orders,cursor:batch.truncated?batch.cursor:null,identity:user,historyReady:!!await env.REVIEW_MEDIA.get('business-backfill-complete')});
  }catch{return response({error:'Não foi possível carregar as encomendas. Tenta novamente.'},502);}
 }
 const match=path.match(/^\/management-api\/orders\/([a-f0-9-]{36})$/i);
 if(request.method==='POST'&&match){
  if(request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return response({error:'Pedido inválido.'},403);
  if(Number(request.headers.get('Content-Length')||0)>8000)return response({error:'Pedido demasiado grande.'},413);
  const raw=await request.text();if(Buffer.byteLength(raw)>8000)return response({error:'Pedido demasiado grande.'},413);
  let input;try{input=JSON.parse(raw);}catch{return response({error:'Pedido inválido.'},400);}
  if(input?.action==='approve_paid_email'&&!manualEmailAvailable(env))return response({error:'O envio de e-mail de confirmação está temporariamente indisponível.',code:'manual_email_unavailable'},503);
  const saved=await readJson(env.REVIEW_MEDIA,snapshotKey(match[1]));if(!saved||saved.value.isTest)return response({error:'Encomenda não encontrada.'},404);
  const key=operationsKey(match[1]),current=await readJson(env.REVIEW_MEDIA,key);
  const replay=async state=>{const p=state?.paidEmail;if(input?.action!=='approve_paid_email'||input.acknowledged!==true||typeof input.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{32,128}$/.test(input.idempotencyKey)||input.expectedOrderDigest!==orderDigest(saved.value)||input.recipient!==saved.value.customer?.email||p?.approvalKeyHash!==require('node:crypto').createHash('sha256').update(input.idempotencyKey).digest('hex'))return null;return response({order:safeOrder(saved.value,state,env)});};
  const existing=await replay(current?.value);if(existing)return existing;
  let op;try{op=applyAction(saved.value,current?.value||blankOperations(saved.value,env),input,user);}catch(e){return response({error:e.message},409);}
  try{
   const written=await env.REVIEW_MEDIA.put(key,JSON.stringify(op),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
   if(!written){const latest=await readJson(env.REVIEW_MEDIA,key);return await replay(latest?.value)||response({error:'Outra pessoa atualizou este pedido. Atualiza a página.'},409);}
   return response({order:safeOrder(saved.value,op,env)});
  }catch{return response({error:'Não foi possível guardar. Tenta novamente.'},502);}
 }
 return response({error:'Não encontrado.'},404);
}
async function handlePage(request){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(url.pathname==='/gestao')return Response.redirect(url.origin+'/gestao/',302);
 if(!url.pathname.startsWith('/gestao/')||url.pathname.length>200)return new Response('Not found',{status:404});
 const target=new URL('https://jashe1728.github.io/asheerah-hair'+url.pathname);
 const version=url.searchParams.get('v');if(version&&/^[a-z0-9-]{1,60}$/i.test(version))target.searchParams.set('v',version);
 // Do not forward dashboard cookies or identity headers to the static asset host.
 const upstream=await fetch(target.href,{method:request.method});
 const out=new Headers(upstream.headers);
 out.set('cache-control','no-store');out.set('x-frame-options','DENY');out.set('x-content-type-options','nosniff');out.set('referrer-policy','same-origin');
 out.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://cdn.shopify.com https://asheerahhair.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
 return new Response(upstream.body,{status:upstream.status,headers:out});
}
module.exports={persistOrder,identity,handle,handlePage,applyAction,blankOperations,safeOrder,backfill};
