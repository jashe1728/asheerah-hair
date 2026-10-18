const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {EU_COUNTRIES,shippingForCountry,normalizeCheckoutRequest,verifyStripeSignature,handleRequest}=require('../backend/stripe-worker.cjs');
const catalog={currency:'EUR',products:[{handle:'sample-wig',title:'Sample Wig',variants:[{title:'18 / HD',opt1:'18',opt2:'HD',opt3:null,opt4:null,price_eur:199.99}]}]};
const request=(country='PT')=>({customer:{name:'Test Buyer',email:'buyer@example.com',phone:'+351****5678',country,address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:2}]});

test('shipping quote endpoint returns EUR 5.99 for EU countries and EUR 20 for non-EU countries',async()=>{
  const env={SITE_ORIGIN:'https://jashe1728.github.io'};
  for (const euCountry of ['PT','Portugal','FR','France','DE','Germany']) {
    const res=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:euCountry})}),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.currency,'EUR');
    assert.equal(data.region,'EU');
    assert.equal(data.shippingCents,599);
  }
  for (const intlCountry of ['GB','United Kingdom','CH','Switzerland','NO','Norway','US','United States','MZ','Mozambique','CA','Canada']) {
    const res=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:intlCountry})}),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.currency,'EUR');
    assert.equal(data.region,'INTL');
    assert.equal(data.shippingCents,2000);
  }
});

test('shipping quote endpoint rejects unknown or invalid destination codes',async()=>{
  const env={SITE_ORIGIN:'https://jashe1728.github.io'};
  const response=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:'Atlantis'})}),env);
  assert.equal(response.status,422);
});

test('all 27 EU member countries charge EUR 5.99 shipping and lock Stripe delivery destination to the selected country',()=>{
  assert.equal(EU_COUNTRIES.length,27);
  for (const code of EU_COUNTRIES) {
    const x=normalizeCheckoutRequest(request(code),catalog,{});
    assert.equal(x.countryCode,code);
    assert.equal(x.shippingRegion,'EU');
    assert.equal(x.shippingCents,599);
    assert.equal(x.subtotalCents,39998);
    assert.equal(x.totalCents,40597);
    assert.deepEqual(x.allowedCountries,[code]);
    assert.equal(x.lineItems.length,2);
    assert.equal(x.lineItems[1].price_data.product_data.name,'Shipping');
    assert.equal(x.lineItems[1].price_data.unit_amount,599);
  }
  assert.equal(normalizeCheckoutRequest(request('Portugal'),catalog,{}).shippingCents,599);
  assert.equal(normalizeCheckoutRequest(request('France'),catalog,{}).shippingCents,599);
  assert.equal(normalizeCheckoutRequest(request('Deutschland'),catalog,{}).shippingCents,599);
});

test('all non-EU countries (UK, Switzerland, Norway, US, Mozambique, etc.) charge EUR 20 shipping and lock Stripe delivery destination to the selected country',()=>{
  const targets=[['GB','United Kingdom'],['CH','Switzerland'],['NO','Norway'],['US','United States'],['MZ','Mozambique'],['CA','Canada'],['AO','Angola'],['BR','Brazil']];
  for (const [code,name] of targets) {
    for (const input of [code,name]) {
      const x=normalizeCheckoutRequest(request(input),catalog,{});
      assert.equal(x.countryCode,code);
      assert.equal(x.shippingRegion,'INTL');
      assert.equal(x.shippingCents,2000);
      assert.equal(x.subtotalCents,39998);
      assert.equal(x.totalCents,41998);
      assert.deepEqual(x.allowedCountries,[code]);
      assert.equal(x.lineItems.length,2);
      assert.equal(x.lineItems[1].price_data.product_data.name,'Shipping');
      assert.equal(x.lineItems[1].price_data.unit_amount,2000);
    }
  }
});

test('checkout rejects an unknown destination without a valid ISO country',()=>{
  assert.throws(()=>normalizeCheckoutRequest(request('InvalidCountryXYZ'),catalog,{}),/shipping.*destination/i);
});

test('checkout computes EUR cents and resolves variant price from canonical catalog',()=>{
  const x=normalizeCheckoutRequest(request('PT'),catalog,{});
  assert.equal(x.subtotalCents,39998);
  assert.equal(x.shippingCents,599);
  assert.equal(x.totalCents,40597);
  assert.equal(x.lineItems[0].price_data.unit_amount,19999);
  assert.equal(x.lineItems[1].price_data.unit_amount,599);
});

test('checkout rejects forged prices, tampered shipping/totals, and unknown variants',()=>{
  const forged=request();forged.items[0].price=1;
  assert.throws(()=>normalizeCheckoutRequest(forged,catalog,{}),/unexpected|invalid/i);
  const forgedShipping=request('US');forgedShipping.shippingCents=0;
  assert.throws(()=>normalizeCheckoutRequest(forgedShipping,catalog,{}),/unexpected/i);
  const forgedTotal=request('US');forgedTotal.totalCents=100;
  assert.throws(()=>normalizeCheckoutRequest(forgedTotal,catalog,{}),/unexpected/i);
  const unknown=request();unknown.items[0].options.opt1='99';
  assert.throws(()=>normalizeCheckoutRequest(unknown,catalog,{}),/variant|option/i);
});

test('checkout rejects invalid customer data and quantity',()=>{
  const bad=request();bad.customer.email='bad';
  assert.throws(()=>normalizeCheckoutRequest(bad,catalog,{}),/email/i);
  const qty=request();qty.items[0].quantity=0;
  assert.throws(()=>normalizeCheckoutRequest(qty,catalog,{}),/quantity/i);
});

test('Stripe signature rejects tampered and stale webhook bodies',()=>{
  const secret='whsec_test',timestamp=Math.floor(Date.now()/1000),body='{"id":"evt_1"}',digest=crypto.createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
  assert.equal(verifyStripeSignature(body,`t=${timestamp},v1=${digest}`,secret),true);
  assert.equal(verifyStripeSignature(body+' ',`t=${timestamp},v1=${digest}`,secret),false);
  assert.equal(verifyStripeSignature(body,`t=${timestamp-600},v1=${digest}`,secret),false);
});

test('checkout handler creates Stripe Session with server-priced line items, separate Shipping charge, and locked destination country',async()=>{
  const oldFetch=global.fetch;let stripeBody='';let stripeAuthOk=false;const gasForwards=[];
  global.fetch=async(url,options)=>{
    if(url==='https://catalog.example/catalog.json')return Response.json(catalog);
    if(url==='https://gas.example/exec'){gasForwards.push(JSON.parse(options.body));return Response.json({ok:true});}
    stripeAuthOk=options.headers.authorization==='Bearer sk_test_fake';stripeBody=options.body;
    return Response.json({id:'cs_test_123',url:'https://checkout.stripe.com/c/pay/cs_test'});
  };
  const env={SITE_ORIGIN:'https://jashe1728.github.io',SITE_BASE_URL:'https://jashe1728.github.io/asheerah-hair',CATALOG_URL:'https://catalog.example/catalog.json',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test',WORKER_GAS_SECRET:'gas_test',GAS_WEBHOOK_URL:'https://gas.example/exec'};
  try{
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify(request('Mozambique'))}),env);
    const result=await response.json();
    const params=new URLSearchParams(stripeBody);
    const pending=JSON.parse(gasForwards[0].payload);
    assert.equal(response.status,200);
    assert.equal(stripeAuthOk,true);
    assert.equal(pending.action,'stripe_pending');
    assert.equal(pending.subtotalCents,39998);
    assert.equal(pending.shippingCents,2000);
    assert.equal(pending.expectedTotalCents,41998);
    assert.equal(pending.customer.country,'MZ');
    assert.equal(gasForwards[0].signature.length,64);
    assert.equal(JSON.parse(gasForwards[1].payload).action,'stripe_session_created');
    assert.equal(result.checkoutUrl,'https://checkout.stripe.com/c/pay/cs_test');
    assert.equal(params.get('line_items[0][price_data][unit_amount]'),'19999');
    assert.equal(params.get('line_items[1][price_data][product_data][name]'),'Shipping');
    assert.equal(params.get('line_items[1][price_data][unit_amount]'),'2000');
    assert.equal(params.get('success_url').startsWith(`${env.SITE_BASE_URL}/checkout.html?payment=success`),true);
    assert.equal(params.get('metadata[expected_total_cents]'),'41998');
    assert.equal(params.get('metadata[shipping_cents]'),'2000');
    assert.equal(params.get('metadata[shipping_country]'),'MZ');
    assert.deepEqual(params.getAll('shipping_address_collection[allowed_countries][]'),['MZ']);
  }finally{global.fetch=oldFetch;}
});

test('Stripe webhook verifies the raw signature without Origin and forwards an HMAC wrapper',async()=>{
  const secret='whsec_test',gasSecret='worker-gas';
  const event={id:'evt_session',type:'checkout.session.completed',data:{object:{id:'cs_test',client_reference_id:'ord_test',amount_total:42998,currency:'eur',payment_status:'paid',metadata:{expected_total_cents:'42998'}}}};
  const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
  const oldFetch=global.fetch;let forwarded;
  global.fetch=async(_url,opts)=>{forwarded=JSON.parse(opts.body);return Response.json({ok:true});};
  try{
    const res=await handleRequest(new Request('https://worker.example/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`},body}),{STRIPE_WEBHOOK_SECRET:secret,GAS_WEBHOOK_URL:'https://gas.example/exec',WORKER_GAS_SECRET:gasSecret});
    assert.equal(res.status,200);
    assert.equal(typeof forwarded.payload,'string');
    assert.match(forwarded.signature,/^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(JSON.parse(forwarded.payload),'sharedSecret'),false);
  }finally{global.fetch=oldFetch;}
});
