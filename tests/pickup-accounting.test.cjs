const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const ctx={Utilities:{formatDate:()=> 'date'},Session:{getScriptTimeZone:()=> 'UTC'},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../backend/Code.gs'),'utf8'),ctx);
 const rows=[];ctx.stripePaymentsSheet_=()=>({getDataRange:()=>({getValues:()=>[[],...rows]}),appendRow:r=>rows.push(r)});
 return {ctx,rows};
}
const base={orderId:'123e4567-e89b-42d3-a456-426614174000',currency:'EUR',customer:{name:'Test',email:'test@example.com',country:'PT',address:'Client address'},subtotalCents:5000,shippingCents:0,expectedTotalCents:3500,couponCode:'ONIKAAH',discountCents:1500,fulfillmentMethod:'pickup'};
test('new bearer coupons have fixed merchandise-only discounts capped at subtotal',()=>{
 const {ctx}=setup();for(const code of ['ONIKA01','LILIAN01','TUCHA01','CASSIE01','MIDANABT'])assert.equal(ctx.checkoutDiscountCents_(code,5000),700);
 for(const code of ['ONIKAAH','LILIANAH','TUCHAAH','CASSIEAH']){assert.equal(ctx.checkoutDiscountCents_(code,5000),1500);assert.equal(ctx.checkoutDiscountCents_(code,600),600);}
 assert.equal(ctx.checkoutDiscountCents_('UNKNOWN',5000),-1);
});
test('signed pickup records canonical store rather than supplied address',()=>{
 const {ctx,rows}=setup();assert.equal(ctx.recordStripePending_(base).ok,true);assert.match(rows[0][8],/Midana Beauty/);assert.match(rows[0][8],/Loja E/);assert.doesNotMatch(rows[0][8],/Client address/);assert.equal(rows[0][10],35);
});
test('pickup outside Portugal, charged pickup, and incorrect discounts are rejected',()=>{
 const {ctx,rows}=setup();for(const change of [{customer:{...base.customer,country:'FR'}},{shippingCents:799,expectedTotalCents:4299},{discountCents:700},{couponCode:'FORGED'},{fulfillmentMethod:'free'}])assert.equal(ctx.recordStripePending_({...base,...change}).ok,false);assert.equal(rows.length,0);
});
test('order ledger retains coupon and pickup location with zero Orange Money fee',()=>{
 const {ctx}=setup();const row=ctx.buildOrderRow_({method:'orange_money',coupon:'ONIKAAH',fulfillmentMethod:'pickup',subtotalEur:50,totalEur:35,shippingEur:0,items:[],customer:{}});assert.match(row[6],/ONIKAAH/);assert.match(row[6],/Midana Beauty/);assert.equal(row[11],0);assert.equal(row[9],35);
});
