const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../catalog.json');
// Workbook Colored Wig-Bundle Pricelist: original L1 M34:N40 / L3 E34:F46;
// promo L1 M53:N59 / L3 E53:F65. Base MSP inputs below are used to independently
// check the source formula: original = base + 40; promo = FLOOR(original*80%-.99)+.99.
const cases=[
 ['chocolate-caramel-highlight-wig',[[238.99,249.99],[260.99,271.99],[280.99,281.99],[285.99,296.99],[319.99,328.99],[354.99,361.99],[376.99,382.99]],0,'20','5x5 HD'],
 ['x-onika-ginger-bombshell',[[209.99,221.99],[222.99,240.99],[244.99,262.99],[262.99,281.99],[274.99,294.99],[295.99,310.99],[317.99,328.99],[345.99,359.99],[384.99,399.99],[395.99,410.99],[407.99,421.99],[500.99,516.99],[556.99,569.99]],20,'26','13x4 HD'],
];
for(const [handle,prices,extra,length,lace] of cases) test(handle+' has only requested variants and exact source prices',()=>{
 const p=catalog.products.find(p=>p.handle===handle);
 assert.deepEqual(p.options[0].values,prices.map((_,i)=>String(16+2*i)));
 assert.deepEqual(p.options[1].values,['5x5 HD','13x4 HD']);
 assert.deepEqual(p.options[2].values,['200%']);
 assert.equal(p.variants.length,prices.length*6);
 assert.equal(new Set(p.variants.map(v=>[v.opt1,v.opt2,v.opt3,v.opt4].join('|'))).size,prices.length*6);
 for(const v of p.variants){
  const before=prices[(Number(v.opt1)-16)/2][v.opt2==='5x5 HD'?0:1]+40;
  const promo=Math.floor(before*.8-.99)+.99;
  assert.equal(v.compare_eur,Math.round((before+extra)*100)/100);
  assert.equal(v.price_eur,Math.round((promo+extra)*100)/100);
  assert.ok(v.compare_eur>v.price_eur);
  assert.equal(v.opt3,'200%');
 }
 assert.deepEqual(p.model_options,{'Hair Length':length,Lace:lace});
 assert.match(p.images[0],/-1\.(jpeg|png)$/);
});

test('checkout uses the new promotional prices and applies ambassador coupons afterwards',()=>{
 const {normalizeCheckoutRequest}=require('../backend/stripe-worker.cjs');
 for(const [handle]of cases)for(const v of catalog.products.find(p=>p.handle===handle).variants){
  const result=normalizeCheckoutRequest({customer:{name:'Test',email:'test@example.com',phone:'123456789',country:'PT',address:'Test street',city:'Lisboa',postalCode:'1000-001'},items:[{handle,options:{opt1:v.opt1,opt2:v.opt2,opt3:v.opt3,opt4:v.opt4},quantity:1}],couponCode:'ONIKAAH'},catalog,{});
  assert.equal(result.subtotalCents,Math.round(v.price_eur*100));
  assert.equal(result.totalCents,Math.round(v.price_eur*100)-1500+799);
 }
});

test('saved carts refresh both sale and original prices without changing quantity or options',()=>{
 const fs=require('fs'),vm=require('vm'),source=fs.readFileSync(require.resolve('../assets/js/app.js'),'utf8');
 const start=source.indexOf('function refreshCartPrices(){'),end=source.indexOf('function findProduct(',start);
 const p=catalog.products.find(p=>p.handle===cases[0][0]),v=p.variants[0];
 const opts={opt1:v.opt1,opt2:v.opt2,opt3:v.opt3,opt4:v.opt4};
 const cart=[{handle:p.handle,opts,qty:2,priceEur:238.99,compareEur:null}];let saves=0;
 const context={getCart:()=>cart,saveCart:()=>saves++,findProduct:handle=>catalog.products.find(p=>p.handle===handle),variantPricing:(p,opts)=>{const v=p.variants.find(v=>Object.keys(opts).every(k=>v[k]===opts[k]));return {found:!!v,priceEur:v?.price_eur,compareEur:v?.compare_eur};}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.refreshCartPrices();
 assert.equal(cart[0].priceEur,222.99);assert.equal(cart[0].compareEur,278.99);assert.equal(cart[0].qty,2);assert.deepEqual(cart[0].opts,opts);assert.equal(saves,1);
 context.refreshCartPrices();assert.equal(saves,1);
});
