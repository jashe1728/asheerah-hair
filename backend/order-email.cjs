'use strict';
const { PDFDocument, StandardFonts, rgb } = require('./order-pdf.cjs');
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
function renderEmail(order) {
  const c = content(order);
  const rows = order.items.map(i=>`<tr><td width="90" style="padding:18px 12px 18px 0;vertical-align:top"><img src="${esc(imageUrl(i.image))}" alt="${esc(i.title)}" width="76" style="display:block;width:76px;height:auto;border-radius:8px"></td><td style="padding:18px 0;border-bottom:1px solid #e9dfd0"><strong>${esc(i.title)}</strong><br><span style="font-size:13px;color:#70675a">${esc(i.variant || Object.values(i.opts||{}).filter(Boolean).join(' · '))}<br>Quantidade: ${i.qty} · ${money(i.unitCents)} / un.</span><br><strong>${money(i.unitCents*i.qty)}</strong></td></tr>`).join('');
  const totals = [['Subtotal',money(order.subtotalCents)],...(order.discountCents?[['Desconto'+(order.couponCode?' — '+order.couponCode:''),'−'+money(order.discountCents)]]:[]),['Envio',order.shippingCents?money(order.shippingCents):'Grátis'],[c.total,money(order.totalCents)]];
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.title}</title></head><body style="margin:0;background:#f7f3ed;color:#362511;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${c.status} — o resumo da sua encomenda Asheerah Hair.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px"><tr><td style="padding:32px 24px"><img src="${SITE}/assets/logo-sm.png" alt="Asheerah Hair" width="160" style="display:block;width:160px;height:auto;margin-bottom:28px"><p style="font-size:12px;letter-spacing:1px;color:#7a6545;overflow-wrap:anywhere">ENCOMENDA ${esc(order.id)}</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:400;line-height:1.2">${c.title}</h1><p style="line-height:1.7">Olá, ${esc(order.customer.name)}.</p><p style="line-height:1.7">${c.intro}</p><p style="background:#f8f2e7;padding:14px;border-radius:8px;font-size:14px"><strong>${c.status}</strong></p>${!paidOrder(order)?'<p style="line-height:1.6">Orange Money<br><strong>Ciara Ly · +245 95 734 21 44</strong><br>O envio deste pedido não confirma o pagamento.</p>':''}<h2 style="font-family:Georgia,serif;font-weight:400;font-size:23px;margin-top:30px">As suas escolhas</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table><table role="presentation" width="100%" style="margin:20px 0" cellspacing="0" cellpadding="0">${totals.map((r,j)=>`<tr><td style="padding:7px 0;${j===totals.length-1?'font-weight:bold;font-size:19px':''}">${esc(r[0])}</td><td align="right" style="padding:7px 0;white-space:nowrap;${j===totals.length-1?'font-weight:bold;font-size:19px':''}">${esc(r[1])}</td></tr>`).join('')}</table><h2 style="font-family:Georgia,serif;font-size:23px;font-weight:400">${order.fulfillmentMethod==='pickup'?'Ponto de recolha':'Entrega'}</h2><p style="line-height:1.6;overflow-wrap:anywhere">${esc(order.fulfillmentAddress)}</p><p style="line-height:1.6">${c.next}<br>${c.eta}</p><p style="font-size:14px;line-height:1.6">O resumo em PDF segue em anexo, com os artigos e os seus dados. Este documento é um resumo da encomenda, não uma fatura fiscal.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td bgcolor="#362511" style="border-radius:24px"><a href="${SITE}/pages/contact.html" style="display:inline-block;padding:15px 24px;color:white;text-decoration:none;font-weight:bold">Fale connosco</a></td></tr></table><p style="line-height:1.7">Com carinho,<br><strong>A equipa Asheerah Hair</strong></p><p style="font-size:12px;color:#70675a;line-height:1.7">Pode responder a este email para ${REPLY}.<br><a href="${SITE}" style="color:#7a6545">Visite a nossa loja</a></p></td></tr></table></td></tr></table></body></html>`;
  const text = [c.title,'Encomenda '+order.id,'Olá, '+order.customer.name+'.',c.intro,c.status,...order.items.map(i=>`${i.title} — ${i.variant||''} — ${i.qty} x ${money(i.unitCents)} = ${money(i.unitCents*i.qty)}`),...totals.map(r=>r.join(': ')),order.fulfillmentAddress,c.next,c.eta,!paidOrder(order)?'Orange Money: Ciara Ly · +245 95 734 21 44':'Pagamento: Stripe','Resumo em PDF em anexo (não é uma fatura fiscal).','Com carinho, a equipa Asheerah Hair',REPLY].filter(Boolean).join('\n\n');
  const note=order.customer.notes||'';
  const finalHtml=note?html.replace('<p style="font-size:14px;',`<h2 style="font-family:Georgia,serif;font-size:23px;font-weight:400">Notas do pedido</h2><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(note)}</p><p style="font-size:14px;`):html;
  return {subject:`Asheerah Hair — ${c.status} — ${order.id}`,html:finalHtml,text:text+(note?'\n\nNotas do pedido: '+note:'')};
}
function paidOrder(order){return order.status==='paid';}
async function makePdf(order, logoBytes) {
  const pdf = await PDFDocument.load();
  const regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page, y;
  const ink=rgb(.21,.145,.067), gold=rgb(.61,.46,.24);
  const clean=s=>Array.from(String(s)).map(c=>{try{regular.encodeText(c);return c;}catch{return '?';}}).join('');
  let first=true;
  function newPage(){page=first?pdf.getPage(0):pdf.addPage([595.28,841.89]);y=first?692:790;first=false;page.drawText('ASHEERAH HAIR · RESUMO DA ENCOMENDA',{x:44,y:25,size:8,font:regular,color:gold});}
  function line(text,size=10,strong=false){
    const font=strong?bold:regular,space=font.widthOfTextAtSize(' ',size);let row='',width=0;
    for(const word of clean(text).split(/\s+/)){
      const wordWidth=font.widthOfTextAtSize(word,size);
      if(row&&width+space+wordWidth>505){draw(row);row='';width=0;}
      if(wordWidth<=505){if(row){row+=' ';width+=space;}row+=word;width+=wordWidth;}
      else for(const ch of word){const w=font.widthOfTextAtSize(ch,size);if(width+w>505){draw(row);row='';width=0;}row+=ch;width+=w;}
    }
    if(row)draw(row);
    function draw(t){if(y<65)newPage();page.drawText(t,{x:44,y,size,font,color:ink});y-=size+6;}
  }
  newPage();
  const c=content(order); line(c.title,23,true);y-=8;line('Referência: '+order.id,10,true);line('Data: '+order.createdAt.slice(0,10));line(c.status,12,true);line('Pagamento: '+(order.method==='stripe'?'Stripe':'Orange Money'));y-=15;
  line('Dados da cliente',14,true);for(const s of [order.customer.name,order.customer.email,order.customer.phone])line(s);y-=12;
  line(order.fulfillmentMethod==='pickup'?'Ponto de recolha':'Morada de entrega',14,true);line(order.fulfillmentAddress);line(c.eta);y-=15;
  line('Artigos',14,true);for(const i of order.items){if(y<130)newPage();line(i.title,11,true);line(i.variant||Object.values(i.opts||{}).filter(Boolean).join(' · '));line(`Quantidade: ${i.qty}     Preço unitário: ${money(i.unitCents)}     Total: ${money(i.qty*i.unitCents)}`);y-=9;}
  if(y<190)newPage();line('Subtotal: '+money(order.subtotalCents));if(order.discountCents)line('Desconto '+(order.couponCode||'')+': -'+money(order.discountCents));line('Envio: '+(order.shippingCents?money(order.shippingCents):'Grátis'));line(c.total+': '+money(order.totalCents),15,true);y-=12;
  if(!paidOrder(order))line('Orange Money: Ciara Ly · +245 95 734 21 44. Confirmação após receção do pagamento.');
  line(c.next);if(order.customer.notes){y-=10;line('Notas do pedido',12,true);line(order.customer.notes);}y-=10;line('Resumo da encomenda — não constitui fatura fiscal.',9);line('Com carinho, a equipa Asheerah Hair · '+REPLY,9);
  pdf.setTitle('Asheerah Hair — Encomenda '+order.id);pdf.setAuthor('Asheerah Hair');pdf.setCreationDate(new Date(order.createdAt));pdf.setModificationDate(new Date(order.createdAt));
  return pdf.save({useObjectStreams:false});
}
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
