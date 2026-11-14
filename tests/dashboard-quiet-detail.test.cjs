'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const elements=new Map();let response;
 class Element{
  constructor(id=''){this.id=id;this.dataset={};this.classList={add(){},remove(){},toggle(){}};this.value='';this.hidden=false;this.open=false;this.elements={fulfillmentMethod:{value:'delivery'}};this.children=[];}
  closest(){return this} addEventListener(){} setAttribute(){} querySelector(s){if(s==='.paid-email-status')return this.children.find(x=>x.className?.includes('paid-email-status'))||null;if(s==='.detail-actions')return this.actions||(this.actions={before:n=>this.children.push(n),append(){},insertAdjacentHTML(){}});return null} querySelectorAll(){return []} append(){} replaceChildren(){} showModal(){this.open=true} close(){this.open=false} reset(){} after(){} before(){}
  set innerHTML(v){this.html=v;this.children=[]} get innerHTML(){return this.html||''}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 const document={getElementById:get,createElement:()=>new Element(),querySelector:()=>new Element(),querySelectorAll:()=>[],body:new Element()};
 const context={document,location:{hostname:'example.invalid',search:'',origin:'https://example.invalid'},URL,URLSearchParams,Intl,Date,Uint8Array,console,setTimeout:()=>0,clearTimeout(){},setInterval(){},matchMedia:()=>({matches:false}),localStorage:{},navigator:{},window:{AHSession:{start:async()=>{},stop(){}},AHManualOrder:{createManualController:()=>({reset(){}})}},fetch:async()=>({ok:true,status:200,json:async()=>await response})};
 let source=fs.readFileSync('gestao/dashboard.js','utf8').replace('load();setInterval(','window.__test={state,openOrder,load,lock};setInterval(');vm.runInNewContext(source,context);
 const ui=context.window.__test;
 const order=status=>({id:'11111111-1111-4111-8111-111111111111',createdAt:new Date().toISOString(),method:'manual_dashboard',status:'paid',customer:{name:'Synthetic',email:'test@example.invalid'},items:[],totalCents:100,operations:{stage:'new',notes:'saved',events:[],paidEmail:{status}}});
 return {ui,get,order,respond:orders=>response={orders,identity:'Owner',historyReady:true},defer:p=>response=p,note:()=>get('detail').children.find(x=>x.textContent?.startsWith('E-mail de confirmação:'))};
}
test('quiet refresh updates open email status without replacing focused edits or dialogs',async()=>{
 const x=setup(),pending=x.order('pending');x.ui.state.orders=[pending];x.ui.openOrder(pending.id);const note=x.note(),detail=x.get('detail');assert.match(note.textContent,/pendente/);
 const draft={value:'unsaved note'};detail.draft=draft;x.get('actionDialog').open=true;x.respond([x.order('accepted')]);await x.ui.load(false,true);
 assert.match(note.textContent,/aceite pelo serviço/);assert.equal(detail.draft,draft);assert.equal(draft.value,'unsaved note');assert.equal(x.get('orderDialog').open,true);assert.equal(x.get('actionDialog').open,true);
 x.respond([x.order('needs_review')]);await x.ui.load(false,true);assert.match(note.textContent,/necessita de revisão/);
});
test('a refresh completing after lock cannot reopen the dialog or restore private orders',async()=>{
 const x=setup(),pending=x.order('pending');x.ui.state.orders=[pending];x.ui.openOrder(pending.id);
 let resolve; x.defer(new Promise(r=>resolve=r));const loading=x.ui.load(false,true);await Promise.resolve();x.ui.lock();resolve({orders:[x.order('accepted')],identity:'Owner',historyReady:true});await loading;
 assert.equal(x.ui.state.orders.length,0);assert.equal(x.ui.state.selected,null);assert.equal(x.get('orderDialog').open,false);assert.equal(x.get('detail').textContent,'');
});
