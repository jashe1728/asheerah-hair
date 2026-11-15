'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const settle=()=>new Promise(setImmediate);
const challenge='c'.repeat(48);
function setup({deferInitial=false}={}){
 const elements=new Map(),requests=[];let interval,resolveInitial,authenticated=false,orders=0;
 class Element{
  constructor(){const classes=new Set();this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle(n,on){if(on===undefined? !classes.has(n):on)classes.add(n);else classes.delete(n)}};this.dataset={};this.value='';this.hidden=false;this.open=false;this.textContent='';this.elements={fulfillmentMethod:{value:'delivery'}};}
  addEventListener(){}setAttribute(){}getAttribute(){return null}append(){}replaceChildren(){}reset(){}focus(){}before(){}after(){}querySelector(){return new Element()}querySelectorAll(){return []}showModal(){this.open=true}close(){this.open=false}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const body=new Element();body.classList.add('is-locked');
 const document={body,hidden:false,getElementById:get,createElement:()=>new Element(),querySelector:()=>new Element(),querySelectorAll:()=>[]};
 const context={document,location:{hostname:'example.invalid',search:'',origin:'https://example.invalid'},URL,URLSearchParams,Intl,Date,Uint8Array,crypto:require('node:crypto').webcrypto,console,setTimeout:()=>0,clearTimeout(){},setInterval(fn,ms){assert.equal(ms,60000);interval=fn},matchMedia:()=>({matches:false}),localStorage:{},navigator:{},window:{AHSession:{start:async()=>{},stop(){}},AHManualOrder:{createManualController:()=>({reset(){}})}},fetch:async(path,options={})=>{
  requests.push({path,body:options.body?JSON.parse(options.body):null});
  if(path==='/management-api/auth/start')return Response.json({challenge});
  if(path==='/management-api/auth/verify'){authenticated=true;return Response.json({ok:true})}
  if(path==='/management-api/orders'){
   orders++;if(deferInitial&&orders===1)return new Promise(resolve=>resolveInitial=resolve);
   return authenticated?Response.json({orders:[],identity:'owner@example.invalid',historyReady:true}):Response.json({error:'Session required'},{status:401});
  }
  throw Error('Unexpected request '+path);
 }};
 let source=fs.readFileSync('gestao/dashboard.js','utf8').replace('load();setInterval(','window.__test={state,load,lock};load();setInterval(');
 vm.runInNewContext(source,context);
 const submit=()=>get('loginForm').onsubmit({preventDefault(){}});
 return {get,requests,body,ui:context.window.__test,ready:async()=>{await settle();await settle()},requestCode:async()=>{get('loginEmail').value='owner@example.invalid';await submit()},verify:async()=>{get('loginCode').value='123456';await submit()},tick:async()=>{interval();await settle();await settle()},releaseInitial:response=>resolveInitial(response),expire:()=>authenticated=false};
}
test('a delayed startup unauthorized response cannot reset code entry already in progress',async()=>{
 const x=setup({deferInitial:true});await x.requestCode();x.get('loginCode').value='123';
 x.releaseInitial(Response.json({error:'Session required'},{status:401}));await x.ready();
 assert.equal(x.ui.state.challenge,challenge);assert.equal(x.get('codeStep').hidden,false);assert.equal(x.get('loginCode').value,'123');
 await x.verify();assert.equal(x.body.classList.contains('is-locked'),false);assert.equal(x.requests.filter(r=>r.path.endsWith('/auth/start')).length,1);
});
test('login can complete before the initial session check returns, and a late 401 cannot undo it',async()=>{
 const x=setup({deferInitial:true});await x.requestCode();await x.verify();
 assert.equal(x.body.classList.contains('is-locked'),false,'verification must load the new session instead of waiting behind an obsolete request');
 x.releaseInitial(Response.json({error:'Old session required'},{status:401}));await x.ready();
 assert.equal(x.body.classList.contains('is-locked'),false);assert.equal(x.get('identity').textContent,'owner@example.invalid');
});
test('an old successful startup response cannot overwrite the newly authenticated identity',async()=>{
 const x=setup({deferInitial:true});await x.requestCode();await x.verify();
 x.releaseInitial(Response.json({orders:[],identity:'obsolete@example.invalid',historyReady:false}));await x.ready();
 assert.equal(x.get('identity').textContent,'owner@example.invalid');assert.equal(x.get('backfillNotice').hidden,true);assert.equal(x.body.classList.contains('is-locked'),false);
});
test('private polling resumes after login and an actually expired session still locks and clears the dashboard',async()=>{
 const x=setup();await x.ready();await x.requestCode();await x.verify();
 const before=x.requests.filter(r=>r.path==='/management-api/orders').length;await x.tick();
 assert.equal(x.requests.filter(r=>r.path==='/management-api/orders').length,before+1);
 x.expire();await x.tick();assert.equal(x.body.classList.contains('is-locked'),true);assert.equal(x.get('identity').textContent,'Área privada');assert.equal(x.ui.state.orders.length,0);
});
test('one-minute background refresh must preserve the code-entry step and use the existing challenge',async()=>{
 const x=setup();await x.ready();await x.requestCode();x.get('loginCode').value='123';
 const requestsBefore=x.requests.length;await x.tick();
 assert.equal(x.ui.state.challenge,challenge,'polling must not discard the requested code challenge');
 assert.equal(x.get('codeStep').hidden,false);assert.equal(x.get('loginCode').value,'123');assert.equal(x.get('loginEmail').readOnly,true);
 assert.equal(x.requests.length,requestsBefore,'private order polling must pause while signed out');
 await x.verify();assert.equal(x.requests.filter(r=>r.path.endsWith('/auth/start')).length,1);assert.equal(x.requests.find(r=>r.path.endsWith('/auth/verify')).body.challenge,challenge);assert.equal(x.body.classList.contains('is-locked'),false);
});
