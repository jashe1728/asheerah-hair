const test=require('node:test');
const assert=require('node:assert/strict');
const {handleRequest}=require('../backend/stripe-worker.cjs');

const catalog={currency:'EUR',products:[{handle:'sample-wig',title:'Sample Wig',variants:[{title:'18 / HD',opt1:'18',opt2:'HD',opt3:null,opt4:null,price_eur:50}]}]};

test('Stripe checkout applies a server-validated ambassador discount and records attribution',async()=>{
  const oldFetch=global.fetch;
  let couponParams,sessionParams,pending;
  global.fetch=async(url,options)=>{
    if(url==='https://catalog.example/catalog.json') return Response.json(catalog);
    if(url==='https://gas.example/exec'){const forwarded=JSON.parse(JSON.parse(options.body).payload);if(forwarded.action==='stripe_pending')pending=forwarded;return Response.json({ok:true});}
    const params=new URLSearchParams(options.body);
    if(url==='https://api.stripe.com/v1/coupons'){couponParams=params;return Response.json({id:'coupon_one_time'});}
    if(url==='https://api.stripe.com/v1/checkout/sessions'){sessionParams=params;return Response.json({id:'cs_test_coupon',url:'https://checkout.stripe.com/c/pay/cs_test_coupon'});}
    throw new Error(`Unexpected fetch ${url}`);
  };
  const env={SITE_ORIGIN:'https://asheerahhair.com',SITE_BASE_URL:'https://asheerahhair.com',CATALOG_URL:'https://catalog.example/catalog.json',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test',WORKER_GAS_SECRET:'gas_test',GAS_WEBHOOK_URL:'https://gas.example/exec'};
  const body={customer:{name:'Buyer',email:'buyer@example.com',phone:'+351900000000',country:'Portugal',address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],couponCode:'ONIKA10'};
  try{
    const response=await handleRequest(new Request('https://worker.example/create-checkout-session',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify(body)}),env);
    assert.equal(response.status,200);
    const lineItemCount=Number(sessionParams.get('line_items[0][quantity]'));
    assert.equal(sessionParams.get('line_items[0][price_data][unit_amount]'),'4300');
    assert.equal(lineItemCount,1);
    assert.match(sessionParams.get('line_items[0][price_data][product_data][name]'),/ambassador offer/i);
    assert.equal(sessionParams.get('metadata[ambassador_code]'),'ONIKA10');
    assert.equal(sessionParams.get('metadata[expected_total_cents]'),'4300');
    assert.equal(pending.expectedTotalCents,4300);
    assert.match(pending.itemsSummary,/ONIKA10/);
  }finally{global.fetch=oldFetch;}
});
