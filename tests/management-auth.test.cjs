const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const auth=require('../backend/management-auth.cjs');
const dashboard=require('../backend/business-dashboard.cjs');
function bucket(){const data=new Map();let n=0;return {data,async get(key){const x=data.get(key);return x?{etag:x.etag,text:async()=>x.text}:null;},async put(key,text,opts={}){const x=data.get(key);if(opts.onlyIf?.etagDoesNotMatch==='*'&&x)return null;if(opts.onlyIf?.etagMatches&&opts.onlyIf.etagMatches!==x?.etag)return null;const etag=String(++n);data.set(key,{text,etag});return {etag};},async delete(key){data.delete(key);},async list({prefix}){return {objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};}};}
function environment(){return {REVIEW_MEDIA:bucket(),MANAGEMENT_ALLOWED_EMAILS:'owner@example.com,client@example.com',RESEND_API_KEY:'synthetic-provider-key',MANAGEMENT_CAPTURE_ENABLED:'1'};}
function req(path,body={},headers={}){return new Request('https://asheerahhair.com/management-api/'+path,{method:'POST',headers:{Origin:'https://asheerahhair.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body)});}
async function login(env,email='owner@example.com'){
 const original=global.fetch;let mail;
 global.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');mail=JSON.parse(options.body);return new Response(JSON.stringify({id:'synthetic-id'}));};
 try{const start=await auth.handle(req('auth/start',{email}),env),data=await start.json();assert.equal(start.status,200);const code=mail.text.match(/\b\d{6}\b/)[0];return {challenge:data.challenge,code,mail};}finally{global.fetch=original;}
}
test('private endpoints fail closed with missing configuration or no session',async()=>{
 const request=new Request('https://asheerahhair.com/management-api/orders');
 assert.equal((await dashboard.handle(request,{})).status,401);assert.equal(await auth.identity(request,environment()),null);
 assert.equal((await auth.handle(req('auth/start',{email:'owner@example.com'}),{})).status,503);
});
test('login mails only exact allowlisted accounts and stores hashed one-time codes',async()=>{
 const env=environment(),{challenge,code,mail}=await login(env);assert.deepEqual(mail.to,['owner@example.com']);assert.match(mail.from,/noreply@asheerahhair.com/);
 const raw=env.REVIEW_MEDIA.data.get('management-auth/codes/'+challenge+'.json').text;assert.equal(raw.includes(code),false);assert.equal(JSON.parse(raw).attempts,0);
 const original=global.fetch;global.fetch=async()=>{throw Error('Unlisted recipient must not receive mail');};
 try{const other=await auth.handle(req('auth/start',{email:'owner@example.com.attacker.example'}),env);assert.equal(other.status,200);const data=await other.json();assert.equal(data.challenge.length,48);assert.equal(data.message,'Se este e-mail tiver acesso, receberá um código de entrada.');}finally{global.fetch=original;}
});
test('correct code creates an HttpOnly secure session; replay is rejected',async()=>{
 const env=environment(),{challenge,code}=await login(env),response=await auth.handle(req('auth/verify',{challenge,code}),env);assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/^__Host-ah_management=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/);
 const get=new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:cookie.split(';')[0]}});assert.equal(await auth.identity(get,env),'owner@example.com');
 assert.equal((await auth.handle(req('auth/verify',{challenge,code}),env)).status,401);
 const token=cookie.split('=')[1].split(';')[0];assert.equal([...env.REVIEW_MEDIA.data.values()].some(v=>v.text.includes(token)),false);
});

test('idle sessions expire on the server even with background orders polling',async()=>{
 const env=environment(),{challenge,code}=await login(env),signed=await auth.handle(req('auth/verify',{challenge,code}),env);
 const cookie=signed.headers.get('set-cookie').split(';')[0],request=new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:cookie}});
 const key=[...env.REVIEW_MEDIA.data.keys()].find(k=>k.includes('/sessions/')),saved=env.REVIEW_MEDIA.data.get(key),session=JSON.parse(saved.text);
 assert.equal(session.idleMinutes,15);
 session.lastActiveAt=Date.now()-14*60000;env.REVIEW_MEDIA.data.set(key,{...saved,text:JSON.stringify(session)});
 assert.equal(await auth.identity(request,env),'owner@example.com');
 assert.equal(JSON.parse(env.REVIEW_MEDIA.data.get(key).text).lastActiveAt,session.lastActiveAt);
 session.lastActiveAt=Date.now()-15*60000-1;env.REVIEW_MEDIA.data.set(key,{...saved,text:JSON.stringify(session)});
 assert.equal(await auth.identity(request,env),null);
 assert.equal((await auth.handle(req('auth/session',{active:true},{Cookie:cookie}),env)).status,401);
 assert.equal((await dashboard.handle(request,env)).status,401);
});

test('human activity extends idle timeout; settings stay bounded and absolute expiry remains',async()=>{
 const env=environment(),{challenge,code}=await login(env),signed=await auth.handle(req('auth/verify',{challenge,code}),env),cookie=signed.headers.get('set-cookie').split(';')[0];
 const key=[...env.REVIEW_MEDIA.data.keys()].find(k=>k.includes('/sessions/')),saved=env.REVIEW_MEDIA.data.get(key),session=JSON.parse(saved.text);
 session.lastActiveAt=Date.now()-10*60000;session.expiresAt=Date.now()+4*60000;env.REVIEW_MEDIA.data.set(key,{...saved,text:JSON.stringify(session)});
 const passive=await auth.handle(req('auth/session',{}, {Cookie:cookie}),env);assert.equal(passive.status,200);
 assert.equal(JSON.parse(env.REVIEW_MEDIA.data.get(key).text).lastActiveAt,session.lastActiveAt);
 const heartbeat=await auth.handle(req('auth/session',{active:true,idleMinutes:30},{Cookie:cookie}),env),result=await heartbeat.json();
 assert.equal(result.idleMinutes,30);assert.ok(result.remainingMs<=4*60000);assert.ok(result.remainingMs>3*60000);
 const updated=JSON.parse(env.REVIEW_MEDIA.data.get(key).text);assert.ok(updated.lastActiveAt>session.lastActiveAt);assert.equal(updated.expiresAt,session.expiresAt);
 for(const value of [0,1,60,'15',null])assert.equal((await auth.handle(req('auth/session',{idleMinutes:value},{Cookie:cookie}),env)).status,400);
 assert.equal((await auth.handle(req('auth/session',{active:true},{Cookie:cookie,Origin:'https://evil.example'}),env)).status,403);
 await auth.handle(req('auth/logout',{}, {Cookie:cookie}),env);
 assert.equal((await auth.handle(req('auth/session',{active:true},{Cookie:cookie}),env)).status,401);
});

test('legacy sessions use creation time for the default idle deadline',async()=>{
 const env=environment(),token='b'.repeat(64),key='management-auth/sessions/'+crypto.createHash('sha256').update(token).digest('hex')+'.json';
 const request=new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:auth.COOKIE+'='+token}});
 env.REVIEW_MEDIA.data.set(key,{text:JSON.stringify({email:'owner@example.com',createdAt:Date.now()-16*60000,expiresAt:Date.now()+3600000}),etag:'legacy'});
 assert.equal(await auth.identity(request,env),null);
});
test('wrong attempts exhaust a code without allowing a later correct attempt',async()=>{
 const env=environment(),{challenge,code}=await login(env),wrong=code==='123456'?'654321':'123456';
 for(let i=0;i<5;i++)assert.equal((await auth.handle(req('auth/verify',{challenge,code:wrong}),env)).status,401);
 assert.equal((await auth.handle(req('auth/verify',{challenge,code}),env)).status,401);
});
test('already-issued API-scoped sessions survive rollout and are removed on logout',async()=>{
 const env=environment(),{challenge,code}=await login(env),signed=await auth.handle(req('auth/verify',{challenge,code}),env);
 const token=signed.headers.get('set-cookie').split('=')[1].split(';')[0],cookie='__Secure-ah_management='+token;
 const request=new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:cookie}});assert.equal(await auth.identity(request,env),'owner@example.com');
 const logout=await auth.handle(req('auth/logout',{}, {Cookie:cookie}),env);assert.match(logout.headers.get('set-cookie'),/__Secure-ah_management=; Path=\/management-api\//);assert.equal(await auth.identity(request,env),null);
});
test('simultaneous use of one code creates only one session',async()=>{
 const env=environment(),{challenge,code}=await login(env);
 const results=await Promise.all([auth.handle(req('auth/verify',{challenge,code}),env),auth.handle(req('auth/verify',{challenge,code}),env)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);assert.equal([...env.REVIEW_MEDIA.data.keys()].filter(k=>k.includes('/sessions/')).length,1);
});
test('expired codes, expired sessions and removed accounts cannot sign in',async()=>{
 const env=environment(),{challenge,code}=await login(env),b=env.REVIEW_MEDIA;
 const key='management-auth/codes/'+challenge+'.json',c=JSON.parse(b.data.get(key).text);c.expiresAt=Date.now()-1;b.data.set(key,{text:JSON.stringify(c),etag:'expired'});
 assert.equal((await auth.handle(req('auth/verify',{challenge,code}),env)).status,401);
 const token='a'.repeat(64),sessionKey='management-auth/sessions/'+crypto.createHash('sha256').update(token).digest('hex')+'.json';
 b.data.set(sessionKey,{text:JSON.stringify({email:'owner@example.com',expiresAt:Date.now()-1}),etag:'session'});
 const request=new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:auth.COOKIE+'='+token}});assert.equal(await auth.identity(request,env),null);
 b.data.set(sessionKey,{text:JSON.stringify({email:'outsider@example.com',expiresAt:Date.now()+60000}),etag:'session'});assert.equal(await auth.identity(request,env),null);
});
test('login request limits cap email sending and reject cross-origin requests',async()=>{
 const env=environment(),original=global.fetch;let sends=0;global.fetch=async()=>{sends++;return new Response('{}');};
 try{
  for(let i=0;i<4;i++)await auth.handle(req('auth/start',{email:'client@example.com'}),env);assert.equal(sends,3);
  assert.equal((await auth.handle(req('auth/start',{email:'owner@example.com'},{Origin:'https://evil.example'}),env)).status,403);
  for(let i=0;i<17;i++)await auth.handle(req('auth/start',{email:'outsider@example.com'}),env);
  assert.equal((await auth.handle(req('auth/start',{email:'owner@example.com'}),env)).status,429);
 }finally{global.fetch=original;}
});
test('authenticated updates audit the session identity and reject CSRF and stale versions',async()=>{
 const env=environment(),{challenge,code}=await login(env),signed=await auth.handle(req('auth/verify',{challenge,code}),env),cookie=signed.headers.get('set-cookie').split(';')[0];
 const o={id:'11111111-1111-4111-8111-111111111111',status:'paid',method:'stripe',customer:{name:'Synthetic customer'},items:[],totalCents:20000};await dashboard.persistOrder(env,o);
 const listed=await dashboard.handle(new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:cookie}}),env);assert.equal(listed.status,200);assert.equal(listed.headers.get('cache-control'),'no-store, private');assert.equal(listed.headers.get('access-control-allow-origin'),null);assert.equal((await listed.json()).orders.length,1);
 const input={action:'supplier_sent',version:0,acknowledged:true},path='orders/'+o.id;
 assert.equal((await dashboard.handle(req(path,input,{Cookie:cookie,Origin:'https://evil.example'}),env)).status,403);
 const saved=await dashboard.handle(req(path,input,{Cookie:cookie}),env);assert.equal(saved.status,200);assert.equal((await saved.json()).order.operations.events[0].by,'owner@example.com');
 assert.equal((await dashboard.handle(req(path,input,{Cookie:cookie}),env)).status,409);
 const logout=await auth.handle(req('auth/logout',{}, {Cookie:cookie}),env);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal(await auth.identity(new Request('https://asheerahhair.com/management-api/orders',{headers:{Cookie:cookie}}),env),null);
});
