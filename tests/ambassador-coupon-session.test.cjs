const test=require('node:test');
const assert=require('node:assert/strict');
const {handleRequest}=require('../backend/stripe-worker.cjs');

const catalog={currency:'EUR',products:[{handle:'sample-wig',title:'Sample Wig',variants:[{title:'18 / HD',opt1:'18',opt2:'HD',opt3:null,opt4:null,price_eur:50}]}]};

test('Stripe checkout applies a server-validated EUR 7 ambassador discount to merchandise, includes separate Shipping line item, and records attribution and fulfillment',async()=>{
  const oldFetch=global.fetch;
  let sessionParams,pending;
  global.fetch=async(url,options)=>{
    if(url==='https://catalog.example/catalog.json') return Response.json(catalog);
    if(url==='https://gas.example/exec'){const forwarded=JSON.parse(JSON.parse(options.body).payload);if(forwarded.action==='stripe_pending')pending=forwarded;return Response.json({ok:true});}
    const params=new URLSearchParams(options.body);
    if(url==='https://api.stripe.com/v1/checkout/sessions'){sessionParams=params;return Response.json({id:'cs_test_coupon',url:'https://checkout.stripe.com/c/pay/cs_test_coupon'});}
    throw new Error(`Unexpected fetch ${url}`);
  };
  const env={SITE_ORIGIN:'https://asheerahhair.com',SITE_BASE_URL:'https://asheerahhair.com',CATALOG_URL:'https://catalog.example/catalog.json',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test',WORKER_GAS_SECRET:'gas_test',GAS_WEBHOOK_URL:'https://gas.example/exec'};
  const body={customer:{name:'Buyer',email:'buyer@example.com',phone:'+351900000000',country:'PT',address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],couponCode:'MIDANABT'};
  try{
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify(body)}),env);
    assert.equal(response.status,200);
    const lineItemCount=Number(sessionParams.get('line_items[0][quantity]'));
    assert.equal(sessionParams.get('line_items[0][price_data][unit_amount]'),'4300');
    assert.equal(lineItemCount,1);
    assert.match(sessionParams.get('line_items[0][price_data][product_data][name]'),/ambassador offer MIDANABT/i);
    assert.equal(sessionParams.get('line_items[1][price_data][product_data][name]'),'Shipping');
    assert.equal(sessionParams.get('line_items[1][price_data][unit_amount]'),'799');
    assert.equal(sessionParams.get('line_items[1][quantity]'),'1');
    assert.equal(sessionParams.get('metadata[ambassador_code]'),'MIDANABT');
    assert.equal(sessionParams.get('metadata[coupon_discount_cents]'),'700');
    assert.equal(sessionParams.get('metadata[shipping_cents]'),'799');
    assert.equal(sessionParams.get('metadata[shipping_country]'),'PT');
    assert.equal(sessionParams.get('metadata[fulfillment_method]'),'delivery');
    assert.equal(sessionParams.get('metadata[expected_total_cents]'),'5099');
    assert.deepEqual(sessionParams.getAll('shipping_address_collection[allowed_countries][]'),['PT']);
    assert.equal(pending.subtotalCents,5000);
    assert.equal(pending.discountCents,700);
    assert.equal(pending.shippingCents,799);
    assert.equal(pending.expectedTotalCents,5099);
    assert.equal(pending.fulfillmentMethod,'delivery');
    assert.match(pending.itemsSummary,/MIDANABT/);
    assert.match(pending.itemsSummary,/Fulfillment: Delivery/);
  }finally{global.fetch=oldFetch;}
});

test('Stripe checkout applies a server-validated EUR 15 ambassador discount to merchandise',async()=>{
  const oldFetch=global.fetch;
  let sessionParams,pending;
  global.fetch=async(url,options)=>{
    if(url==='https://catalog.example/catalog.json') return Response.json(catalog);
    if(url==='https://gas.example/exec'){const forwarded=JSON.parse(JSON.parse(options.body).payload);if(forwarded.action==='stripe_pending')pending=forwarded;return Response.json({ok:true});}
    const params=new URLSearchParams(options.body);
    if(url==='https://api.stripe.com/v1/checkout/sessions'){sessionParams=params;return Response.json({id:'cs_test_coupon',url:'https://checkout.stripe.com/c/pay/cs_test_coupon'});}
    throw new Error(`Unexpected fetch ${url}`);
  };
  const env={SITE_ORIGIN:'https://asheerahhair.com',SITE_BASE_URL:'https://asheerahhair.com',CATALOG_URL:'https://catalog.example/catalog.json',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test',WORKER_GAS_SECRET:'gas_test',GAS_WEBHOOK_URL:'https://gas.example/exec'};
  const body={customer:{name:'Buyer',email:'buyer@example.com',phone:'+351900000000',country:'PT',address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],couponCode:'ONIKAAH'};
  try{
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify(body)}),env);
    assert.equal(response.status,200);
    assert.equal(sessionParams.get('line_items[0][price_data][unit_amount]'),'3500');
    assert.match(sessionParams.get('line_items[0][price_data][product_data][name]'),/ambassador offer ONIKAAH/i);
    assert.equal(sessionParams.get('line_items[1][price_data][unit_amount]'),'799');
    assert.equal(sessionParams.get('metadata[ambassador_code]'),'ONIKAAH');
    assert.equal(sessionParams.get('metadata[coupon_discount_cents]'),'1500');
    assert.equal(sessionParams.get('metadata[expected_total_cents]'),'4299');
    assert.equal(pending.discountCents,1500);
    assert.equal(pending.expectedTotalCents,4299);
  }finally{global.fetch=oldFetch;}
});

test('Stripe checkout rejects removed old coupon codes',async()=>{
  const oldFetch=global.fetch;
  global.fetch=async(url)=>{
    if(url==='https://catalog.example/catalog.json') return Response.json(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  };
  const env={SITE_ORIGIN:'https://asheerahhair.com',SITE_BASE_URL:'https://asheerahhair.com',CATALOG_URL:'https://catalog.example/catalog.json',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test',WORKER_GAS_SECRET:'gas_test',GAS_WEBHOOK_URL:'https://gas.example/exec'};
  const body={customer:{name:'Buyer',email:'buyer@example.com',phone:'+351900000000',country:'PT',address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],couponCode:'ONIKA10'};
  try{
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify(body)}),env);
    assert.equal(response.status,502);
  }finally{global.fetch=oldFetch;}
});
