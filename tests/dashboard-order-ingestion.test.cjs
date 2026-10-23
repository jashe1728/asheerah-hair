const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {handleRequest}=require('../backend/stripe-worker.cjs');
function bucket(){const data=new Map();let version=0;return {data,async get(key){const o=data.get(key);return o?{etag:o.etag,text:async()=>o.text}:null;},async put(key,text,options={}){const o=data.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&o)return null;if(options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==o?.etag)return null;const etag=String(++version);data.set(key,{text,etag});return {etag};},async list({prefix}){return {objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};},async delete(key){data.delete(key);}};}
const origin='https://asheerahhair.com';
const catalog={currency:'EUR',products:[{handle:'synthetic-wig',title:'Synthetic Wig',images:['assets/logo-sm.png'],variants:[{title:'16 / 200%',opt1:'16',price_eur:100}]}]};
const customer={name:'Synthetic customer',email:'buyer@example.invalid',phone:'123456789',country:'PT',address:'Synthetic address',city:'Lisboa',postalCode:'1000-001'};
const cart={language:'fr',customer,items:[{handle:'synthetic-wig',options:{opt1:'16'},quantity:1}]};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status});
function environment(){return {MANAGEMENT_CAPTURE_ENABLED:'1',MANAGEMENT_ALLOWED_EMAILS:'owner@example.invalid',ORDER_EMAIL_ENABLED:'1',REVIEW_MEDIA:bucket(),RESEND_API_KEY:'synthetic-mail-key',TURNSTILE_SECRET:'synthetic-turnstile',SITE_ORIGIN:origin,SITE_BASE_URL:origin,MANUAL_ORDER_GAS_URL:'https://accounting.example.invalid/manual',GAS_WEBHOOK_URL:'https://accounting.example.invalid/stripe',CATALOG_URL:'https://catalog.example.invalid/catalog.json',WORKER_GAS_SECRET:'synthetic-worker-secret',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'synthetic-webhook-secret',STRIPE_MODE:'test'};}
async function managementOrders(env){const token='b'.repeat(64),digest=crypto.createHash('sha256').update(token).digest('hex');await env.REVIEW_MEDIA.put('management-auth/sessions/'+digest+'.json',JSON.stringify({email:'owner@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:15,expiresAt:Date.now()+60000}));const r=await handleRequest(new Request(origin+'/management-api/orders',{headers:{Cookie:'__Host-ah_management='+token}}),env);assert.equal(r.status,200);return (await r.json()).orders;}
test('Stripe checkout and signed paid callback feed the same private dashboard order without a real charge',async t=>{
 const env=environment(),original=global.fetch;let params,sends=0;
 global.fetch=async(url,options)=>{
  if(url===env.CATALOG_URL)return json(catalog);
  if(url===env.GAS_WEBHOOK_URL)return json({ok:true,status:'paid'});
  if(url==='https://api.stripe.com/v1/checkout/sessions'){params=new URLSearchParams(options.body);return json({id:'cs_test_synthetic',url:'https://checkout.stripe.com/c/pay/synthetic'});}
  if(url==='https://api.resend.com/emails'){sends++;assert.equal(JSON.parse(options.body).to[0],customer.email);return json({id:'synthetic-notification'});}
  throw Error('Unexpected external call');
 };t.after(()=>global.fetch=original);
 const checkout=await handleRequest(new Request(origin+'/create-checkout-session',{method:'POST',headers:{Origin:origin},body:JSON.stringify(cart)}),env);assert.equal(checkout.status,200);
 const id=params.get('client_reference_id'),before=(await managementOrders(env)).find(o=>o.id===id);assert.equal(before.status,'pending_checkout');assert.equal(before.items[0].title,'Synthetic Wig');assert.equal(before.language,'fr');assert.equal(sends,0);
 const event={id:'evt_test_synthetic',type:'checkout.session.completed',livemode:false,data:{object:{mode:'payment',id:'cs_test_synthetic',client_reference_id:id,payment_status:'paid',amount_total:before.totalCents}}};
 const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
 const webhook=()=>new Request(origin+'/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw});
 assert.equal((await handleRequest(webhook(),env)).status,200);assert.equal((await handleRequest(webhook(),env)).status,200);
 const rows=await managementOrders(env);assert.equal(rows.length,1);assert.equal(rows[0].status,'paid');assert.equal(rows[0].totalCents,before.totalCents);assert.equal(rows[0].sessionId,undefined);assert.equal(sends,1);
});
test('Guinea-Bissau Orange Money requests appear in the private dashboard as awaiting payment',async t=>{
 const env=environment(),original=global.fetch;
 global.fetch=async(url)=>String(url).includes('siteverify')?json({success:true,hostname:'asheerahhair.com',action:'order_request'}):url===env.CATALOG_URL?json(catalog):url===env.MANUAL_ORDER_GAS_URL?json({ok:true}):url==='https://api.resend.com/emails'?json({id:'synthetic-pending-notification'}):Promise.reject(Error('Unexpected external call'));
 t.after(()=>global.fetch=original);
 const id='33333333-3333-4333-8333-333333333333';const result=await handleRequest(new Request(origin+'/request-orange-money',{method:'POST',headers:{Origin:origin},body:JSON.stringify({...cart,customer:{...customer,country:'GW',city:'Bissau'},requestId:id,turnstileToken:'synthetic-token'})}),env);assert.equal(result.status,200);
 const rows=await managementOrders(env);assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].status,'awaiting_payment');assert.equal(rows[0].method,'orange_money');assert.equal(rows[0].operations.paymentConfirmation,undefined);
});
