const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../catalog.json');
// Workbook Colored Wig-Bundle Pricelist:
// Current selling price (price_eur): Minimum Selling Price table (L1 K15:P21 / L3 B15:C27, E15:F27, H15:I27) + extra.
// Original price (compare_eur): Price Before Promotion table (L1 K34:P40 / L3 B34:C46, E34:F46, H34:I46) + extra (= MSP + 40 + extra).
const cases=[
 ['chocolate-caramel-highlight-wig',{
  '16':{'180%':[226.99,238.99],'200%':[238.99,249.99]},
  '18':{'180%':[247.99,258.99],'200%':[260.99,271.99],'250%':[273.99,284.99]},
  '20':{'180%':[266.99,276.99],'200%':[280.99,281.99],'250%':[296.99,306.99]},
  '22':{'180%':[285.99,296.99],'200%':[285.99,296.99],'250%':[320.99,327.99]},
  '24':{'180%':[301.99,310.99],'200%':[319.99,328.99],'250%':[338.99,347.99]},
  '26':{'180%':[332.99,339.99],'200%':[354.99,361.99],'250%':[376.99,383.99]},
  '28':{'180%':[352.99,358.99],'200%':[376.99,382.99],'250%':[400.99,498.99]},
 },0,'20','5x5 HD'],
 ['x-onika-ginger-bombshell',{
  '16':{'180%':[199.99,210.99],'200%':[209.99,221.99],'250%':[216.99,227.99]},
  '18':{'180%':[217.99,226.99],'200%':[222.99,240.99],'250%':[232.99,246.99]},
  '20':{'180%':[231.99,240.99],'200%':[244.99,262.99],'250%':[257.99,271.99]},
  '22':{'180%':[248.99,260.99],'200%':[262.99,281.99],'250%':[267.99,282.99]},
  '24':{'180%':[263.99,275.99],'200%':[274.99,294.99],'250%':[282.99,296.99]},
  '26':{'180%':[289.99,300.99],'200%':[295.99,310.99],'250%':[310.99,324.99]},
  '28':{'180%':[307.99,319.99],'200%':[317.99,328.99],'250%':[337.99,352.99]},
  '30':{'180%':[335.99,345.99],'200%':[345.99,359.99],'250%':[366.99,387.99]},
  '32':{'180%':[357.99,370.99],'200%':[384.99,399.99],'250%':[399.99,414.99]},
  '34':{'200%':[395.99,410.99],'250%':[421.99,435.99]},
  '36':{'200%':[407.99,421.99],'250%':[433.99,448.99]},
  '38':{'200%':[500.99,516.99],'250%':[513.99,527.99]},
  '40':{'200%':[556.99,569.99],'250%':[572.99,587.99]},
 },20,'26','13x4 HD'],
];
for(const [handle,prices,extra,length,lace] of cases) test(handle+' has all sheet densities and exact minimum selling and before-promotion prices',()=>{
 const p=catalog.products.find(p=>p.handle===handle);
 const lengths=Object.keys(prices);
 const expectedCount=lengths.reduce((n,len)=>n+Object.keys(prices[len]).length*2*3,0);
 assert.deepEqual(p.options[0].values,lengths);
 assert.deepEqual(p.options[1].values,['5x5 HD','13x4 HD']);
 assert.deepEqual(p.options[2].values,['180%','200%','250%']);
 assert.deepEqual(p.options[3].values,['SMALL','MEDIUM','LARGE']);
 assert.equal(p.variants.length,expectedCount);
 assert.equal(new Set(p.variants.map(v=>[v.opt1,v.opt2,v.opt3,v.opt4].join('|'))).size,expectedCount);
 for(const v of p.variants){
  const msp=prices[v.opt1]?.[v.opt3]?.[v.opt2==='5x5 HD'?0:1];
  assert.ok(msp!==undefined,`${handle} unexpected variant ${v.title}`);
  const before=msp+40;
  assert.equal(v.price_eur,Math.round((msp+extra)*100)/100);
  assert.equal(v.compare_eur,Math.round((before+extra)*100)/100);
  assert.ok(v.compare_eur>v.price_eur);
 }
 assert.deepEqual(p.model_options,{'Hair Length':length,Lace:lace});
 assert.match(p.images[0],/-1\.(jpeg|png)$/);
});

test('checkout uses the minimum selling prices and applies ambassador coupons afterwards',()=>{
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
 const cart=[{handle:p.handle,opts,qty:2,priceEur:199.99,compareEur:null}];let saves=0;
 const context={getCart:()=>cart,saveCart:()=>saves++,findProduct:handle=>catalog.products.find(p=>p.handle===handle),variantPricing:(p,opts)=>{const v=p.variants.find(v=>Object.keys(opts).every(k=>v[k]===opts[k]));return {found:!!v,priceEur:v?.price_eur,compareEur:v?.compare_eur};}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.refreshCartPrices();
 assert.equal(cart[0].priceEur,226.99);assert.equal(cart[0].compareEur,266.99);assert.equal(cart[0].qty,2);assert.deepEqual(cart[0].opts,opts);assert.equal(saves,1);
 context.refreshCartPrices();assert.equal(saves,1);
});
