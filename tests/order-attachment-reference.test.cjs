const test=require('node:test');
const assert=require('node:assert/strict');
const {deliver}=require('../backend/order-email.cjs');
const {fixture}=require('../backend/preview-order-email.cjs');

test('customer attachment uses short uppercase reference while provider idempotency retains full ID',async t=>{
 const id='64bada3c-2c23-49de-9576-351de7e56cad',order={...fixture,id};
 const data=new Map();const bucket={async get(k){return data.has(k)?{text:async()=>data.get(k)}:null;},async put(k,v,opts){if(opts?.onlyIf?.etagDoesNotMatch&&data.has(k))return null;data.set(k,v);return {key:k};}};
 const oldFetch=global.fetch;let sent;global.fetch=async(url,init)=>{sent=init;return {ok:true,json:async()=>({id:'test-delivery'})};};t.after(()=>{global.fetch=oldFetch;});
 await deliver({REVIEW_MEDIA:bucket,RESEND_API_KEY:'test'},order);
 assert.equal(JSON.parse(sent.body).attachments[0].filename,'Asheerah-Hair-E7E56CAD.pdf');
 assert.equal(sent.headers['Idempotency-Key'],'order-confirmation/'+id);
 assert.ok(data.has('order-notifications/'+id+'.json'));assert.equal(order.id,id);
});
