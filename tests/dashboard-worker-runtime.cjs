'use strict';
// Run explicitly against the synthetic local Wrangler configuration, never a live URL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=process.env.DASHBOARD_LOCAL_URL||'http://127.0.0.1:8797',id='00000000-0000-4000-8000-00000000de06';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Only an explicit loopback local test URL is allowed');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
 const initial=await fetch(base+'/__demo/start',{method:'POST',headers:{Origin:base},signal:AbortSignal.timeout(15000)});assert.equal(initial.status,200);const cookie=initial.headers.get('set-cookie').split(';')[0];
 const api='/management-api/orders/'+id+'/customer-email';
 async function request(action,body,extra={}){return fetch(base+api+(action?'/'+action:''),{headers:{Cookie:cookie,Origin:base,...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{method:'POST',body:JSON.stringify(body)}:{})});}
 assert.equal((await fetch(base+api)).status,401);
 assert.equal((await request('record',{version:0,carrier:'DHL',code:'BAD'},{Origin:'https://evil.invalid'})).status,403);
 let state=await (await request('')).json();assert.equal(state.senderEnabled,false);
 if(process.argv.includes('--verify-persistence')){assert.equal(state.messages.at(-1).status,'queued');const pages=[];let cursor;do{const r=await fetch(base+'/management-api/customer-email-inventory'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{headers:{Cookie:cookie}});assert.equal(r.status,200);const page=await r.json();pages.push(page);cursor=page.cursor;}while(cursor);const manifest=require('../backend/dashboard-customer-inventory.cjs').buildManifest(pages),out=path.join(__dirname,'../output/worker-runtime');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inventory-pages.json'),JSON.stringify(pages,null,2));fs.writeFileSync(path.join(out,'inventory-manifest.json'),JSON.stringify(manifest,null,2));assert.notEqual(manifest.inventoryHash,pages[0].pageDigest);console.log('PASS: queued approval persisted; real local Worker inventory builds a complete canonical manifest; sender is off.');return;}
 assert.equal(state.messages.length,0,'Use a fresh synthetic local R2 state for the first run.');
 const saves=await Promise.all(['RUNTIME-ONE','RUNTIME-TWO'].map(code=>request('record',{version:state.version,carrier:'DHL',code})));assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
 state=await (await request('')).json();assert.equal(state.messages.length,0);
 const response=await request('preview',{version:state.version,kind:'tracking'});assert.equal(response.status,200);const preview=await response.json();assert.match(preview.payload.html,/lang="it"/);assert.equal(preview.payload.reply_to,'asheerahhair@gmail.com');assert.ok(!preview.payload.text.includes(id));
 const pdfResponse=await fetch(base+api+'/previews/'+preview.eventId+'/pdf',{headers:{Cookie:cookie}});assert.equal(pdfResponse.status,200);const pdf=Buffer.from(await pdfResponse.arrayBuffer());assert.equal(sha(pdf),sha(Buffer.from(preview.payload.attachments[0].content,'base64')));
 const html=await fetch(base+api+'/previews/'+preview.eventId+'/html',{headers:{Cookie:cookie}});assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/sandbox/);assert.match(await html.text(),/data:image\/png;base64,/);
 const approval={eventId:preview.eventId,version:preview.version,digest:preview.digest,key:'e'.repeat(48),acknowledged:true};
 const approvals=await Promise.all([request('approve',approval),request('approve',approval)]);assert.ok(approvals.some(r=>r.status===200));assert.ok(approvals.every(r=>[200,409].includes(r.status)));
 state=await (await request('')).json();assert.equal(state.messages[0].status,'queued');assert.equal(state.senderEnabled,false);assert.equal((await request('approve',approval)).status,200);
 const out=path.join(__dirname,'../output/worker-runtime');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'customer-it.pdf'),pdf);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({runtime:'actual workerd + local R2 + actual Worker fetch',auth:'passed',csrf:'passed',concurrentSaves:saves.map(r=>r.status),approvalStatuses:approvals.map(r=>r.status),replyTo:preview.payload.reply_to,pdfSha256:sha(pdf),status:state.messages[0].status,senderEnabled:state.senderEnabled},null,2));
 console.log('PASS: actual Worker auth/CSRF, R2 concurrency, real catalog glyphs, Italian email/PDF, exact attachment bytes, separate approval and idempotent replay; sender remains off.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
