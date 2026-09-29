const nodeCrypto = require('node:crypto');
const crypto = nodeCrypto;
const MAX_BODY_BYTES = 24_000;
const MAX_ITEMS = 20;
const MAX_QTY = 10;
const MAX_REVIEW_BODY_BYTES = 22 * 1024 * 1024;
const MAX_REVIEW_MEDIA_FILES = 3;
const MAX_REVIEW_MEDIA_BYTES = 8 * 1024 * 1024;
const AMBASSADOR_COUPONS = Object.freeze({
  ONIKA10: 700,
  LILIAN10: 700,
  TUCHA10: 700,
  CASSIE10: 700,
});

const EU_COUNTRIES = ['BE','DE','ES','FR','IT','LU','NL','PT'];
const AFRICA_COUNTRIES = ['AO','CV','GW','MZ','SN','ST','ZA','CI'];
const COUNTRY_ENTRIES = [
  ['AT','Austria','Áustria'],['BE','Belgium','Bélgica','Belgique','Belgien','Belgio'],['BG','Bulgaria','Bulgária'],['HR','Croatia','Croácia'],['CY','Cyprus','Chipre'],['CZ','Czechia','Czech Republic','Chéquia'],['DK','Denmark','Dinamarca'],['EE','Estonia','Estónia'],['FI','Finland','Finlândia'],['FR','France','França','Frankreich','Francia'],['DE','Germany','Alemanha','Deutschland','Alemania','Allemagne','Germania'],['GR','Greece','Grécia'],['HU','Hungary','Hungria'],['IE','Ireland','Irlanda'],['IT','Italy','Itália','Italia','Italien','Italie'],['LV','Latvia','Letónia'],['LT','Lithuania','Lituânia'],['LU','Luxembourg','Luxemburgo','Luxemburg'],['MT','Malta'],['NL','Netherlands','The Netherlands','Holland','Países Baixos','Holanda','Países Bajos','Pays-Bas','Niederlande','Paesi Bassi'],['PL','Poland','Polónia'],['PT','Portugal'],['RO','Romania','Roménia'],['SK','Slovakia','Eslováquia'],['SI','Slovenia','Eslovénia'],['ES','Spain','Espanha','España','Espagne','Spanien','Spagna'],['SE','Sweden','Suécia'],
  ['AO','Angola'],['CV','Cape Verde','Cabo Verde','Kap Verde','Cap-Vert','Capo Verde'],['GW','Guinea-Bissau','Guiné-Bissau'],['MZ','Mozambique','Moçambique'],['SN','Senegal','Sénégal'],['ST','Sao Tome and Principe','São Tomé and Príncipe','São Tomé e Príncipe'],['ZA','South Africa','África do Sul','Afrique du Sud','Sudáfrica','Südafrika','Sudafrica'],['CI','Ivory Coast','Cote d Ivoire','Côte d’Ivoire','Costa do Marfim','Costa de Marfil','Elfenbeinküste','Costa d’Avorio'],['US','United States','United States of America','USA','Estados Unidos','États-Unis','Vereinigte Staaten','Stati Uniti']
];
function normalizeCountry(value){return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
const COUNTRY_LOOKUP = Object.fromEntries(COUNTRY_ENTRIES.flatMap(([code,...names])=>[[normalizeCountry(code),code],...names.map(name=>[normalizeCountry(name),code])]));
function shippingForCountry(value){
  const code=COUNTRY_LOOKUP[normalizeCountry(value)];
  if (EU_COUNTRIES.includes(code)) return {countryCode:code,region:'EU',shippingCents:0,allowedCountries:EU_COUNTRIES};
  if (AFRICA_COUNTRIES.includes(code)) return {countryCode:code,region:'Africa',shippingCents:2000,allowedCountries:AFRICA_COUNTRIES};
  if (code==='US') return {countryCode:code,region:'US',shippingCents:1500,allowedCountries:['US']};
  throw new Error('Shipping rate is not configured for this destination');
}


function cents(eur) {
  const n = Number(eur);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid catalog price');
  return Math.round(n * 100);
}
function safeText(v, max, field) {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw new Error(`Invalid ${field}`);
  return v.trim();
}
function normalizeCheckoutRequest(input, catalog, env) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request');
  const customer = input.customer;
  const items = input.items;
  if (!customer || !Array.isArray(items) || !items.length || items.length > MAX_ITEMS) throw new Error('Invalid cart or customer');
  if (Object.keys(input).some(k => !['customer','items','couponCode'].includes(k))) throw new Error('Unexpected request fields');
  const couponCode = input.couponCode == null ? '' : String(input.couponCode).trim().toUpperCase();
  if (couponCode && !Object.prototype.hasOwnProperty.call(AMBASSADOR_COUPONS,couponCode)) throw new Error('Invalid ambassador coupon');
  if (Object.keys(customer).some(k => !['name','email','phone','country','address','city','postalCode'].includes(k))) throw new Error('Unexpected customer fields');
  const cleanCustomer = {
    name: safeText(customer.name, 120, 'name'), email: safeText(customer.email, 254, 'email'),
    phone: safeText(customer.phone, 40, 'phone'), country: safeText(customer.country, 80, 'country'),
    address: safeText(customer.address, 200, 'address'), city: safeText(customer.city, 100, 'city'),
    postalCode: safeText(customer.postalCode, 24, 'postal code'),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCustomer.email)) throw new Error('Invalid email');
  if (!catalog || catalog.currency !== 'EUR' || !Array.isArray(catalog.products)) throw new Error('Catalog unavailable');
  const shipping = shippingForCountry(cleanCustomer.country);
  const shippingCents = shipping.shippingCents;
  let subtotalCents = 0;
  const lineItems = items.map(item => {
    if (!item || Object.keys(item).some(k => !['handle','options','quantity'].includes(k))) throw new Error('Unexpected cart item fields');
    const handle = safeText(item.handle, 120, 'product');
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw new Error('Invalid quantity');
    const options = item.options;
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !/^opt[1-4]$/.test(k))) throw new Error('Invalid variant options');
    const product = catalog.products.find(p => p.handle === handle);
    if (!product) throw new Error('Unknown product');
    const variant = (product.variants || []).find(v => ['opt1','opt2','opt3','opt4'].every(k => String(v[k] || '') === String(options[k] || '')));
    if (!variant) throw new Error('Unknown product variant');
    const unitCents = cents(variant.price_eur);
    subtotalCents += unitCents * quantity;
    return { price_data: { currency: 'eur', unit_amount: unitCents, product_data: { name: `${product.title} — ${variant.title}`.slice(0, 250) } }, quantity };
  });
  const discountCents = couponCode ? Math.min(AMBASSADOR_COUPONS[couponCode],subtotalCents) : 0;
  const totalCents = subtotalCents - discountCents + shippingCents;
  if (subtotalCents > 10_000_000 || totalCents > 10_000_000) throw new Error('Order exceeds maximum allowed amount');
  if (shippingCents > 0) lineItems.push({ price_data: { currency: 'eur', unit_amount: shippingCents, product_data: { name: 'Shipping' } }, quantity: 1 });
  return { customer: cleanCustomer, currency: 'eur', shippingRegion:shipping.region, allowedCountries:shipping.allowedCountries, subtotalCents, discountCents, couponCode, shippingCents, totalCents, lineItems };
}
function discountCheckoutLineItems(checkout){
  let remaining=checkout.discountCents||0;
  const result=[];
  checkout.lineItems.forEach(item=>{
    if (remaining<=0 || item.price_data.product_data.name==='Shipping') { result.push(item); return; }
    const unitAmount=item.price_data.unit_amount;
    let quantity=item.quantity;
    while (remaining>0 && quantity>0){
      const reduction=Math.min(remaining,unitAmount);
      const discountedAmount=unitAmount-reduction;
      if (discountedAmount>0) result.push({
        price_data:{...item.price_data,unit_amount:discountedAmount,product_data:{...item.price_data.product_data,name:`${item.price_data.product_data.name} — ambassador offer ${checkout.couponCode}`}},
        quantity:1,
      });
      remaining-=reduction;
      quantity--;
    }
    if (quantity>0) result.push({...item,quantity});
  });
  if (remaining>0) throw new Error('Ambassador coupon exceeds eligible item total');
  return result;
}
function verifyStripeSignature(body, signature, secret, now = Math.floor(Date.now()/1000)) {
  if (typeof body !== 'string' || !signature || !secret) return false;
  const parts = signature.split(',').map(x => x.split('='));
  const timestamp = Number((parts.find(x => x[0] === 't') || [])[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  return parts.filter(x => x[0] === 'v1').some(x => {
    if (!/^[a-f0-9]{64}$/i.test(x[1] || '')) return false;
    const candidate = Buffer.from(x[1], 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}
async function forwardToGas(env, payload) {
  const rawPayload = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256',env.WORKER_GAS_SECRET).update(rawPayload).digest('hex');
  const response = await fetch(env.GAS_WEBHOOK_URL,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify({payload:rawPayload,signature})});
  let ack;
  try { ack = await response.json(); } catch { ack = null; }
  if (!response.ok || !ack || ack.ok !== true) throw new Error('Apps Script payment record failed');
  return ack;
}

function json(data, status=200, origin='*') {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json', 'access-control-allow-origin':origin, 'access-control-allow-methods':'POST,GET,OPTIONS', 'access-control-allow-headers':'content-type,authorization', 'vary':'Origin' } });
}
function allowedSiteOrigin(env, origin){
  const configured=String(env.SITE_ORIGINS||env.SITE_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : '';
}
function safeReviewRecord(record,origin){
  return {id:record.id,productHandle:record.productHandle,name:record.name,rating:record.rating,text:record.text,createdAt:record.createdAt,media:(record.media||[]).map(file=>({url:`${origin}/review-media/${encodeURIComponent(file.key)}`,contentType:file.contentType}))};
}
function isReviewMedia(contentType, bytes){
  if(contentType==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(contentType==='image/png')return bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>bytes[i]===v);
  if(contentType==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(contentType==='video/mp4')return bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp';
  if(contentType==='video/webm')return bytes.length>=4&&[0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v);
  return false;
}
function mediaExtension(contentType){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'})[contentType]||'';}
async function reviewJson(bucket,key){
  const object=await bucket.get(key);
  if(!object)return null;
  try{return JSON.parse(await object.text());}catch{return null;}
}
function authMatches(request,token){
  const authorization=request.headers.get('Authorization')||'';
  const supplied=authorization.slice(0,7).toLowerCase()==='bearer '?authorization.slice(7).trim():'';
  if(!token||!supplied)return false;
  const a=Buffer.from(String(token)),b=Buffer.from(supplied);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function verifyTurnstile(request,form,env,origin){
  const responseToken=String(form.get('turnstileToken')||'');
  if(!responseToken)return false;
  if(!env.TURNSTILE_SECRET)return null;
  const body=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:responseToken});
  const ip=request.headers.get('CF-Connecting-IP');if(ip)body.set('remoteip',ip);
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString()}).then(r=>r.json()).catch(()=>null);
  return !!(result&&result.success&&result.hostname===new URL(origin).hostname);
}
async function handleReviewRequest(request,url,env,origin){
  const bucket=env.REVIEW_MEDIA;
  if(!bucket)return json({error:'Review storage is not configured'},503,origin);
  if(url.pathname==='/reviews/pending'&&request.method==='GET'){
    if(!authMatches(request,env.REVIEW_ADMIN_TOKEN))return json({error:'Unauthorized'},env.REVIEW_ADMIN_TOKEN?401:503,origin);
    try{
      const listed=await bucket.list({prefix:'reviews/',limit:1000}),reviews=[];
      for(const item of listed.objects||[]){const r=await reviewJson(bucket,item.key);if(r&&r.status==='pending')reviews.push({id:r.id,productHandle:r.productHandle,name:r.name,rating:r.rating,text:r.text,createdAt:r.createdAt,media:(r.media||[]).map(file=>({key:file.key,contentType:file.contentType,size:file.size}))});}
      reviews.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      return json({reviews},200,origin);
    }catch{return json({error:'Review queue is temporarily unavailable'},502,origin);}
  }
  if(url.pathname==='/reviews'&&request.method==='GET'){
    const product=String(url.searchParams.get('product')||'');
    if(!/^[a-z0-9-]{1,120}$/.test(product))return json({error:'Invalid product'},400,origin);
    try{
      const listed=await bucket.list({prefix:'reviews/',limit:1000});
      const reviews=[];
      for(const item of listed.objects||[]){const r=await reviewJson(bucket,item.key);if(r&&r.status==='approved'&&r.productHandle===product)reviews.push(safeReviewRecord(r,origin));}
      reviews.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({reviews:reviews.slice(0,100)},200,origin);
    }catch{return json({error:'Reviews are temporarily unavailable'},502,origin);}
  }
  if(url.pathname.startsWith('/review-media/')&&request.method==='GET'){
    let key='';try{key=decodeURIComponent(url.pathname.slice('/review-media/'.length));}catch{return json({error:'Not found'},404,origin);}
    const parts=key.split('/');
    const filename=(parts[2]||'').split('.');
    const validPath=parts.length===3&&parts[0]==='media'&&/^[a-f0-9-]{36}$/i.test(parts[1])&&filename.length===2&&/^[0-9]+$/.test(filename[0])&&['jpg','png','webp','mp4','webm'].includes(filename[1].toLowerCase());
    const match=validPath?[null,parts[1]]:null;
    if(!match)return json({error:'Not found'},404,origin);
    const review=await reviewJson(bucket,`reviews/${match[1]}.json`),isAdmin=authMatches(request,env.REVIEW_ADMIN_TOKEN);
    if(!review||((review.status!=='approved')&&!isAdmin)||!(review.media||[]).some(file=>file.key===key))return json({error:'Not found'},404,origin);
    const object=await bucket.get(key);if(!object)return json({error:'Not found'},404,origin);
    return new Response(await object.arrayBuffer(),{status:200,headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public, max-age=3600','x-content-type-options':'nosniff','access-control-allow-origin':origin,'vary':'Origin'}});
  }
  if(url.pathname==='/reviews/moderate'&&request.method==='POST'){
    if(!authMatches(request,env.REVIEW_ADMIN_TOKEN))return json({error:'Unauthorized'},env.REVIEW_ADMIN_TOKEN?401:503,origin);
    const raw=await request.text();if(raw.length>4_000)return json({error:'Request too large'},413,origin);
    let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid request'},400,origin);}
    if(!input||Object.keys(input).some(k=>!['reviewId','decision'].includes(k))||!/^([a-f0-9-]{36})$/i.test(String(input.reviewId||''))||!['approve','reject'].includes(input.decision))return json({error:'Invalid moderation request'},400,origin);
    const key=`reviews/${input.reviewId}.json`,review=await reviewJson(bucket,key);if(!review||review.status!=='pending')return json({error:'Review not found or already moderated'},404,origin);
    review.status=input.decision==='approve'?'approved':'rejected';review.moderatedAt=new Date().toISOString();
    if(input.decision==='reject')for(const file of review.media||[])await bucket.delete(file.key);
    await bucket.put(key,JSON.stringify(review),{httpMetadata:{contentType:'application/json'}});
    return json({ok:true,id:review.id,status:review.status},200,origin);
  }
  if(url.pathname==='/reviews'&&request.method==='POST'){
    const size=Number(request.headers.get('Content-Length')||0);if(size>MAX_REVIEW_BODY_BYTES)return json({error:'Upload too large'},413,origin);
    if(!env.TURNSTILE_SECRET)return json({error:'Review protection is not configured'},503,origin);
    let form;try{form=await request.formData();}catch{return json({error:'Invalid review upload'},400,origin);}
    const handle=String(form.get('productHandle')||''),name=String(form.get('name')||'').trim(),text=String(form.get('text')||'').trim(),rating=Number(form.get('rating'));
    if(!/^[a-z0-9-]{1,120}$/.test(handle)||!name||name.length>80||!text||text.length>500||!Number.isInteger(rating)||rating<1||rating>5)return json({error:'Invalid review'},400,origin);
    const files=form.getAll('media').filter(file=>file&&typeof file.arrayBuffer==='function'&&file.size>0);
    if(files.length>MAX_REVIEW_MEDIA_FILES)return json({error:'Upload up to three files'},413,origin);
    if(files.some(file=>file.size>MAX_REVIEW_MEDIA_BYTES))return json({error:'Each file must be 8 MB or smaller'},413,origin);
    const checked=[];let totalBytes=0;
    for(const file of files){const type=String(file.type||'').toLowerCase(),ext=mediaExtension(type);if(!ext)return json({error:'Use JPEG, PNG, WebP, MP4, or WebM files'},415,origin);const bytes=new Uint8Array(await file.arrayBuffer());if(!isReviewMedia(type,bytes))return json({error:'File content does not match its media type'},415,origin);totalBytes+=bytes.length;checked.push({type,ext,bytes});}
    if(totalBytes>20*1024*1024)return json({error:'Combined media must be 20 MB or smaller'},413,origin);
    let verified;try{verified=await verifyTurnstile(request,form,env,origin);}catch{verified=false;}
    if(verified===null)return json({error:'Review protection is not configured'},503,origin);
    if(!verified)return json({error:'Please complete the anti-spam check'},403,origin);
    const id=crypto.randomUUID(),stored=[];
    try{
      for(let i=0;i<checked.length;i++){
        const media=checked[i],key=`media/${id}/${i}.${media.ext}`;
        await bucket.put(key,media.bytes,{httpMetadata:{contentType:media.type,cacheControl:'private, no-store'}});
        stored.push({key,contentType:media.type,size:media.bytes.length});
      }
      const record={id,productHandle:handle,name,rating,text,createdAt:new Date().toISOString(),status:'pending',media:stored};
      await bucket.put(`reviews/${id}.json`,JSON.stringify(record),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
      return json({ok:true,id,status:'pending'},201,origin);
    }catch{for(const file of stored)try{await bucket.delete(file.key);}catch{}return json({error:'Review could not be saved'},502,origin);}
  }
  return json({error:'Method not allowed'},405,origin);
}
async function stripePost(path, params, secret, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method:'POST', headers:{ authorization:`Bearer ${secret}`, 'content-type':'application/x-www-form-urlencoded', ...(idempotencyKey ? {'idempotency-key':idempotencyKey} : {}) }, body:params.toString() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Stripe request failed');
  return data;
}
async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/webhook' && request.method === 'POST') {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES || !verifyStripeSignature(raw,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET)) return json({error:'Invalid webhook signature'},400,'*');
    let event;
    try { event = JSON.parse(raw); } catch { return json({error:'Invalid event'},400,'*'); }
    if (!['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type)) return json({received:true},200,'*');
    if (!env.GAS_WEBHOOK_URL || !env.WORKER_GAS_SECRET) return json({error:'Webhook forwarder is not configured'},503,'*');
    try { await forwardToGas(env,{action:'stripe_event',eventId:event.id,eventType:event.type,session:event.data?.object}); }
    catch { return json({error:'Payment event could not be recorded'},502,'*'); }
    return json({received:true},200,'*');
  }
  const origin = request.headers.get('Origin') || '';
  if (!origin && url.pathname.startsWith('/review-media/') && request.method === 'GET') return handleReviewRequest(request,url,env,'*');
  const allowedOrigin = allowedSiteOrigin(env,origin);
  if (!allowedOrigin) return json({error:'Origin not allowed'},403,'null');
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':allowedOrigin,'access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'content-type,authorization','vary':'Origin'}});
  if (url.pathname==='/reviews'||url.pathname.startsWith('/reviews/')||url.pathname.startsWith('/review-media/')) return handleReviewRequest(request,url,env,allowedOrigin);
  if (url.pathname === '/shipping-quote') {
    if (request.method !== 'POST') return json({error:'Method not allowed'},405,allowedOrigin);
    const raw = await request.text();
    if (raw.length > 2_000) return json({error:'Request too large'},413,allowedOrigin);
    let input;
    try { input = JSON.parse(raw); } catch { return json({error:'Invalid request'},400,allowedOrigin); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.country !== 'string') return json({error:'Invalid request'},400,allowedOrigin);
    try { const rate=shippingForCountry(input.country); return json({currency:'EUR',region:rate.region,shippingCents:rate.shippingCents},200,allowedOrigin); }
    catch { return json({error:'Shipping is not available to that destination at the listed rates.'},422,allowedOrigin); }
  }
  if (url.pathname !== '/create-checkout-session' || request.method !== 'POST') return json({error:'Not found'},404,allowedOrigin);
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.WORKER_GAS_SECRET || !env.GAS_WEBHOOK_URL || !env.CATALOG_URL || !env.SITE_BASE_URL) return json({error:'Checkout is not configured'},503,allowedOrigin);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({error:'Request too large'},413,allowedOrigin);
  let input;
  try { input = JSON.parse(raw); } catch { return json({error:'Invalid request'},400,allowedOrigin); }
  let orderId = '';
  try {
    const catalogResponse = await fetch(env.CATALOG_URL,{headers:{accept:'application/json'}});
    if (!catalogResponse.ok) throw new Error('Catalog unavailable');
    const checkout = normalizeCheckoutRequest(input,await catalogResponse.json(),env);
    orderId = crypto.randomUUID();
    const itemsSummary=(checkout.couponCode ? `Ambassador coupon: ${checkout.couponCode} | ` : '') + checkout.lineItems.filter(x=>x.price_data.product_data.name!=='Shipping').map(x=>`${x.quantity}x ${x.price_data.product_data.name}`).join(' | ');
    await forwardToGas(env,{action:'stripe_pending',orderId,customer:checkout.customer,itemsSummary:itemsSummary.slice(0,450),expectedTotalCents:checkout.totalCents,subtotalCents:checkout.subtotalCents,shippingCents:checkout.shippingCents,currency:'EUR'});
    const params = new URLSearchParams();
    params.set('mode','payment'); params.set('success_url',`${env.SITE_BASE_URL}/checkout.html?payment=success&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url',`${env.SITE_BASE_URL}/checkout.html?payment=cancelled&order_id=${orderId}`);
    params.set('customer_email',checkout.customer.email); params.set('client_reference_id',orderId);
    params.set('phone_number_collection[enabled]','true');
    params.set('billing_address_collection','required');
    checkout.allowedCountries.forEach(country=>params.append('shipping_address_collection[allowed_countries][]',country));
    if (checkout.couponCode){
      params.set('metadata[ambassador_code]',checkout.couponCode);
      params.set('metadata[coupon_discount_cents]',String(checkout.discountCents));
      params.set('payment_intent_data[metadata][ambassador_code]',checkout.couponCode);
    }
    params.set('metadata[order_id]',orderId); params.set('metadata[currency]','EUR');
    params.set('metadata[expected_total_cents]',String(checkout.totalCents));
    params.set('metadata[shipping_cents]',String(checkout.shippingCents));
    params.set('metadata[items_summary]',itemsSummary);
    params.set('payment_intent_data[metadata][order_id]',orderId);
    params.set('payment_intent_data[metadata][expected_total_cents]',String(checkout.totalCents));
    discountCheckoutLineItems(checkout).forEach((item,i)=>{ params.set(`line_items[${i}][price_data][currency]`,item.price_data.currency); params.set(`line_items[${i}][price_data][unit_amount]`,String(item.price_data.unit_amount)); params.set(`line_items[${i}][price_data][product_data][name]`,item.price_data.product_data.name); params.set(`line_items[${i}][quantity]`,String(item.quantity)); });
    const session = await stripePost('checkout/sessions',params,env.STRIPE_SECRET_KEY,`asheerah-${orderId}`);
    await forwardToGas(env,{action:'stripe_session_created',orderId,sessionId:session.id});
    return json({checkoutUrl:session.url,orderId},200,allowedOrigin);
  } catch (err) {
    if (orderId) { try { await forwardToGas(env,{action:'stripe_checkout_failed',orderId}); } catch {} }
    if (err.message === 'Shipping rate is not configured for this destination') return json({error:'Shipping is not available to that destination at the listed rates.'},422,allowedOrigin);
    return json({error:'Unable to start secure checkout'},502,allowedOrigin);
  }
}
module.exports = { normalizeCheckoutRequest, verifyStripeSignature, handleRequest, fetch: handleRequest };
