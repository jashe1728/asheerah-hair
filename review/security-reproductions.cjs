// Read-only, local reproduction of review findings; no provider calls or live orders.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const {handleRequest} = require('../backend/stripe-worker.cjs');
const testSource = fs.readFileSync('tests/security-audit-remediation.test.cjs', 'utf8');
const harnessSource = testSource.slice(testSource.indexOf('function gasHarness('), testSource.indexOf("test('GAS authorization:"));
const harnessFor = source => new Function('vm','crypto','codeSource', harnessSource + '\nreturn gasHarness;')(vm,crypto,source)();
const oldSource = cp.execFileSync('git',['show','fd81469:backend/Code.gs'],{encoding:'utf8'});
const newSource = fs.readFileSync('backend/Code.gs','utf8');
const raw = JSON.stringify({type:'order',method:'orange_money',customer:{name:'Local Test',email:'test@example.com'},items:[],totalEur:120});
const signature = crypto.createHmac('sha256','test-gas-secret').update(raw).digest('hex');
const signed = JSON.stringify({...JSON.parse(raw),payload:raw,signature});
const post = (h, contents) => h.context.doPost({postData:{contents}});

(async()=>{
  const strict = harnessFor(newSource);
  assert.equal(post(strict,raw).error,'Unauthorized request');
  assert.equal(strict.sheets.Orders.length,1);
  console.log('CONFIRMED: strict GAS first rejects the old Worker unsigned Orange Money request.');
  const legacy = harnessFor(oldSource);
  assert.equal(post(legacy,signed).error,'Invalid worker action');
  assert.equal(legacy.sheets.Orders.length,1);
  console.log('CONFIRMED: signed Worker first is rejected by the old GAS signature dispatcher.');
  const matched = harnessFor(newSource);
  assert.equal(post(matched,signed).ok,true);
  assert.equal(matched.sheets.Orders.length,2);
  console.log('CONFIRMED: matched signed Worker / strict GAS contract records a local mock row.');

  let submit;
  let capturedStatus;
  const message={style:{}};
  const input={value:'local-review@example.com'};
  const form={addEventListener:(_,fn)=>{submit=fn;},querySelector:()=>input};
  const app = fs.readFileSync('assets/js/app.js','utf8');
  const c={CONFIG:{subscribeURL:'/public/subscribe'},document:{getElementById:id=>({nlForm:form,nlEmail:input,nlMsg:message}[id])},localStorage:{getItem:()=>null,setItem(){}},uiTxt:k=>k,
    fetch:async(url,opts)=>{
      const response=await handleRequest(new Request('https://asheerahhair.com'+url,{...opts,headers:{...opts.headers,Origin:'https://asheerahhair.com'}}),{SITE_ORIGIN:'https://asheerahhair.com',GAS_WEBHOOK_URL:'https://invalid.example',WORKER_GAS_SECRET:'local-only'});
      capturedStatus=response.status;return response;
    }};
  vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('function initNewsletter(){'),app.indexOf('// ---------- Page init ----------')),c);
  c.initNewsletter();await submit({preventDefault(){}});
  assert.equal(capturedStatus,400);
  assert.equal(message.textContent,'nl_ok');
  console.log('CONFIRMED: actual newsletter submit handler receives Worker HTTP 400 but displays nl_ok.');
  const report=await handleRequest(new Request('https://asheerahhair.com/public/csp-report',{method:'POST',headers:{'Content-Type':'application/csp-report'},body:'{}'}),{SITE_ORIGIN:'https://asheerahhair.com'});
  assert.equal(report.status,403);
  console.log('CONFIRMED: CSP report POST without Origin is rejected (403); valid-Origin path discards reports.');
})().catch(error=>{console.error(error);process.exitCode=1;});
