const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {EU_COUNTRIES,EUROPE_COUNTRIES,PICKUP_LOCATION,AMBASSADOR_COUPONS,EUROPE_SHIPPING_CENTS,INTL_SHIPPING_CENTS,PICKUP_SHIPPING_CENTS,shippingForCountry,normalizeCheckoutRequest,verifyStripeSignature,handleRequest}=require('../backend/stripe-worker.cjs');
const catalog={currency:'EUR',products:[{handle:'sample-wig',title:'Sample Wig',variants:[{title:'18 / HD',opt1:'18',opt2:'HD',opt3:null,opt4:null,price_eur:199.99}]}]};
const request=(country='PT',fulfillmentMethod='delivery')=>({customer:{name:'Test Buyer',email:'buyer@example.com',phone:'+351912345678',country,address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:2}],...(fulfillmentMethod?{fulfillmentMethod}:{})});

test('shipping quote endpoint returns EUR 7.99 for Europe countries and EUR 20 for non-Europe countries',async()=>{
  const env={SITE_ORIGIN:'https://jashe1728.github.io'};
  for (const euCountry of ['PT','Portugal','FR','France','DE','Germany']) {
    const res=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:euCountry})}),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.currency,'EUR');
    assert.equal(data.region,'EUROPE');
    assert.equal(data.shippingCents,799);
    assert.equal(data.fulfillmentMethod,'delivery');
  }
  for (const nonEuEurope of ['GB','United Kingdom','CH','Switzerland','NO','Norway','IS','Iceland','AD','Andorra','UA','Ukraine']) {
    const res=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:nonEuEurope})}),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.currency,'EUR');
    assert.equal(data.region,'EUROPE');
    assert.equal(data.shippingCents,799);
  }
  for (const intlCountry of ['US','United States','MZ','Mozambique','CA','Canada','AO','Angola','BR','Brazil']) {
    const res=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:intlCountry})}),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.currency,'EUR');
    assert.equal(data.region,'INTL');
    assert.equal(data.shippingCents,2000);
  }
  for (const boundaryCountry of ['TR','AM','AZ','GE','KZ']) {
    const res=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:boundaryCountry})}),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.currency,'EUR');
    assert.equal(data.region,'INTL');
    assert.equal(data.shippingCents,2000);
  }

  // Optional fulfillmentMethod in shipping-quote
  const pickupRes=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:'PT',fulfillmentMethod:'pickup'})}),env);
  assert.equal(pickupRes.status,200);
  const pickupData=await pickupRes.json();
  assert.equal(pickupData.shippingCents,0);
  assert.equal(pickupData.fulfillmentMethod,'pickup');
  assert.equal(pickupData.method,'pickup');
  assert.equal(pickupData.locationId,'midana-amadora');
  assert.match(pickupData.location,/Midana Beauty/);

  // Malicious pickup outside PT in shipping-quote rejected
  for (const nonPt of ['ES','FR','GB','US']) {
    const rejectPickup=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:nonPt,fulfillmentMethod:'pickup'})}),env);
    assert.equal(rejectPickup.status,422);
  }

  // Unknown fulfillmentMethod in shipping-quote rejected
  const unknownMethodRes=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:'PT',fulfillmentMethod:'drone'})}),env);
  assert.equal(unknownMethodRes.status,400);
});

test('shipping quote endpoint rejects unknown or invalid destination codes',async()=>{
  const env={SITE_ORIGIN:'https://jashe1728.github.io'};
  const response=await handleRequest(new Request('https://worker.example/shipping-quote',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({country:'Atlantis'})}),env);
  assert.equal(response.status,422);
});

test('all 27 EU member countries and 26 additional European territories charge EUR 7.99 shipping and lock Stripe delivery destination to the selected country',()=>{
  assert.equal(EU_COUNTRIES.length,27);
  assert.equal(EUROPE_COUNTRIES.length,53);
  for (const code of EUROPE_COUNTRIES) {
    const x=normalizeCheckoutRequest(request(code),catalog,{});
    assert.equal(x.countryCode,code);
    assert.equal(x.shippingRegion,'EUROPE');
    assert.equal(x.shippingCents,799);
    assert.equal(x.subtotalCents,39998);
    assert.equal(x.totalCents,40797);
    assert.deepEqual(x.allowedCountries,[code]);
    assert.equal(x.lineItems.length,2);
    assert.equal(x.lineItems[1].price_data.product_data.name,'Shipping');
    assert.equal(x.lineItems[1].price_data.unit_amount,799);
  }
  assert.equal(normalizeCheckoutRequest(request('Portugal'),catalog,{}).shippingCents,799);
  assert.equal(normalizeCheckoutRequest(request('France'),catalog,{}).shippingCents,799);
  assert.equal(normalizeCheckoutRequest(request('Deutschland'),catalog,{}).shippingCents,799);
  assert.equal(normalizeCheckoutRequest(request('United Kingdom'),catalog,{}).shippingCents,799);
  assert.equal(normalizeCheckoutRequest(request('Switzerland'),catalog,{}).shippingCents,799);
  assert.equal(normalizeCheckoutRequest(request('Norway'),catalog,{}).shippingCents,799);
});

test('non-European countries and excluded boundary countries charge EUR 20 shipping and lock Stripe delivery destination to the selected country',()=>{
  const targets=[['GB','United Kingdom'],['CH','Switzerland'],['NO','Norway'],['US','United States'],['MZ','Mozambique'],['CA','Canada'],['AO','Angola'],['BR','Brazil']];
  const nonEuIntlTargets=[['US','United States'],['MZ','Mozambique'],['CA','Canada'],['AO','Angola'],['BR','Brazil'],['TR','Türkiye'],['AM','Armenia'],['AZ','Azerbaijan'],['GE','Georgia'],['KZ','Kazakhstan']];
  for (const [code,name] of nonEuIntlTargets) {
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

test('PT home delivery vs Portugal pickup at midana-amadora',()=>{
  // 1. PT Home delivery
  const delivery=normalizeCheckoutRequest(request('PT','delivery'),catalog,{});
  assert.equal(delivery.fulfillmentMethod,'delivery');
  assert.equal(delivery.shippingCents,799);
  assert.equal(delivery.customer.address,'Rua A');
  assert.equal(delivery.customer.city,'Lisbon');
  assert.equal(delivery.customer.postalCode,'1000-001');
  assert.equal(delivery.customer.country,'PT');
  assert.equal(delivery.lineItems.length,2);
  assert.equal(delivery.lineItems[1].price_data.product_data.name,'Shipping');
  assert.equal(delivery.lineItems[1].price_data.unit_amount,799);

  // 2. PT Pickup at server-owned location id midana-amadora
  const forgedPickupRequest={
    customer:{
      name:'Ana Silva',
      email:'ana@example.com',
      phone:'+351912345678',
      country:'PT',
      address:'Malicious Client Address 123',
      city:'Porto',
      postalCode:'4000-001',
    },
    items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],
    fulfillmentMethod:'pickup',
  };
  const pickup=normalizeCheckoutRequest(forgedPickupRequest,catalog,{});
  assert.equal(pickup.fulfillmentMethod,'pickup');
  assert.equal(pickup.shippingCents,0);
  assert.equal(pickup.totalCents,pickup.subtotalCents);
  // Preserves customer contact
  assert.equal(pickup.customer.name,'Ana Silva');
  assert.equal(pickup.customer.email,'ana@example.com');
  assert.equal(pickup.customer.phone,'+351912345678');
  assert.equal(pickup.customer.country,'PT');
  // Overwrites fulfillment address from server constant
  assert.equal(pickup.customer.address,PICKUP_LOCATION.address);
  assert.equal(pickup.customer.city,PICKUP_LOCATION.city);
  assert.equal(pickup.customer.postalCode,PICKUP_LOCATION.postalCode);
  assert.equal(pickup.pickupLocationId,'midana-amadora');
  assert.equal(pickup.pickupLocation,PICKUP_LOCATION.fullAddress);
  assert.equal(pickup.fulfillmentAddress,PICKUP_LOCATION.fullAddress);
  // No shipping line item for pickup
  assert.equal(pickup.lineItems.length,1);
  assert.equal(pickup.lineItems[0].price_data.product_data.name.startsWith('Sample Wig'),true);
});

test('checkout rejects malicious pickup outside PT and unknown fulfillment methods',()=>{
  for (const nonPtCountry of ['ES','Spain','FR','France','US','United States','GB','United Kingdom']) {
    const maliciousPickup={
      customer:{name:'Attacker',email:'att@example.com',phone:'+3412345678',country:nonPtCountry,address:'Street 1',city:'City',postalCode:'12345'},
      items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],
      fulfillmentMethod:'pickup',
    };
    assert.throws(()=>normalizeCheckoutRequest(maliciousPickup,catalog,{}),/pickup is only available in portugal/i);
  }

  for (const badMethod of ['drone','express_pickup','carrier','']) {
    const badMethodRequest={
      customer:{name:'Buyer',email:'b@example.com',phone:'+351912345678',country:'PT',address:'Rua A',city:'Lisbon',postalCode:'1000-001'},
      items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],
      fulfillmentMethod:badMethod,
    };
    assert.throws(()=>normalizeCheckoutRequest(badMethodRequest,catalog,{}),/fulfillment method/i);
  }
});

test('checkout rejects an unknown destination without a valid ISO country',()=>{
  assert.throws(()=>normalizeCheckoutRequest(request('InvalidCountryXYZ'),catalog,{}),/shipping.*destination/i);
});

test('checkout computes EUR cents and resolves variant price from canonical catalog',()=>{
  const x=normalizeCheckoutRequest(request('PT'),catalog,{});
  assert.equal(x.subtotalCents,39998);
  assert.equal(x.shippingCents,799);
  assert.equal(x.totalCents,40797);
  assert.equal(x.lineItems[0].price_data.unit_amount,19999);
  assert.equal(x.lineItems[1].price_data.unit_amount,799);
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

test('all nine active ambassador coupon codes are accepted and old codes are rejected with exact discounted Stripe line items and metadata',()=>{
  // Old codes rejected
  for (const oldCode of ['ONIKA10','LILIAN10','TUCHA10','CASSIE10']) {
    const req=request('PT');
    req.couponCode=oldCode;
    assert.throws(()=>normalizeCheckoutRequest(req,catalog,{}),/ambassador coupon/i);
  }

  // All 4 EUR 7 new codes accepted
  for (const code7 of ['ONIKA01','LILIAN01','TUCHA01','CASSIE01','MIDANABT']) {
    const req=request('PT');
    req.couponCode=code7;
    const norm=normalizeCheckoutRequest(req,catalog,{});
    assert.equal(norm.couponCode,code7);
    assert.equal(norm.discountCents,700);
    assert.equal(norm.subtotalCents,39998);
    assert.equal(norm.shippingCents,799);
    assert.equal(norm.totalCents,39998 - 700 + 799);
  }

  // All 4 EUR 15 new codes accepted
  for (const code15 of ['ONIKAAH','LILIANAH','TUCHAAH','CASSIEAH']) {
    const req=request('PT');
    req.couponCode=code15;
    const norm=normalizeCheckoutRequest(req,catalog,{});
    assert.equal(norm.couponCode,code15);
    assert.equal(norm.discountCents,1500);
    assert.equal(norm.subtotalCents,39998);
    assert.equal(norm.shippingCents,799);
    assert.equal(norm.totalCents,39998 - 1500 + 799);
  }
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
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({...request('Mozambique'),language:'de-DE'})}),env);
    const result=await response.json();
    const params=new URLSearchParams(stripeBody);
    assert.equal(params.get('locale'),'de');assert.equal(params.get('metadata[order_language]'),'de');
    const pending=JSON.parse(gasForwards[0].payload);
    assert.equal(response.status,200);
    assert.equal(stripeAuthOk,true);
    assert.equal(pending.action,'stripe_pending');
    assert.equal(pending.subtotalCents,39998);
    assert.equal(pending.shippingCents,2000);
    assert.equal(pending.expectedTotalCents,41998);
    assert.equal(pending.customer.country,'MZ');
    assert.equal(pending.fulfillmentMethod,'delivery');
    assert.equal(pending.discountCents,0);
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
    assert.equal(params.get('metadata[fulfillment_method]'),'delivery');
    assert.deepEqual(params.getAll('shipping_address_collection[allowed_countries][]'),['MZ']);
  }finally{global.fetch=oldFetch;}
});

test('checkout handler creates Stripe Session for PT pickup with zero shipping and no shipping address collection',async()=>{
  const oldFetch=global.fetch;let stripeBody='';let stripeAuthOk=false;const gasForwards=[];
  global.fetch=async(url,options)=>{
    if(url==='https://catalog.example/catalog.json')return Response.json(catalog);
    if(url==='https://gas.example/exec'){gasForwards.push(JSON.parse(options.body));return Response.json({ok:true});}
    stripeAuthOk=options.headers.authorization==='Bearer sk_test_fake';stripeBody=options.body;
    return Response.json({id:'cs_test_pickup',url:'https://checkout.stripe.com/c/pay/cs_test_pickup'});
  };
  const env={SITE_ORIGIN:'https://jashe1728.github.io',SITE_BASE_URL:'https://jashe1728.github.io/asheerah-hair',CATALOG_URL:'https://catalog.example/catalog.json',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test',WORKER_GAS_SECRET:'gas_test',GAS_WEBHOOK_URL:'https://gas.example/exec'};
  const pickupBody={
    customer:{
      name:'Maria Santos',
      email:'maria@example.com',
      phone:'+351912345678',
      country:'PT',
      address:'Client Street 99',
      city:'Lisbon',
      postalCode:'1000-001',
    },
    items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],
    couponCode:'CASSIE01',
    fulfillmentMethod:'pickup',
  };
  try{
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify(pickupBody)}),env);
    const result=await response.json();
    assert.equal(response.status,200);
    const params=new URLSearchParams(stripeBody);
    const pending=JSON.parse(gasForwards[0].payload);

    // Shipping is 0, no Shipping line item
    assert.equal(params.get('line_items[0][price_data][unit_amount]'),String(19999 - 700));
    assert.match(params.get('line_items[0][price_data][product_data][name]'),/ambassador offer CASSIE01/i);
    assert.equal(params.get('line_items[1][price_data][product_data][name]'),null);

    // Stripe MUST NOT collect a replacement shipping address for pickup
    assert.equal(params.getAll('shipping_address_collection[allowed_countries][]').length,0);

    // Metadata contains fulfillment visibility
    assert.equal(params.get('metadata[fulfillment_method]'),'pickup');
    assert.equal(params.get('metadata[pickup_location_id]'),'midana-amadora');
    assert.equal(params.get('metadata[pickup_location]'),PICKUP_LOCATION.fullAddress);
    assert.equal(params.get('metadata[fulfillment_address]'),PICKUP_LOCATION.fullAddress);
    assert.equal(params.get('metadata[ambassador_code]'),'CASSIE01');
    assert.equal(params.get('metadata[coupon_discount_cents]'),'700');
    assert.equal(params.get('metadata[shipping_cents]'),'0');
    assert.equal(params.get('metadata[expected_total_cents]'),String(19999 - 700));

    // Payment intent metadata
    assert.equal(params.get('payment_intent_data[metadata][fulfillment_method]'),'pickup');
    assert.equal(params.get('payment_intent_data[metadata][pickup_location_id]'),'midana-amadora');
    assert.equal(params.get('payment_intent_data[metadata][pickup_location]'),PICKUP_LOCATION.fullAddress);
    assert.equal(params.get('payment_intent_data[metadata][fulfillment_address]'),PICKUP_LOCATION.fullAddress);
    assert.equal(params.get('payment_intent_data[metadata][ambassador_code]'),'CASSIE01');
    assert.equal(params.get('payment_intent_data[metadata][coupon_discount_cents]'),'700');

    // Signed GAS pending payload
    assert.equal(pending.action,'stripe_pending');
    assert.equal(pending.fulfillmentMethod,'pickup');
    assert.equal(pending.pickupLocationId,'midana-amadora');
    assert.equal(pending.pickupLocation,PICKUP_LOCATION.fullAddress);
    assert.equal(pending.fulfillmentAddress,PICKUP_LOCATION.fullAddress);
    assert.equal(pending.customer.name,'Maria Santos');
    assert.equal(pending.customer.email,'maria@example.com');
    assert.equal(pending.customer.phone,'+351912345678');
    assert.equal(pending.customer.country,'PT');
    assert.equal(pending.customer.address,PICKUP_LOCATION.address);
    assert.equal(pending.customer.city,PICKUP_LOCATION.city);
    assert.equal(pending.customer.postalCode,PICKUP_LOCATION.postalCode);
    assert.equal(pending.discountCents,700);
    assert.equal(pending.shippingCents,0);
    assert.equal(pending.expectedTotalCents,19999 - 700);
    assert.match(pending.itemsSummary,/Fulfillment: Pickup \[midana-amadora\]/);
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
