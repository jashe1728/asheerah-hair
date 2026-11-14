const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('manual payment confirmation displays the short reference while submitting the full ID',async()=>{
 const id='64bada3c-2c23-49de-9576-351de7e56cad';let submit,options,payload;
 const note={},button={},area={querySelector:()=>null,append(){}};
 const document={documentElement:{lang:'en'},body:{},head:{append(){}},createElement:()=>({}),querySelector:s=>s.startsWith('#payArea')?area:{value:'orange_money'},getElementById:id=>id==='orderNote'?note:id==='placeOrderBtn'?button:{value:'test'},addEventListener:(name,fn)=>{submit=fn;}};
 const context={CONFIG:{orderRequestsEnabled:true,stripeCheckoutURL:'https://example.invalid'},document,window:{turnstile:{render:(box,opts)=>{options=opts;return 1;},reset(){}}},MutationObserver:class{observe(){}},validateCheckout:()=>true,resolveCountryCode:()=> 'GW',getCart:()=>[],getAppliedCoupon:()=>null,sessionStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=>id},URL,fetch:async(url,init)=>{payload=JSON.parse(init.body);return {ok:true,json:async()=>({ok:true,orderId:id})};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/order-requests.js'),'utf8'),context);
 options.callback('token');await submit({target:{querySelector:()=>true},preventDefault(){},stopImmediatePropagation(){}});
 assert.match(note.textContent,/#E7E56CAD/);assert.ok(!note.textContent.includes(id));assert.equal(payload.requestId,id);
});
