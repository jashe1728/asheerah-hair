'use strict';
const SITE = 'https://asheerahhair.com';
const FROM = 'Asheerah Hair <noreply@asheerahhair.com>';
const REPLY = 'asheerahhair@gmail.com';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euroFormat = new Intl.NumberFormat('pt-PT', {style:'currency', currency:'EUR'});
const money = n => euroFormat.format(n / 100);
function imageUrl(path) {
  const url = new URL(String(path || ''), SITE + '/');
  return url.origin === SITE && /^\/assets\/(?:img\/)?[a-zA-Z0-9_. -]+\.(?:png|jpe?g|webp)$/.test(decodeURIComponent(url.pathname)) ? url.href : SITE + '/assets/logo-sm.png';
}
function snapshot(checkout, id, method = 'stripe') {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid order reference');
  return {version:1,id,createdAt:new Date().toISOString(),method,status:method==='stripe'?'pending_checkout':'awaiting_payment',customer:checkout.customer,items:checkout.orderItems,subtotalCents:checkout.subtotalCents,discountCents:checkout.discountCents,shippingCents:checkout.shippingCents,totalCents:checkout.totalCents,couponCode:checkout.couponCode,fulfillmentMethod:checkout.fulfillmentMethod,fulfillmentAddress:checkout.fulfillmentAddress,shippingRegion:checkout.shippingRegion};
}
function content(order) {
  const paid = order.status === 'paid';
  const pickup = order.fulfillmentMethod === 'pickup';
  return {
    title:paid?'Obrigada pela sua compra!':'Recebemos o seu pedido!',
    status:paid?'Pagamento confirmado':'A aguardar confirmação do pagamento',
    intro:paid?'Obrigada por escolher a Asheerah Hair. É um prazer fazer parte da sua história e ajudá-la a sentir-se ainda mais confiante.':'Obrigada por escolher a Asheerah Hair. Guardámos o seu pedido com carinho. A encomenda será confirmada após a receção do pagamento.',
    next:pickup?'Avisaremos quando a sua encomenda estiver pronta para recolha. Aguarde a nossa confirmação antes de se deslocar à loja.':(paid?'Entraremos em contacto com os detalhes do envio assim que estiverem disponíveis.':'Após a confirmação do pagamento, entraremos em contacto com os próximos passos.'),
    eta:pickup?'Recolha após aviso da equipa':order.shippingRegion==='EUROPE'?'Prazo de entrega estimado: 6–10 dias úteis':'Prazo de entrega estimado: 9–15 dias',
    total:paid?'Total pago':'Total a pagar',
  };
}
const design=require('./order-email-design.cjs');
function renderEmail(order){return design.email(order,{content,money,esc,imageUrl,SITE,REPLY});}
function makePdf(order){return design.pdf(order,{content,money,REPLY});}
const key=id=>'order-notifications/'+id+'.json';
async function readOrder(env,id){if(!/^[a-f0-9-]{36}$/i.test(id||''))return null;const obj=await env.REVIEW_MEDIA.get(key(id));return obj?JSON.parse(await obj.text()):null;}
async function writeOrder(env,order){
  for(let attempt=0;attempt<5;attempt++){
    const existing=await env.REVIEW_MEDIA.get(key(order.id));
    const current=existing?JSON.parse(await existing.text()):{};
    const merged={...current,...order};
    for(const field of ['emailAttemptAt','emailSentAt','emailProviderId'])if(current[field])merged[field]=current[field];
    if(current.status==='paid')merged.status='paid';
    const onlyIf=existing?(existing.etag?{etagMatches:existing.etag}:null):{etagDoesNotMatch:'*'};
    const saved=await env.REVIEW_MEDIA.put(key(order.id),JSON.stringify(merged),{...(onlyIf?{onlyIf}:{}),httpMetadata:{contentType:'application/json'}});
    if(saved){Object.assign(order,merged);return merged;}
  }
  throw new Error('Order notification update conflict');
}
async function createOrder(env,order){return !!(await env.REVIEW_MEDIA.put(key(order.id),JSON.stringify(order),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));}
async function deliver(env,order){
  if(order.emailSentAt)return {sent:true,duplicate:true};
  if(!['paid','awaiting_payment'].includes(order.status))throw new Error('Order is not ready for notification');
  if(!env.RESEND_API_KEY)throw new Error('Email sender is not configured');
  // Provider idempotency lasts 24h. Never blindly resend an ambiguous attempt later.
  if(order.emailAttemptAt&&Date.now()-Date.parse(order.emailAttemptAt)>23*3600000)throw new Error('Email needs manual delivery review');
  if(!order.emailAttemptAt){order.emailAttemptAt=new Date().toISOString();await writeOrder(env,order);}
  if(order.emailSentAt)return {sent:true,duplicate:true};
  const preparedKey='order-email-payloads/'+order.id+'.json';
  const prepared=await env.REVIEW_MEDIA.get(preparedKey);
  let payload;
  if(prepared) payload=await prepared.text();
  else {
    const email=renderEmail(order);
    const pdf=await makePdf(order);
    payload=JSON.stringify({from:FROM,to:[order.customer.email],...(order.method==='orange_money'?{bcc:[REPLY]}:{}),reply_to:REPLY,...email,attachments:[{filename:'Asheerah-Hair-'+order.id+'.pdf',content:Buffer.from(pdf).toString('base64')}]});
    const created=await env.REVIEW_MEDIA.put(preparedKey,payload,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if(!created)payload=await (await env.REVIEW_MEDIA.get(preparedKey)).text();
  }
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'order-confirmation/'+order.id},body:payload});
  const result=await response.json();if(!response.ok||!result.id)throw new Error('Email provider did not accept the notification');
  order.emailSentAt=new Date().toISOString();order.emailProviderId=result.id;await writeOrder(env,order);return {sent:true};
}
async function retryPending(env){
  if(env.ORDER_EMAIL_ENABLED!=='1'||!env.REVIEW_MEDIA)return;
  const position=await env.REVIEW_MEDIA.get('order-email-cursor');
  const cursor=position?await position.text():undefined;
  {
    const batch=await env.REVIEW_MEDIA.list({prefix:'order-notifications/',limit:10,...(cursor?{cursor}:{})});
    for(const obj of batch.objects){
      const saved=await env.REVIEW_MEDIA.get(obj.key);if(!saved)continue;
      const order=JSON.parse(await saved.text());
      if(order.status==='recording_request'&&Date.now()-Date.parse(order.createdAt)>120000){order.status='awaiting_payment';order.accountingStatus='needs_review';await writeOrder(env,order);}
      if(!order.emailSentAt&&['paid','awaiting_payment'].includes(order.status)){
        try{await deliver(env,order);}catch{console.error('Order email needs retry/review: '+order.id);}
      }
      // Private notification copies are temporary, not the accounting ledger.
      if(Date.now()-Date.parse(order.createdAt)>30*86400000&&(order.emailSentAt||order.status==='pending_checkout')&&order.accountingStatus!=='needs_review'){
        await env.REVIEW_MEDIA.delete(obj.key);await env.REVIEW_MEDIA.delete('order-email-payloads/'+order.id+'.json');
      }
    }
    await env.REVIEW_MEDIA.put('order-email-cursor',batch.truncated?batch.cursor:'');
  }
}
module.exports={snapshot,renderEmail,makePdf,imageUrl,readOrder,writeOrder,createOrder,deliver,retryPending,FROM,REPLY};
