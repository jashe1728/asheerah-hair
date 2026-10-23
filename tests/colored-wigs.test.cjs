const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../catalog.json');
// Workbook Colored Wig-Bundle Pricelist: L1 M15:N21, L3 E15:F21.
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
  assert.equal(v.price_eur,Math.round((prices[(Number(v.opt1)-16)/2][v.opt2==='5x5 HD'?0:1]+extra)*100)/100);
  assert.equal(v.opt3,'200%');
 }
 assert.deepEqual(p.model_options,{'Hair Length':length,Lace:lace});
 assert.match(p.images[0],/-1\.(jpeg|png)$/);
});
