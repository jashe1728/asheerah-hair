const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const newsletter=require('../backend/newsletter.cjs'),{handleRequest}=require('../backend/stripe-worker.cjs');
const {bucket}=require('./helpers/mock-r2.cjs');
const origin='https://asheerahhair.com',user='owner@example.invalid';
const environment=()=>({SITE_ORIGIN:origin,WORKER_GAS_SECRET:'local-newsletter-key',GAS_WEBHOOK_URL:'https://gas.example.invalid',REVIEW_MEDIA:bucket(),NEWSLETTER_ENABLED:'1',RESEND_API_KEY:'local-test-key',MANAGEMENT_ALLOWED_EMAILS:user});
const input={title:'Uma novidade <especial>',text:'Olá, querida.\n\nTexto <script>alert(1)</script>',images:[],language:'pt',buttonLabel:'Visitar a loja',buttonUrl:origin+'/shop.html'};
async function call(env,path,body,token){return handleRequest(new Request(origin+'/management-api/newsletter'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:'__Host-ah_management='+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);}
async function session(env){const token='c'.repeat(64),digest=crypto.createHash('sha256').update(token).digest('hex');await env.REVIEW_MEDIA.put('management-auth/sessions/'+digest+'.json',JSON.stringify({email:user,expiresAt:Date.now()+3600000}));return token;}
async function activeSubscriber(env,email='subscriber@example.invalid'){await newsletter.subscribe(env,email,'pt');const subs=await newsletter.allSubscribers(env),sub=subs.find(s=>s.email===email),link=newsletter.urlFor(env,'confirm',sub);const response=await newsletter.publicHandle(new Request(link,{method:'POST'}),env);assert.equal(response.status,200);return (await newsletter.allSubscribers(env)).find(s=>s.id===sub.id);}
test('actual newsletter browser handler reaches the Worker contract and never claims success on rejection',async t=>{
 const env=environment(),original=global.fetch;let sends=0;global.fetch=async()=>{sends++;return new Response(JSON.stringify({id:'mock-confirmation'}));};t.after(()=>global.fetch=original);
 let submit;const message={style:{}},email={value:'mock@example.invalid'},button={disabled:false},form={addEventListener:(_,fn)=>submit=fn,querySelector:s=>s==='input'?email:button};
 const context={CONFIG:{subscribeURL:'/public/subscribe'},LANG:'fr',document:{getElementById:id=>({nlForm:form,nlEmail:email,nlMsg:message}[id])},uiTxt:k=>k,fetch:(path,opts)=>handleRequest(new Request(origin+path,{...opts,headers:{...opts.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.1'}}),env)};
 const source=fs.readFileSync('assets/js/app.js','utf8');vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function initNewsletter(){'),source.indexOf('// ---------- Page init ----------')),context);context.initNewsletter();
 await submit({preventDefault(){}});assert.equal(message.textContent,'nl_confirm');assert.equal(sends,1);assert.equal(email.value,'');assert.equal(button.disabled,false);assert.equal((await newsletter.allSubscribers(env))[0].language,'fr');
 email.value='retain@example.invalid';context.fetch=async()=>new Response('blocked',{status:429});await submit({preventDefault(){}});assert.equal(message.textContent,'nl_error');assert.equal(email.value,'retain@example.invalid');
});
test('confirm and unsubscribe require valid signed tokens and POST; link scanning cannot change membership',async t=>{
 const env=environment(),original=global.fetch;global.fetch=async()=>new Response(JSON.stringify({id:'mock'}));t.after(()=>global.fetch=original);
 await newsletter.subscribe(env,'reader@example.invalid','de');let sub=(await newsletter.allSubscribers(env))[0];const confirm=newsletter.urlFor(env,'confirm',sub);
 await newsletter.publicHandle(new Request(confirm),env);assert.equal((await newsletter.allSubscribers(env))[0].status,'pending');
 const invalid=await newsletter.publicHandle(new Request(confirm.replace(/token=.*/,'token='+'0'.repeat(64)),{method:'POST'}),env);assert.equal(invalid.status,403);
 await newsletter.publicHandle(new Request(confirm,{method:'POST'}),env);sub=(await newsletter.allSubscribers(env))[0];assert.equal(sub.status,'active');
 const unsubscribe=newsletter.urlFor(env,'unsubscribe',sub);assert.doesNotMatch(unsubscribe,/@|reader/);
 await newsletter.publicHandle(new Request(unsubscribe),env);assert.equal((await newsletter.allSubscribers(env))[0].status,'active');
 await newsletter.publicHandle(new Request(unsubscribe,{method:'POST',body:'List-Unsubscribe=One-Click'}),env);assert.equal((await newsletter.allSubscribers(env))[0].status,'unsubscribed');
});
test('private newsletter APIs require the existing session and reject cross-origin writes and executable uploads',async()=>{
 const env=environment(),token=await session(env);assert.equal((await call(env,'')).status,401);assert.equal((await call(env,'',null,token)).status,200);
 let response=await handleRequest(new Request(origin+'/management-api/newsletter/draft',{method:'POST',headers:{Origin:'https://evil.invalid',Cookie:'__Host-ah_management='+token,'Content-Type':'application/json'},body:JSON.stringify(input)}),env);assert.equal(response.status,403);
 response=await handleRequest(new Request(origin+'/management-api/newsletter/images',{method:'POST',headers:{Origin:origin,Cookie:'__Host-ah_management='+token,'Content-Type':'image/png'},body:'<svg onload="alert(1)">'}),env);assert.equal(response.status,415);
 assert.throws(()=>newsletter.validate({...input,buttonUrl:'javascript:alert(1)'}));assert.throws(()=>newsletter.validate({...input,buttonUrl:'https://evil.invalid'}));
 const saved=await (await call(env,'/draft',input,token)).json();assert.equal(saved.campaign.status,'draft');
 const preview=await call(env,'/preview/'+saved.campaign.id,null,token);const html=await preview.text();assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(preview.headers.get('content-security-policy'),/default-src 'none'/);
 const page=fs.readFileSync('gestao/newsletter.html','utf8');assert.doesNotMatch(page,/<iframe/);assert.match(page,/id="openExactPreview"/);
});
test('campaign queue sends only confirmed members, suppresses cancellations and resumes without duplicate emails',async t=>{
 const env=environment(),token=await session(env),original=global.fetch,sent=[];global.fetch=async(url,opts)=>{const payload=JSON.parse(opts.body);sent.push({payload,key:opts.headers['Idempotency-Key']});return new Response(JSON.stringify({id:'mock-'+sent.length}));};t.after(()=>global.fetch=original);
 const a=await activeSubscriber(env,'one@example.invalid'),b=await activeSubscriber(env,'two@example.invalid');await newsletter.subscribe(env,'unconfirmed@example.invalid');sent.length=0;
 let campaign=(await (await call(env,'/draft',input,token)).json()).campaign;
 assert.equal((await call(env,'/send',{id:campaign.id,version:campaign.version,expectedRecipients:3,acknowledged:true},token)).status,409);
 const queued=await call(env,'/send',{id:campaign.id,version:campaign.version,expectedRecipients:2,acknowledged:true},token);assert.equal(queued.status,200);
 await newsletter.publicHandle(new Request(newsletter.urlFor(env,'unsubscribe',b),{method:'POST'}),env);
 await newsletter.processQueue(env);await newsletter.processQueue(env);
 assert.equal(sent.length,1);assert.deepEqual(sent[0].payload.to,[a.email]);assert.match(sent[0].payload.headers['List-Unsubscribe'],/unsubscribe/);assert.equal(sent[0].payload.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.match(sent[0].key,/^newsletter\//);
 const state=await (await call(env,'',null,token)).json();campaign=state.campaigns[0];assert.equal(campaign.status,'completed');assert.equal(campaign.sent,1);assert.equal(campaign.skipped,1);assert.equal(campaign.audience,undefined);
});
test('test messages can only target the authenticated operator, not a caller-supplied recipient',async t=>{
 const env=environment(),token=await session(env),original=global.fetch;let recipient;global.fetch=async(url,opts)=>{recipient=JSON.parse(opts.body).to;return new Response(JSON.stringify({id:'mock'}));};t.after(()=>global.fetch=original);
 const c=(await (await call(env,'/draft',input,token)).json()).campaign;const response=await call(env,'/test',{id:c.id,version:c.version,to:'stranger@example.invalid'},token);assert.equal(response.status,200);assert.deepEqual(recipient,[user]);
});
test('newsletter uploads enforce real image signatures and 3 MB size, and require signed public media URLs',async()=>{
 const env=environment(),token=await session(env),bytes=fs.readFileSync('assets/logo-sm.png');
 const response=await handleRequest(new Request(origin+'/management-api/newsletter/images',{method:'POST',headers:{Origin:origin,Cookie:'__Host-ah_management='+token,'Content-Type':'image/png'},body:bytes}),env);assert.equal(response.status,201);const saved=await response.json();
 assert.equal((await newsletter.publicHandle(new Request(saved.url.replace(/token=.*/,'')),env)).status,404);
 const image=await newsletter.publicHandle(new Request(saved.url),env);assert.equal(image.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
 const tooBig=await handleRequest(new Request(origin+'/management-api/newsletter/images',{method:'POST',headers:{Origin:origin,Cookie:'__Host-ah_management='+token,'Content-Type':'image/png','Content-Length':String(3*1024*1024+1)},body:bytes}),env);assert.equal(tooBig.status,413);
});
test('queue scan advances past paused campaigns instead of starving later work',async()=>{
 const env=environment();for(let i=0;i<6;i++){const id=String(i).padStart(8,'0')+'-0000-4000-8000-000000000000';await env.REVIEW_MEDIA.put('newsletter-queue/'+id,'{}');await env.REVIEW_MEDIA.put('newsletter-campaigns/'+id+'.json',JSON.stringify({id,status:i<5?'paused':'queued',audience:[],cursor:0}));}
 await newsletter.processQueue(env);await newsletter.processQueue(env);const last=await env.REVIEW_MEDIA.get('newsletter-campaigns/00000005-0000-4000-8000-000000000000.json');assert.equal(JSON.parse(await last.text()).status,'completed');
});
test('queue marker failure leaves a retryable draft; resume repairs a missing queue marker',async t=>{
 const env=environment(),token=await session(env),original=global.fetch;global.fetch=async()=>new Response(JSON.stringify({id:'mock'}));t.after(()=>global.fetch=original);await activeSubscriber(env);
 const c=(await (await call(env,'/draft',input,token)).json()).campaign,put=env.REVIEW_MEDIA.put;
 env.REVIEW_MEDIA.put=async(key,...args)=>{if(key.startsWith('newsletter-queue/'))throw Error('mock storage outage');return put(key,...args);};
 assert.equal((await call(env,'/send',{id:c.id,version:c.version,expectedRecipients:1,acknowledged:true},token)).status,502);
 assert.equal(JSON.parse(await(await env.REVIEW_MEDIA.get('newsletter-campaigns/'+c.id+'.json')).text()).status,'draft');env.REVIEW_MEDIA.put=put;
 const queued=(await (await call(env,'/send',{id:c.id,version:c.version,expectedRecipients:1,acknowledged:true},token)).json()).campaign;
 const paused=(await (await call(env,'/pause',{id:c.id,version:queued.version},token)).json()).campaign;
 await env.REVIEW_MEDIA.delete('newsletter-queue/'+c.id);assert.equal((await call(env,'/resume',{id:c.id,version:paused.version,acknowledged:true},token)).status,200);assert.ok(await env.REVIEW_MEDIA.get('newsletter-queue/'+c.id));
});
test('ambiguous network delivery retries the identical payload and idempotency key without skipping the recipient',async t=>{
 const env=environment(),token=await session(env),original=global.fetch,attempts=[];global.fetch=async()=>new Response(JSON.stringify({id:'mock-optin'}));t.after(()=>global.fetch=original);await activeSubscriber(env);
 const c=(await (await call(env,'/draft',input,token)).json()).campaign;await call(env,'/send',{id:c.id,version:c.version,expectedRecipients:1,acknowledged:true},token);
 global.fetch=async(url,opts)=>{attempts.push({key:opts.headers['Idempotency-Key'],body:opts.body});if(attempts.length===1)throw Error('connection lost after possible provider acceptance');return new Response(JSON.stringify({id:'same-provider-id'}));};
 await newsletter.processQueue(env);let saved=JSON.parse(await(await env.REVIEW_MEDIA.get('newsletter-campaigns/'+c.id+'.json')).text());assert.equal(saved.cursor,0);assert.equal(saved.failed,0);
 await newsletter.processQueue(env);saved=JSON.parse(await(await env.REVIEW_MEDIA.get('newsletter-campaigns/'+c.id+'.json')).text());assert.equal(saved.sent,1);assert.equal(saved.status,'completed');assert.deepEqual(attempts[0],attempts[1]);
});
test('in-page preview renders hostile campaign text as text nodes without HTML or script execution',()=>{
 const created=[];function element(tag){const node={tag,children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}};Object.defineProperty(node,'innerHTML',{set(){throw Error('Preview must not parse campaign HTML');}});created.push(node);return node;}
 const preview=element('div'),exact=element('a');
 const context={document:{createElement:element},$:id=>id==='emailPreview'?preview:exact,current:{id:crypto.randomUUID(),version:2,title:'<img onerror=alert(1)>',text:'<script>alert(1)</script>\n\nA real paragraph',images:[]}};
 const source=fs.readFileSync('gestao/newsletter.js','utf8');vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function renderPreview(){'),source.indexOf("$('previewButton').addEventListener")),context);context.renderPreview();
 assert.equal(created.find(node=>node.tag==='h3').textContent,context.current.title);assert.ok(created.some(node=>node.tag==='p'&&node.textContent==='<script>alert(1)</script>'));assert.equal(created.some(node=>node.tag==='script'||node.tag==='iframe'),false);assert.match(exact.href,/^\/management-api\/newsletter\/preview\//);
});
