const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/js/app.js'), 'utf8');
const fn = source.slice(source.indexOf('function placeOrder(btn)'), source.indexOf('function showOrderConfirmation('));

function setup({method='orange_money', response={ok:true}, httpOk=true, reject=false, country='PT', fulfillment='delivery', shipping=7.99}={}) {
  const calls={clear:0,confirm:0,stripe:0,fetch:0};
  const note={innerHTML:'',textContent:'',querySelector:()=>null};
  const cart=[{title:'Test item',opts:{length:'16'},qty:1,priceEur:100}];
  const c={
    CONFIG:{backendURL:'https://example.invalid/order',whatsapp:'351914522508'},
    document:{getElementById:id=>id==='orderNote'?note:{value:id==='coCountry'?country:'Test'},querySelector:s=>({value:s.includes('fulfillmentMethod')?fulfillment:method,checked:true})},
    getCart:()=>cart, resolveCountryCode:()=> country, shippingRateForCountry:()=>({shippingCents:Math.round(shipping*100)}),
    getAppliedCoupon:()=>null,cartTotals:()=>({shippingKnown:true,shipping,totalFinal:100+shipping,subtotalOriginal:100,totalDiscount:0}),
    saveCheckoutDraft(){},money:n=>String(n),uiTxt:k=>k,escapeHTML:s=>String(s),
    clearCart(){calls.clear++;},showOrderConfirmation(){calls.confirm++;},
    startStripeCheckout(){calls.stripe++;return Promise.resolve();},
    fetch:async(url,options)=>{calls.fetch++;calls.payload=JSON.parse(options.body);if(reject)throw Error('network');return {ok:httpOk,json:async()=>response};},
    window:{open(){throw Error('Unexpected popup');}},checkoutSubmitting:true
  };
  vm.createContext(c);vm.runInContext(fn,c);
  return {c,calls,note,cart};
}
for(const [label,options,expected] of [
  ['success',{},'om_request_recorded'],
  ['server rejection',{response:{ok:false}},'om_record_failed'],
  ['HTTP failure',{httpOk:false},'om_record_failed'],
  ['network failure',{reject:true},'om_record_failed']
]) test(`Orange Money ${label} retains cart and never confirms payment`,async()=>{
  const {c,calls,note,cart}=setup(options);const btn={disabled:true};
  c.placeOrder(btn);await new Promise(setImmediate);
  assert.equal(calls.fetch,1);assert.equal(calls.payload.method,'orange_money');
  assert.equal(calls.clear,0);assert.equal(calls.confirm,0);assert.equal(cart.length,1);
  assert.match(note.innerHTML,new RegExp(expected));assert.match(note.innerHTML,/wa\.me\/351914522508/);
  assert.equal(btn.disabled,false);assert.equal(c.checkoutSubmitting,false);
});
test('Stripe uses its existing checkout without manual order submission',async()=>{
  const {c,calls}=setup({method:'stripe'});c.placeOrder({});await new Promise(setImmediate);
  assert.equal(calls.stripe,1);assert.equal(calls.fetch,0);assert.equal(calls.clear,0);
});
test('obsolete and unknown payment choices cannot submit',()=>{
  for(const method of ['paypal','mbway','unknown']){
    const {c,calls,note}=setup({method});c.placeOrder({});
    assert.equal(calls.fetch,0);assert.equal(calls.stripe,0);assert.equal(note.textContent,'invalid_payment_method');
  }
});

test('Orange Money pickup transmits the fixed location and zero shipping without marking paid',async()=>{
  const {c,calls}=setup({fulfillment:'pickup',shipping:0});c.placeOrder({});await new Promise(setImmediate);
  assert.equal(calls.payload.fulfillmentMethod,'pickup');assert.equal(calls.payload.shippingEur,0);
  assert.match(calls.payload.pickupLocation,/Midana Beauty/);assert.match(calls.payload.text,/Loja E/);
  assert.equal(calls.payload.customer.city,'Amadora');assert.equal(calls.confirm,0);assert.equal(calls.clear,0);
});

test('international Orange Money delivery message uses the actual shipping charge',async()=>{
  const {c,calls}=setup({country:'US',shipping:20});c.placeOrder({});await new Promise(setImmediate);
  assert.equal(calls.payload.fulfillmentMethod,'delivery');assert.equal(calls.payload.shippingEur,20);
  assert.match(calls.payload.text,/Envio: 20/);assert.doesNotMatch(calls.payload.text,/delivery_home_pt/);
});
