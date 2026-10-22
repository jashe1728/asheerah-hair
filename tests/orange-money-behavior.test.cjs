const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/js/app.js'), 'utf8');
const fn = source.slice(source.indexOf('function placeOrder(btn)'), source.indexOf('function showOrderConfirmation('));

function setup({method='orange_money', response={ok:true}, httpOk=true, reject=false}={}) {
  const calls={clear:0,confirm:0,stripe:0,fetch:0};
  const note={innerHTML:'',textContent:'',querySelector:()=>null};
  const cart=[{title:'Test item',opts:{length:'16'},qty:1,priceEur:100}];
  const c={
    CONFIG:{backendURL:'https://example.invalid/order',whatsapp:'351914522508'},
    document:{getElementById:id=>id==='orderNote'?note:{value:id==='coCountry'?'PT':'Test'},querySelector:()=>({value:method})},
    getCart:()=>cart, resolveCountryCode:()=> 'PT', shippingRateForCountry:()=>({shippingCents:599}),
    getAppliedCoupon:()=>null,cartTotals:()=>({shippingKnown:true,shipping:5.99,totalFinal:105.99,subtotalOriginal:100,totalDiscount:0}),
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
