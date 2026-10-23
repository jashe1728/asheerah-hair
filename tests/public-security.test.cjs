const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const security=require('../backend/public-security.cjs'),{handleRequest}=require('../backend/stripe-worker.cjs');
const {bucket}=require('./helpers/mock-r2.cjs'),{gasHarness}=require('./helpers/gas-harness.cjs');
const origin='https://asheerahhair.com';
const environment=()=>({SITE_ORIGIN:origin,WORKER_GAS_SECRET:'test-secret',GAS_WEBHOOK_URL:'https://gas.example.invalid',REVIEW_MEDIA:bucket()});
test('signed non-writing probe matches the live canonicalization and rejects invalid signatures',()=>{
 const env=environment(),{context,sheets,mails}=gasHarness(' " TEST-SECRET " ');
 const signed=security.envelope(env,{action:'security_probe'});
 assert.deepEqual(JSON.parse(JSON.stringify(context.doPost({postData:{contents:JSON.stringify(signed)}}))),{ok:true,securityVersion:2,manualOrderIdempotent:true});
 assert.equal(sheets.Orders.length,1);assert.equal(mails.length,0);
 assert.equal(context.doPost({postData:{contents:JSON.stringify({...signed,signature:'f'.repeat(64)})}}).ok,false);
 assert.throws(()=>security.envelope({},{}),/Signing/);
});
test('signed Orange Money retries append one accounting row and send one owner alert',()=>{
 const env=environment(),{context,sheets,mails}=gasHarness('test-secret');
 const body=JSON.stringify(security.envelope(env,{type:'order',orderId:crypto.randomUUID(),method:'orange_money',totalEur:100,items:[],customer:{name:'Mock',email:'mock@example.invalid'}}));
 const first=context.doPost({postData:{contents:body}}),second=context.doPost({postData:{contents:body}});
 assert.equal(first.ok,true);assert.equal(second.duplicate,true);assert.equal(sheets.Orders.length,2);assert.equal(mails.length,1);
});
test('shared admission counters cap concurrent requests across Worker instances and fail closed',async()=>{
 const env=environment();const results=await Promise.allSettled(Array.from({length:30},()=>security.take(env,'concurrent',5,60000)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
 assert.ok(results.filter(r=>r.status==='rejected').every(r=>[429,503].includes(r.reason.status)));
 await assert.rejects(()=>security.take({},'missing',1,60000),e=>e.status===503);
});
test('rotating chat session IDs cannot bypass the per-IP limit or owner mail budget',async t=>{
 const env=environment(),original=global.fetch,{context,sheets,mails}=gasHarness('test-secret');let forwarded=0;
 global.fetch=async(url,options)=>{forwarded++;return new Response(JSON.stringify(context.doPost({postData:{contents:options.body}})));};t.after(()=>global.fetch=original);
 for(let i=0;i<6;i++){const response=await handleRequest(new Request(origin+'/public/chat-log',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({sessionId:'AH-MOCK-'+i,question:'Local test',tier:3})}),env);assert.equal(response.status,i<5?200:429);}
 assert.equal(forwarded,5);assert.equal(sheets['Chatbot Log'].length,6);assert.equal(mails.length,5);
 const another=await handleRequest(new Request(origin+'/public/chat-log',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.2'},body:JSON.stringify({sessionId:'AH-MOCK-NEXT',question:'Local test',tier:3})}),env);
 assert.equal(another.status,200);assert.equal(mails.length,5);assert.equal(sheets['Chatbot Log'].length,7);
});
test('CSP collector accepts missing-Origin browser reports and persists only sanitized bounded telemetry',async()=>{
 const env=environment();const body={'csp-report':{'document-uri':origin+'/checkout.html?email=private@example.invalid','effective-directive':'script-src-elem','blocked-uri':'https://evil.example/path?secret=hidden','script-sample':'private sample','referrer':origin+'/secret'}};
 const response=await handleRequest(new Request(origin+'/public/csp-report',{method:'POST',headers:{'Content-Type':'application/csp-report'},body:JSON.stringify(body)}),env);assert.equal(response.status,204);
 const records=[...env.REVIEW_MEDIA.data].filter(([key])=>key.startsWith('security-reports/'));assert.equal(records.length,1);
 const record=JSON.parse(records[0][1].value);assert.equal(record.reports[0].path,'/checkout.html');assert.equal(record.reports[0].blocked,'https://evil.example');assert.doesNotMatch(JSON.stringify(record),/private|sample|secret|hidden/);
 const oversized=await handleRequest(new Request(origin+'/public/csp-report',{method:'POST',headers:{'Content-Type':'application/csp-report'},body:'x'.repeat(16001)}),env);assert.equal(oversized.status,413);
});
test('security retention deletes expired telemetry without touching orders',async()=>{
 const env=environment();await env.REVIEW_MEDIA.put('security-reports/2000-01-01/old.json','{}');await env.REVIEW_MEDIA.put('business-orders/old.json','{}');await security.cleanup(env);assert.equal(await env.REVIEW_MEDIA.get('security-reports/2000-01-01/old.json'),null);assert.ok(await env.REVIEW_MEDIA.get('business-orders/old.json'));
});
test('Orange Money refuses missing signing credentials before accepting an order or calling providers',async()=>{
 const env={...environment(),ORDER_EMAIL_ENABLED:'1',RESEND_API_KEY:'mock'};delete env.WORKER_GAS_SECRET;
 const response=await handleRequest(new Request(origin+'/request-orange-money',{method:'POST',headers:{Origin:origin},body:'{}'}),env);assert.equal(response.status,503);assert.equal(env.REVIEW_MEDIA.data.size,0);
});
test('private readiness probe verifies both signed targets without exposing secrets or writing orders',async t=>{
 const env={...environment(),MANAGEMENT_ALLOWED_EMAILS:'owner@example.invalid'},token='e'.repeat(64),digest=crypto.createHash('sha256').update(token).digest('hex');
 await env.REVIEW_MEDIA.put('management-auth/sessions/'+digest+'.json',JSON.stringify({email:'owner@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:15,expiresAt:Date.now()+60000}));
 const {context,sheets}=gasHarness('test-secret'),original=global.fetch;let probes=0;
 global.fetch=async(url,opts)=>{probes++;const payload=JSON.parse(JSON.parse(opts.body).payload);assert.equal(payload.action,'security_probe');return new Response(JSON.stringify(context.doPost({postData:{contents:opts.body}})));};t.after(()=>global.fetch=original);
 const response=await handleRequest(new Request(origin+'/management-api/security-status',{headers:{Cookie:'__Host-ah_management='+token}}),env),text=await response.text();
 const status=JSON.parse(text);assert.equal(status.checks.stripe.compatible,true);assert.equal(status.checks.manual.compatible,true);assert.equal(status.cspReportsToday,0);assert.equal(probes,2);assert.equal(sheets.Orders.length,1);assert.doesNotMatch(text,/test-secret|gas.example/);
});
