const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeCheckoutRequest}=require('../backend/stripe-worker.cjs');

const catalog={currency:'EUR',products:[{handle:'sample-wig',title:'Sample Wig',variants:[{title:'18 / HD',opt1:'18',opt2:'HD',opt3:null,opt4:null,price_eur:50}]}]};
const request=(couponCode,country='PT')=>({customer:{name:'Test Buyer',email:'buyer@example.com',phone:'+351900000000',country,address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],...(couponCode===undefined?{}:{couponCode})});

test('each known ambassador coupon gives a server-calculated fixed EUR 7 discount on merchandise without discounting shipping',()=>{
  for(const code of ['ONIKA01','LILIAN01','TUCHA01','CASSIE01','MIDANABT']){
    const checkout=normalizeCheckoutRequest(request(code,'PT'),catalog,{});
    assert.equal(checkout.couponCode,code);
    assert.equal(checkout.subtotalCents,5000);
    assert.equal(checkout.discountCents,700);
    assert.equal(checkout.shippingCents,799);
    assert.equal(checkout.totalCents,5099);
  }
});

test('each known ambassador coupon gives a server-calculated fixed EUR 15 discount on merchandise without discounting shipping',()=>{
  for(const code of ['ONIKAAH','LILIANAH','TUCHAAH','CASSIEAH']){
    const checkout=normalizeCheckoutRequest(request(code,'PT'),catalog,{});
    assert.equal(checkout.couponCode,code);
    assert.equal(checkout.subtotalCents,5000);
    assert.equal(checkout.discountCents,1500);
    assert.equal(checkout.shippingCents,799);
    assert.equal(checkout.totalCents,4299);
  }
});

test('ambassador coupon matching is case-insensitive and caps discount at merchandise subtotal while preserving shipping charge',()=>{
  const smallCatalog={...catalog,products:[{...catalog.products[0],variants:[{...catalog.products[0].variants[0],price_eur:3}]}]};
  const checkout7=normalizeCheckoutRequest(request(' midanabt ','PT'),smallCatalog,{});
  assert.equal(checkout7.couponCode,'MIDANABT');
  assert.equal(checkout7.subtotalCents,300);
  assert.equal(checkout7.discountCents,300);
  assert.equal(checkout7.shippingCents,799);
  assert.equal(checkout7.totalCents,799);

  const checkout15=normalizeCheckoutRequest(request(' onikaah ','PT'),smallCatalog,{});
  assert.equal(checkout15.couponCode,'ONIKAAH');
  assert.equal(checkout15.subtotalCents,300);
  assert.equal(checkout15.discountCents,300);
  assert.equal(checkout15.shippingCents,799);
  assert.equal(checkout15.totalCents,799);
});

test('checkout rejects old coupon codes, unknown codes, and client-invented discounts',()=>{
  for(const oldCode of ['ONIKA10','LILIAN10','TUCHA10','CASSIE10']){
    assert.throws(()=>normalizeCheckoutRequest(request(oldCode),catalog,{}),/coupon/i);
  }
  assert.throws(()=>normalizeCheckoutRequest(request('NOT-A-CODE'),catalog,{}),/coupon/i);
  const forged=request('ONIKA01');
  forged.discountCents=1;
  assert.throws(()=>normalizeCheckoutRequest(forged,catalog,{}),/unexpected/i);
});
