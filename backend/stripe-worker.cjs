const nodeCrypto = require('node:crypto');
const crypto = nodeCrypto;
const MAX_BODY_BYTES = 24_000;
const MAX_ITEMS = 20;
const MAX_QTY = 10;

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
  if (Object.keys(input).some(k => !['customer','items'].includes(k))) throw new Error('Unexpected request fields');
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
  if (subtotalCents > 10_000_000 || subtotalCents + shippingCents > 10_000_000) throw new Error('Order exceeds maximum allowed amount');
  if (shippingCents > 0) lineItems.push({ price_data: { currency: 'eur', unit_amount: shippingCents, product_data: { name: 'Shipping' } }, quantity: 1 });
  return { customer: cleanCustomer, currency: 'eur', shippingRegion:shipping.region, allowedCountries:shipping.allowedCountries, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, lineItems };
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
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json', 'access-control-allow-origin':origin, 'access-control-allow-methods':'POST,GET,OPTIONS', 'access-control-allow-headers':'content-type', 'vary':'Origin' } });
}
async function stripePost(path, params, secret, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method:'POST', headers:{ authorization:`Bearer ${secret}`, 'content-type':'application/x-www-form-urlencoded', ...(idempotencyKey ? {'idempotency-key':idempotencyKey} : {}) }, body:params.toString() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Stripe request failed');
  return data;
}
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const allowedOrigin = env.SITE_ORIGIN;
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
  if (!allowedOrigin || origin !== allowedOrigin) return json({error:'Origin not allowed'},403,allowedOrigin || 'null');
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':allowedOrigin,'access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'}});
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
    const itemsSummary=checkout.lineItems.filter(x=>x.price_data.product_data.name!=='Shipping').map(x=>`${x.quantity}x ${x.price_data.product_data.name}`).join(' | ').slice(0,450);
    await forwardToGas(env,{action:'stripe_pending',orderId,customer:checkout.customer,itemsSummary,expectedTotalCents:checkout.totalCents,subtotalCents:checkout.subtotalCents,shippingCents:checkout.shippingCents,currency:'EUR'});
    const params = new URLSearchParams();
    params.set('mode','payment'); params.set('success_url',`${env.SITE_BASE_URL}/checkout.html?payment=success&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url',`${env.SITE_BASE_URL}/checkout.html?payment=cancelled&order_id=${orderId}`);
    params.set('customer_email',checkout.customer.email); params.set('client_reference_id',orderId);
    params.set('phone_number_collection[enabled]','true');
    params.set('billing_address_collection','required');
    checkout.allowedCountries.forEach(country=>params.append('shipping_address_collection[allowed_countries][]',country));
    params.set('metadata[order_id]',orderId); params.set('metadata[currency]','EUR');
    params.set('metadata[expected_total_cents]',String(checkout.totalCents));
    params.set('metadata[shipping_cents]',String(checkout.shippingCents));
    params.set('metadata[items_summary]',itemsSummary);
    params.set('payment_intent_data[metadata][order_id]',orderId);
    params.set('payment_intent_data[metadata][expected_total_cents]',String(checkout.totalCents));
    checkout.lineItems.forEach((item,i)=>{ params.set(`line_items[${i}][price_data][currency]`,item.price_data.currency); params.set(`line_items[${i}][price_data][unit_amount]`,String(item.price_data.unit_amount)); params.set(`line_items[${i}][price_data][product_data][name]`,item.price_data.product_data.name); params.set(`line_items[${i}][quantity]`,String(item.quantity)); });
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
