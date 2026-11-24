'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('actual Worker entry delegates checkout fetch unchanged and wires dashboard cron only behind disabled-by-default flag',async()=>{
 const backend=path.resolve(__dirname,'../backend'),calls=[],fetches=[];
 const mocks={'stripe-worker.cjs':{fetch:(...args)=>({delegated:args})},'order-email.cjs':{retryPending:async()=>{}},'management-auth.cjs':{cleanup:async()=>{}},'business-dashboard.cjs':{backfill:async()=>{}},'public-security.cjs':{cleanup:async()=>{}},'newsletter.cjs':{processQueue:async()=>{}},'checkout-monitor.cjs':{run:async()=>{}},'manual-paid-email.cjs':{runScheduledPaidEmail:async()=>{}},'dashboard-customer-service.cjs':{scheduled:async(env,options)=>{calls.push(env);await options.fetch('https://example.invalid/fake-test')}}};
 for(const [name,exports]of Object.entries(mocks)){const filename=require.resolve(path.join(backend,name));require.cache[filename]={id:filename,filename,loaded:true,exports};}
 const savedFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{fetches.push(args);return new Response('{}')};
 try{const worker=(await import(pathToFileURL(path.join(backend,'worker.mjs')).href)).default;const request={},env={},ctx={};assert.deepEqual(worker.fetch(request,env,ctx),{delegated:[request,env,ctx]});
  for(const flag of [undefined,'','0','true',1]){const pending=[];worker.scheduled({},{DASHBOARD_CUSTOMER_EMAIL_SEND_ENABLED:flag},{waitUntil:p=>pending.push(p)});await Promise.all(pending);}assert.equal(calls.length,0);
  const pending=[],configured={DASHBOARD_CUSTOMER_EMAIL_SEND_ENABLED:'1'};worker.scheduled({},configured,{waitUntil:p=>pending.push(p)});await Promise.all(pending);assert.deepEqual(calls,[configured]);assert.equal(fetches.length,1);assert.equal(fetches[0][0],'https://example.invalid/fake-test');
 }finally{globalThis.fetch=savedFetch;for(const name of Object.keys(mocks))delete require.cache[require.resolve(path.join(backend,name))];}
});
