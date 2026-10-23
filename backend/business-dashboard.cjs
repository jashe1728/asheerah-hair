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
 // The email spool has a 30-day lifetime. Business history has a separate namespace.
 // CAS prevents an old checkout write from overwriting a newer paid snapshot.
 for(let i=0;i<5;i++){
  const current=await readJson(env.REVIEW_MEDIA,snapshotKey(order.id));
  const merged={...current?.value,...order};
  if(current?.value.status==='paid')merged.status='paid';
  const saved=await env.REVIEW_MEDIA.put(snapshotKey(order.id),JSON.stringify(merged),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  if(saved)return;
 }
 throw Error('Business order update conflict');
}
const identity=auth.identity;
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
 const {id,createdAt,language,method,status,customer,items,subtotalCents,discountCents,shippingCents,totalCents,couponCode,fulfillmentMethod,fulfillmentAddress}=order;
 return {id,createdAt,language,method,status,customer,items,subtotalCents,discountCents,shippingCents,totalCents,couponCode,fulfillmentMethod,fulfillmentAddress,operations:operations||blankOperations(order,env)};
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
   if(order.method!=='orange_money'||order.status!=='awaiting_payment'||paid||!reference.trim())throw Error('Só é possível confirmar um pagamento Orange Money pendente, com referência.');
   op.paymentConfirmation={at,by,reference:reference.trim(),amountCents:order.totalCents};
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
async function handle(request,env){
 if(new URL(request.url).pathname.startsWith('/management-api/auth/'))return auth.handle(request,env);
 const user=await identity(request,env);
 if(!user)return response({error:'Área privada. Inicia sessão com uma conta autorizada.'},401);
 if(!env.REVIEW_MEDIA)return response({error:'Área de gestão ainda não configurada.'},503);
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='GET'&&path==='/management-api/security-status'){
  const security=require('./public-security.cjs'),checks={};
  for(const [name,target] of Object.entries({stripe:env.GAS_WEBHOOK_URL,manual:env.MANUAL_ORDER_GAS_URL||env.GAS_WEBHOOK_URL})){
   try{const reply=await fetch(target,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(security.envelope(env,{action:'security_probe'}))});const result=await reply.json();checks[name]={compatible:reply.ok&&result.ok===true&&result.securityVersion===2&&result.manualOrderIdempotent===true};}catch{checks[name]={compatible:false};}
  }
  const reports=await env.REVIEW_MEDIA.list({prefix:'security-reports/'+new Date().toISOString().slice(0,10)+'/',limit:100});
  return response({checks,newsletterEnabled:env.NEWSLETTER_ENABLED==='1',cspReportsToday:reports.objects.length,cspReportsTruncated:!!reports.truncated});
 }
 if(path==='/management-api/newsletter'||path.startsWith('/management-api/newsletter/'))return require('./newsletter.cjs').handle(request,env,user);
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
  const saved=await readJson(env.REVIEW_MEDIA,snapshotKey(match[1]));if(!saved||saved.value.isTest)return response({error:'Encomenda não encontrada.'},404);
  const key=operationsKey(match[1]),current=await readJson(env.REVIEW_MEDIA,key);
  let op;try{op=applyAction(saved.value,current?.value||blankOperations(saved.value,env),input,user);}catch(e){return response({error:e.message},409);}
  try{
   const written=await env.REVIEW_MEDIA.put(key,JSON.stringify(op),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
   if(!written)return response({error:'Outra pessoa atualizou este pedido. Atualiza a página.'},409);
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
