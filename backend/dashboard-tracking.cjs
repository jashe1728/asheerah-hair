'use strict';
const crypto=require('node:crypto');
const {render}=require('./dashboard-customer-email.cjs');
const {validateAmounts}=require('./dashboard-customer-amounts.cjs');
const CARRIERS=Object.freeze({DHL:'https://www.dhl.com/pt-en/home/tracking.html','17TRACK':'https://extcall.17track.net/pt/multiline',FedEx:'https://www.fedex.com/pt-pt/tracking.html'});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status})};
const tag=(secret,id,m)=>crypto.createHmac('sha256',secret).update(JSON.stringify(['dashboard-customer/v1',id,m.eventId,m.version,m.kind,m.tracking,m.createdAt,m.expiresAt,m.orderDigest,m.digest,m.payload])).digest('hex');
function valid(secret,id,m){try{return hash(m.payload)===m.digest&&crypto.timingSafeEqual(Buffer.from(tag(secret,id,m),'hex'),Buffer.from(m.seal,'hex'))}catch{return false}}
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const approvalTag=(secret,id,m)=>crypto.createHmac('sha256',secret).update(JSON.stringify(['dashboard-customer/approval/v1',id,m.eventId,m.digest,m.version,m.approvedBy,m.approvedAt,m.approvalKey])).digest('hex');
function eligible(r,tracking=true,document=true){
 const o=r.order,p=r.operations;
 if(document)validateAmounts(o);
 if(o.isTest||!o.customer||typeof o.customer.name!=='string'||o.customer.name.length>200||typeof o.customer.email!=='string'||o.customer.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.customer.email)||!Number.isSafeInteger(o.totalCents)||o.totalCents<0||!Array.isArray(o.items)||!o.items.length||o.items.length>100||o.items.some(i=>typeof i.title!=='string'||i.title.length>1000||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>1000||String(i.variant||'').length>2000))fail('Encomenda inválida.');
 const manuallyPaid=['manual_dashboard','orange_money'].includes(o.method)&&o.status==='awaiting_payment'&&p.paymentConfirmation?.amountCents===o.totalCents;
 if(p.removed||!(o.status==='paid'||manuallyPaid)||o.method==='manual_dashboard'&&(o.version!==1||!/^[a-f0-9]{64}$/.test(o.manualRequestHash||'')||p.paymentConfirmation?.orderDigest!==hash(JSON.stringify(o))))fail('Pagamento não confirmado.');
 if(p.stage==='needs_review')fail('Classifica primeiro o histórico.');
 if(tracking&&(o.fulfillmentMethod==='pickup'||!['courier_accepted','delivered'].includes(p.stage)))fail('Seguimento apenas após entrega à transportadora; recolha tem fluxo próprio.');
}
// A store implements atomic read(id) -> {etag,value}, cas(id,etag,value). One
// record owns snapshot, tracking, sealed previews, approvals, attempts and audit.
function workflow({store,secret,now=()=>Date.now(),provider}){
 if(!store||typeof secret!=='string'||secret.length<32)throw Error('Missing private workflow configuration');
 const read=async id=>{const r=await store.read(id);if(!r)fail('Encomenda não encontrada.',404);return r};
 const write=async(id,r,value)=>{if(value.audit.length>1000||value.messages.length>100||Buffer.byteLength(JSON.stringify(value))>2500000)fail('Histórico ou documento demasiado grande; requer revisão.',413);if(!await store.cas(id,r.etag,value))fail('Conflito. Atualiza e revê novamente.');return value};
 const audit=(r,action,by,extra={})=>r.audit.push({action,by,at:new Date(now()).toISOString(),...extra});
 const admit=r=>{if(r.audit.length>=750)fail('Histórico próximo do limite. Requer revisão antes de nova comunicação.',413);};
 const busy=r=>r.messages.some(m=>['queued','sending','retryable','ambiguous','needs_review'].includes(m.status));
 return {
  async previewContent(id,eventId){const r=await read(id),m=r.value.messages.find(m=>m.eventId===eventId);if(!m?.payload||!valid(secret,id,m)||m.status==='draft'&&(now()>=m.expiresAt||m.version!==r.value.version))fail('Pré-visualização expirada. Reveja novamente.',410);return JSON.parse(m.payload);},
  async get(id){const {value:r}=await read(id);return {order:r.order,operations:r.operations,version:r.version,receiptOwned:!!r.receiptOwner||r.messages.some(m=>m.kind==='receipt'),tracking:r.tracking,carriers:CARRIERS,audit:r.audit,messages:r.messages.map(m=>({eventId:m.eventId,kind:m.kind,status:m.status,digest:m.digest,tracking:m.tracking,createdAt:m.createdAt,approvedBy:m.approvedBy,approvedAt:m.approvedAt,providerId:m.providerId,attempts:m.attempts,nextAttemptAt:m.nextAttemptAt,reviewReason:m.reviewReason}))}} ,
  async record(id,input,by){const r=await read(id),v=structuredClone(r.value);admit(v);eligible(v,true,false);if(input.version!==v.version||busy(v))fail('Versão desatualizada ou envio por resolver.');
   if(!Object.hasOwn(CARRIERS,input.carrier)||typeof input.code!=='string'||! /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,99}$/.test(input.code))fail('Transportadora ou código inválido.',400);
   v.tracking={carrier:input.carrier,code:input.code.trim(),url:CARRIERS[input.carrier]};v.version++;audit(v,'record_tracking',by,{tracking:v.tracking});return write(id,r,v);
  },
  async preview(id,input,by){const r=await read(id),v=structuredClone(r.value);const kind=input.kind||'tracking';admit(v);if(!['tracking','correction','receipt'].includes(kind))fail('Tipo inválido.',400);eligible(v,kind!=='receipt');if(input.version!==v.version||busy(v))fail('Atualiza antes de rever.');if(kind!=='receipt'&&!v.tracking)fail('Guarda primeiro o código.');
   const prior=v.messages.filter(m=>m.status==='accepted'&&m.kind!=='receipt').at(-1);
   if(kind==='correction'&&(!prior||JSON.stringify(prior.tracking)===JSON.stringify(v.tracking)))fail('Uma correção requer um envio anterior e um código diferente.');
   if(kind==='tracking'&&prior)fail('Usa a ação explícita de correção.');
   if(kind==='receipt'&&v.messages.some(m=>m.kind==='receipt'&&m.status==='accepted'))fail('Resumo já aceite pelo fornecedor de email.');
   if(kind==='receipt'&&v.order.method!=='manual_dashboard')fail('O resumo manual é reservado às encomendas criadas no dashboard.');
   const tracking=kind==='receipt'?null:v.tracking;
   const legacy=v.operations.paidEmail;
   if(kind==='receipt'&&legacy&&!(v.receiptOwner==='dashboard-v1'&&legacy.status==='dashboard_owned'&&legacy.owner==='dashboard-v1'))fail('O email anterior requer revisão; não duplique a confirmação.');
   const payload=JSON.stringify(await render(v.order,tracking,kind));
   if(kind==='receipt')v.receiptOwner='dashboard-v1';
   const m={eventId:crypto.randomUUID(),kind,tracking,version:v.version,status:'draft',createdAt:now(),expiresAt:now()+15*60000,orderDigest:hash(JSON.stringify(v.order)),payload,digest:hash(payload)};m.seal=tag(secret,id,m);v.messages=v.messages.filter(m=>m.status!=='draft');v.messages.push(m);audit(v,'preview',by,{eventId:m.eventId,digest:m.digest});await write(id,r,v);return {eventId:m.eventId,digest:m.digest,version:m.version,payload:JSON.parse(payload),expiresAt:m.expiresAt};
  },
  async approve(id,input,by){const r=await read(id),v=structuredClone(r.value),m=v.messages.find(m=>m.eventId===input.eventId);if(!m||input.acknowledged!==true||input.digest!==m.digest||input.version!==m.version||typeof input.key!=='string'||! /^[a-f0-9]{48}$/.test(input.key))fail('Revê o email e o PDF antes de aprovar.');
   if(m.approvalKey===hash(input.key)&&equal(m.approvalSeal,approvalTag(secret,id,m)))return {status:m.status,eventId:m.eventId};
   admit(v);if(!valid(secret,id,m))fail('Payload inválido.');
   eligible(v,m.kind!=='receipt');if(m.status!=='draft'||v.version!==m.version||m.orderDigest!==hash(JSON.stringify(v.order))||now()>=m.expiresAt||busy(v))fail('Aprovação expirada ou desatualizada.');
   m.status='queued';m.approvedBy=by;m.approvedAt=now();m.approvalKey=hash(input.key);m.approvalSeal=approvalTag(secret,id,m);v.version++;audit(v,'approve',by,{eventId:m.eventId,digest:m.digest});await write(id,r,v);return {status:'queued',eventId:m.eventId};
  },
  async resolve(id,input,by){
   const r=await read(id),v=structuredClone(r.value),m=v.messages.find(x=>x.eventId===input.eventId);
   const unattempted=m?.status==='queued'&&m.firstAttemptAt===undefined&&input.outcome==='confirmed_not_sent';
   if(input.version!==v.version||input.acknowledged!==true||!m||!unattempted&&!['ambiguous','needs_review','sending','retryable'].includes(m.status)||m.status==='sending'&&now()<m.leaseExpiresAt||typeof input.evidence!=='string'||input.evidence.trim().length<10||input.evidence.length>300||!['accepted','confirmed_not_sent'].includes(input.outcome))fail('Confirme o resultado no fornecedor e registe evidência.');
   if(input.outcome==='accepted'&&(typeof input.providerId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(input.providerId)))fail('Identificador do fornecedor obrigatório.');
   m.status=input.outcome==='accepted'?'accepted':'failed';if(input.outcome==='accepted')m.providerId=input.providerId;m.resolvedBy=by;m.resolvedAt=now();delete m.payload;v.version++;
   audit(v,'resolve',by,{eventId:m.eventId,outcome:input.outcome,evidence:input.evidence.trim(),providerId:m.providerId||null});await write(id,r,v);return {status:m.status};
  },
  async recover(id){const r=await read(id),v=structuredClone(r.value),m=v.messages.find(x=>x.status==='sending'&&now()>=x.leaseExpiresAt);if(!m)return {status:'idle'};m.status='needs_review';m.reviewReason='attempt_outcome_unknown';audit(v,'needs_review','server',{eventId:m.eventId});await write(id,r,v);return {status:'needs_review'};},
  async deliver(id){if(typeof provider!=='function')return {status:'disabled'};const r=await read(id),v=structuredClone(r.value),m=v.messages.find(m=>['queued','retryable'].includes(m.status));if(!m)return {status:'idle'};
   const review=async reason=>{m.status='needs_review';m.reviewReason=reason;if(reason==='sealed_payload_invalid')delete m.payload;audit(v,'needs_review','server',{eventId:m.eventId,reason});await write(id,r,v);return {status:'needs_review'};};
   if(!m.approvalKey||!valid(secret,id,m)||!equal(m.approvalSeal,approvalTag(secret,id,m)))return review('sealed_payload_invalid');
   if(m.orderDigest!==hash(JSON.stringify(v.order)))return review('snapshot_changed');
   try{eligible(v,m.kind!=='receipt')}catch{return review('order_no_longer_eligible')}
   if(m.firstAttemptAt!==undefined&&(!Number.isFinite(m.firstAttemptAt)||now()<m.firstAttemptAt||now()-m.firstAttemptAt>=23*3600000)){m.status='needs_review';m.reviewReason='retry_window_expired';audit(v,'retry_window_expired','server',{eventId:m.eventId});await write(id,r,v);return {status:'needs_review'}}
   if(m.nextAttemptAt&&now()<m.nextAttemptAt)return {status:'waiting'};
   m.status='sending';m.attempts=(m.attempts||0)+1;m.reservedAt=now();m.leaseExpiresAt=now()+300000;m.attemptId=crypto.randomUUID();m.firstAttemptAt??=now();m.lastAttemptAt=now();audit(v,'attempt','server',{eventId:m.eventId,attemptId:m.attemptId});await write(id,r,v);
   const final=await read(id),fm=final.value.messages.find(x=>x.eventId===m.eventId);
   if(fm?.status!=='sending'||fm.attemptId!==m.attemptId)return {status:'ambiguous'};
   const reviewClaim=async reason=>{const fresh=structuredClone(final.value),claim=fresh.messages.find(x=>x.eventId===m.eventId);claim.status='needs_review';claim.reviewReason=reason;if(reason==='sealed_payload_invalid')delete claim.payload;audit(fresh,'needs_review','server',{eventId:m.eventId,reason});await write(id,final,fresh);return {status:'needs_review'};};
   if(now()>=fm.leaseExpiresAt)return reviewClaim('lease_expired');
   if(fm.payload!==m.payload||!valid(secret,id,fm))return reviewClaim('sealed_payload_invalid');
   if(fm.orderDigest!==hash(JSON.stringify(final.value.order)))return reviewClaim('snapshot_changed');
   try{eligible(final.value,fm.kind!=='receipt')}catch{return reviewClaim('order_no_longer_eligible')}
   let result;try{result=await provider({payload:m.payload,idempotencyKey:'dashboard-customer/'+m.eventId})}catch{result={status:'ambiguous'}}
   const current=await read(id),next=structuredClone(current.value),saved=next.messages.find(x=>x.eventId===m.eventId);
   if(saved?.status!=='sending'||saved.attemptId!==m.attemptId)return {status:'ambiguous'};
   saved.status=result?.status==='accepted'&&typeof result.id==='string'&&result.id?'accepted':result?.status==='retryable'?'retryable':result?.status==='rejected'?'failed':'ambiguous';if(saved.status==='accepted')saved.providerId=result.id;
   if(Number.isInteger(result?.httpStatus))saved.reviewReason='provider_'+result.httpStatus;
   if(saved.status==='retryable')saved.nextAttemptAt=now()+Math.min(3600000,Math.max(60000*2**Math.min(saved.attempts-1,6),Number(result.retryAfterMs)||0));
   if(['accepted','failed'].includes(saved.status))delete saved.payload;
   audit(next,saved.status,'server',{eventId:m.eventId});try{await write(id,current,next)}catch{return {status:'ambiguous'}}return {status:saved.status};
  }
 };
}
module.exports={workflow,CARRIERS,hash};
