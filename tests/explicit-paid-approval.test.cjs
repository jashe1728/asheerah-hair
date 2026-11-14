const test=require("node:test"),assert=require("node:assert/strict");
const d=require("../backend/business-dashboard.cjs");
const order={version:1,manualRequestHash:"a".repeat(64),id:"11111111-1111-4111-8111-111111111111",method:"manual_dashboard",status:"awaiting_payment",totalCents:12345,customer:{email:"customer@example.invalid"}};
const digest=d.safeOrder(order,null).orderDigest;
test("payment confirmation never creates an email intent; explicit approval does",()=>{
 const paid=d.applyAction(order,d.blankOperations(),{version:0,action:"confirm_payment",acknowledged:true,reference:"receipt",expectedOrderDigest:digest},"owner");
 assert.equal(paid.paidEmail,undefined);
 const approved=d.applyAction(order,paid,{version:1,action:"approve_paid_email",acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:"x".repeat(32)},"owner");
 assert.equal(approved.paidEmail.status,"pending");assert.deepEqual(approved.paidEmail.confirmedSnapshot,order);
});

test('approval rejects wrong recipient, altered purchase and unconfirmed or nonmanual orders',()=>{
 const paid=d.applyAction(order,d.blankOperations(),{version:0,action:'confirm_payment',acknowledged:true,reference:'receipt',expectedOrderDigest:digest},'owner');
 const input={version:1,action:'approve_paid_email',acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:'x'.repeat(32)};
 for(const [o,op,i] of [[order,paid,{...input,recipient:'other@example.invalid'}],[{...order,totalCents:5},paid,input],[order,d.blankOperations(),{...input,version:0}],[{...order,method:'orange_money'},paid,input],[order,paid,{...input,acknowledged:false}],[order,paid,{...input,idempotencyKey:'short'}]])assert.throws(()=>d.applyAction(o,op,i,'owner'));
});
test('authenticated same-origin CAS approval is replay-safe, sanitized and never sends',async()=>{
 const crypto=require('node:crypto'),data=new Map();let n=0,writes=0;
 const bucket={async get(k){const x=data.get(k);return x?{etag:x.etag,text:async()=>x.text}:null},async put(k,text,o={}){const x=data.get(k);if((o.onlyIf?.etagDoesNotMatch==='*'&&x)||(o.onlyIf?.etagMatches&&o.onlyIf.etagMatches!==x?.etag))return null;const etag=String(++n);data.set(k,{etag,text});if(k.startsWith('business-operations/'))writes++;return {etag}}};
 const token='a'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex'),origin='https://example.invalid';
 await bucket.put('management-auth/sessions/'+hash+'.json',JSON.stringify({email:'owner@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:15,expiresAt:Date.now()+60000}));
 await bucket.put('business-orders/'+order.id+'.json',JSON.stringify(order));
 const env={REVIEW_MEDIA:bucket,MANAGEMENT_ALLOWED_EMAILS:'owner@example.invalid'};
 const make=(body,opts={})=>new Request(origin+'/management-api/orders/'+order.id,{method:'POST',headers:{Origin:opts.origin||origin,'Content-Type':'application/json',...(opts.noauth?{}:{Cookie:'__Host-ah_management='+token})},body:JSON.stringify(body)});
 const confirmation={version:0,action:'confirm_payment',acknowledged:true,reference:'receipt',expectedOrderDigest:digest};
 assert.equal((await d.handle(make(confirmation),env)).status,200);
 const approval={version:1,action:'approve_paid_email',acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:'x'.repeat(32)};
 assert.equal((await d.handle(make(approval,{noauth:true}),env)).status,401);assert.equal((await d.handle(make(approval,{origin:'https://evil.invalid'}),env)).status,403);
 const [a,b]=await Promise.all([d.handle(make(approval),env),d.handle(make(approval),env)]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(writes,2);
 const result=await a.json();assert.deepEqual(result.order.operations.paidEmail,{status:'pending'});
 assert.equal((await d.handle(make({...approval,idempotencyKey:'y'.repeat(32)}),env)).status,409);
 assert.equal((await d.handle(make({...approval,recipient:'other@example.invalid'}),env)).status,409);
 assert.equal(writes,2);assert.equal([...data.keys()].filter(k=>k.startsWith('business-operations/')).length,1);
});
