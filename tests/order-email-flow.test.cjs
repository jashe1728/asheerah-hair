const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {handleRequest}=require('../backend/stripe-worker.cjs');
const {deliver}=require('../backend/order-email.cjs');
const {fixture}=require('../backend/preview-order-email.cjs');
const {languages,translator}=require('../backend/order-email-i18n.cjs');
function bucket(){const data=new Map();return {data,async get(k){return data.has(k)?{text:async()=>data.get(k)}:null;},async put(k,v,opts){if(opts?.onlyIf&&data.has(k))return null;data.set(k,v);return {key:k};},async delete(k){data.delete(k);}};}
const env=()=>({ORDER_EMAIL_ENABLED:'1',REVIEW_MEDIA:bucket(),RESEND_API_KEY:'test-key',TURNSTILE_SECRET:'turnstile',SITE_ORIGIN:'https://asheerahhair.com',MANUAL_ORDER_GAS_URL:'https://accounting.example/manual',CATALOG_URL:'https://catalog.example/catalog.json',GAS_WEBHOOK_URL:'https://accounting.example/stripe',WORKER_GAS_SECRET:'worker',STRIPE_WEBHOOK_SECRET:'webhook'});
const catalog={currency:'EUR',products:[{handle:'sample',title:'Sample Wig',images:['assets/img/p6-27-model-v3.jpg'],variants:[{title:'16 / 200%',opt1:'16',price_eur:100}]}]};
const body={requestId:'00000000-0000-4000-8000-000000000004',turnstileToken:'good',customer:{name:'Test Customer',email:'test@example.com',phone:'123456789',country:'GW',address:'Street 1',city:'Bissau',postalCode:'1000'},items:[{handle:'sample',options:{opt1:'16'},quantity:2}],couponCode:'ONIKAAH',fulfillmentMethod:'delivery'};
const manual=b=>new Request('https://asheerahhair.com/request-orange-money',{method:'POST',headers:{Origin:'https://asheerahhair.com'},body:JSON.stringify(b)});
function mocks(t,handler){const old=global.fetch;global.fetch=handler;t.after(()=>global.fetch=old);}
function json(x,status=200){return new Response(JSON.stringify(x),{status});}

for(const language of languages)test(language+': checkout automatically emails once after its signed paid event',async t=>{
 const e={...env(),SITE_BASE_URL:'https://asheerahhair.com',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_MODE:'test'};
 let stripeParams,email,sends=0;
 mocks(t,async(url,init)=>{
  if(url===e.CATALOG_URL)return json(catalog);
  if(url===e.GAS_WEBHOOK_URL)return json({ok:true,status:'paid'});
  if(url==='https://api.stripe.com/v1/checkout/sessions'){stripeParams=new URLSearchParams(init.body);return json({id:'cs_test_'+language,url:'https://checkout.stripe.com/c/pay/test'});}
  if(url==='https://api.resend.com/emails'){email=JSON.parse(init.body);sends++;return json({id:'test_delivery_'+language});}
  throw Error('Unexpected integration');
 });
 const checkout={language,customer:{...body.customer,country:'PT'},items:body.items};
 const response=await handleRequest(new Request('https://asheerahhair.com/create-checkout-session',{method:'POST',headers:{Origin:e.SITE_ORIGIN},body:JSON.stringify(checkout)}),e);
 assert.equal(response.status,200);assert.equal(sends,0,'starting checkout must not send a paid receipt');
 const id=stripeParams.get('client_reference_id'),stored=JSON.parse(e.REVIEW_MEDIA.data.get('order-notifications/'+id+'.json'));
 assert.equal(stored.language,language);assert.equal(stripeParams.get('locale'),language);
 const event={id:'evt_test_'+language,type:'checkout.session.completed',livemode:false,data:{object:{mode:'payment',id:'cs_test_'+language,client_reference_id:id,payment_status:'paid',amount_total:stored.totalCents}}};
 const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',e.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
 const webhook=()=>new Request('https://asheerahhair.com/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw});
 assert.equal((await handleRequest(webhook(),e)).status,200);
 assert.equal((await handleRequest(webhook(),e)).status,200);
 assert.equal(sends,1);assert.ok(email.subject.includes(translator(language)('Pagamento confirmado')));
 assert.ok(email.html.includes('lang="'+language+'"'));assert.equal(email.attachments.length,1);
 assert.ok(JSON.parse(e.REVIEW_MEDIA.data.get('order-notifications/'+id+'.json')).emailSentAt);
});
test('manual order validates prices, saves accounting, sends PDF once and keeps awaiting-payment status',async t=>{const e=env();let accounting=0,sends=0;let email;
 mocks(t,async(url,init)=>{if(String(url).includes('siteverify'))return json({success:true,hostname:'asheerahhair.com',action:'order_request'});if(url===e.CATALOG_URL)return json(catalog);if(url===e.MANUAL_ORDER_GAS_URL){accounting++;assert.equal(JSON.parse(init.body).totalEur,205);return json({ok:true});}if(url==='https://api.resend.com/emails'){sends++;email=JSON.parse(init.body);return json({id:'email_1'});}throw new Error('Unexpected URL');});
 const first=await handleRequest(manual({...body,language:'en'}),e);assert.equal(first.status,200);assert.equal((await first.json()).status,'awaiting_payment');const second=await handleRequest(manual({...body,language:'en'}),e);assert.equal(second.status,200);assert.equal(accounting,1);assert.equal(sends,1);assert.match(email.html,/Awaiting payment confirmation/);assert.equal(JSON.parse(e.REVIEW_MEDIA.data.get('order-notifications/'+body.requestId+'.json')).language,'en');assert.match(Buffer.from(email.attachments[0].content,'base64').toString('ascii'),/^%PDF/);
});
test('manual request rejects non-GW destinations and client-supplied prices before email',async t=>{const e=env();mocks(t,async url=>String(url).includes('siteverify')?json({success:true,hostname:'asheerahhair.com',action:'order_request'}):json(catalog));assert.equal((await handleRequest(manual({...body,customer:{...body.customer,country:'PT'}}),e)).status,422);assert.equal((await handleRequest(manual({...body,items:[{...body.items[0],price:1}]}),e)).status,502);assert.equal(e.REVIEW_MEDIA.data.size,0);});
test('manual order requires the right Turnstile action',async t=>{const e=env();mocks(t,async()=>json({success:true,hostname:'asheerahhair.com',action:'review'}));assert.equal((await handleRequest(manual(body),e)).status,403);});
test('provider failure retains saved manual request for retry',async t=>{const e=env();mocks(t,async url=>String(url).includes('siteverify')?json({success:true,hostname:'asheerahhair.com',action:'order_request'}):url===e.CATALOG_URL?json(catalog):url===e.MANUAL_ORDER_GAS_URL?json({ok:true}):json({error:'Unavailable'},503));const r=await handleRequest(manual(body),e);assert.equal(r.status,200);assert.equal((await r.json()).emailSent,false);assert.ok(e.REVIEW_MEDIA.data.has('order-notifications/'+body.requestId+'.json'));});
test('retry uses byte-identical provider payload and stable idempotency key',async t=>{const e=env();const order={...fixture,language:'it'};const attempts=[];mocks(t,async(url,init)=>{attempts.push(init);return attempts.length===1?json({error:'temporary'},503):json({id:'sent_1'});});await assert.rejects(deliver(e,order));order.language='de';await deliver(e,order);assert.match(JSON.parse(attempts[0].body).subject,/Pagamento confermato/);assert.equal(attempts[0].body,attempts[1].body);assert.equal(attempts[0].headers['Idempotency-Key'],attempts[1].headers['Idempotency-Key']);});
test('only a GAS-confirmed, signed paid Stripe event sends a confirmation',async t=>{const e=env();await e.REVIEW_MEDIA.put('order-notifications/'+fixture.id+'.json',JSON.stringify({...fixture,language:'fr',status:'pending_checkout',sessionId:'cs_live_1'}));let sends=0;mocks(t,async (url,init)=>{if(url===e.GAS_WEBHOOK_URL)return json({ok:true,status:'paid'});if(url==='https://api.resend.com/emails'){sends++;assert.match(JSON.parse(init.body).subject,/Paiement confirm?/);return json({id:'sent_stripe'});}throw new Error('Unexpected URL');});const event={id:'evt_1',type:'checkout.session.completed',data:{object:{id:'cs_live_1',client_reference_id:fixture.id,payment_status:'paid',amount_total:fixture.totalCents}}};const raw=JSON.stringify(event),now=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',e.STRIPE_WEBHOOK_SECRET).update(now+'.'+raw).digest('hex');const req=()=>new Request('https://asheerahhair.com/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${now},v1=${signature}`},body:raw});assert.equal((await handleRequest(req(),e)).status,200);assert.equal((await handleRequest(req(),e)).status,200);assert.equal(sends,1);});
