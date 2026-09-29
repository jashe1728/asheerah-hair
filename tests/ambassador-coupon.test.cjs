const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeCheckoutRequest}=require('../backend/stripe-worker.cjs');

const catalog={currency:'EUR',products:[{handle:'sample-wig',title:'Sample Wig',variants:[{title:'18 / HD',opt1:'18',opt2:'HD',opt3:null,opt4:null,price_eur:50}]}]};
const request=(couponCode)=>({customer:{name:'Test Buyer',email:'buyer@example.com',phone:'+351900000000',country:'Portugal',address:'Rua A',city:'Lisbon',postalCode:'1000-001'},items:[{handle:'sample-wig',options:{opt1:'18',opt2:'HD'},quantity:1}],...(couponCode===undefined?{}:{couponCode})});

test('each known ambassador coupon gives a server-calculated fixed EUR 7 discount',()=>{
  for(const code of ['ONIKA10','LILIAN10','TUCHA10','CASSIE10']){
    const checkout=normalizeCheckoutRequest(request(code),catalog,{});
    assert.equal(checkout.couponCode,code);
    assert.equal(checkout.discountCents,700);
    assert.equal(checkout.totalCents,4300);
  }
});

test('ambassador coupon matching is case-insensitive and caps discount at merchandise subtotal',()=>{
  const smallCatalog={...catalog,products:[{...catalog.products[0],variants:[{...catalog.products[0].variants[0],price_eur:3}]}]};
  const checkout=normalizeCheckoutRequest(request(' onika10 '),smallCatalog,{});
  assert.equal(checkout.couponCode,'ONIKA10');
  assert.equal(checkout.discountCents,300);
  assert.equal(checkout.totalCents,0);
});

test('checkout rejects unknown ambassador coupon codes and client-invented discounts',()=>{
  assert.throws(()=>normalizeCheckoutRequest(request('NOT-A-CODE'),catalog,{}),/coupon/i);
  const forged=request('ONIKA10');
  forged.discountCents=1;
  assert.throws(()=>normalizeCheckoutRequest(forged,catalog,{}),/unexpected/i);
});
