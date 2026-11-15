'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const elements=new Map();let response,interval;
 class Element{
  constructor(id=''){this.id=id;this.dataset={};this.classList={add(){},remove(){},toggle(){}};this.value='';this.hidden=false;this.open=false;this.elements={fulfillmentMethod:{value:'delivery'}};this.children=[];}
  closest(){return this} addEventListener(){} setAttribute(){} querySelector(s){if(s==='.paid-email-status')return this.children.find(x=>x.className?.includes('paid-email-status'))||null;if(s==='.detail-actions')return this.actions||(this.actions={before:n=>this.children.push(n),append(){},insertAdjacentHTML(){}});return null} querySelectorAll(){return []} append(){} replaceChildren(){} showModal(){this.open=true} close(){this.open=false} reset(){} after(){} before(){}
  set innerHTML(v){this.html=v;this.children=[]} get innerHTML(){return this.html||''}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 const document={getElementById:get,createElement:()=>new Element(),querySelector:()=>new Element(),querySelectorAll:()=>[],body:new Element()};
 const context={crypto:require('node:crypto').webcrypto,document,location:{hostname:'example.invalid',search:'',origin:'https://example.invalid'},URL,URLSearchParams,Intl,Date,Uint8Array,console,setTimeout:()=>0,clearTimeout(){},setInterval(fn){interval=fn},matchMedia:()=>({matches:false}),localStorage:{},navigator:{},window:{AHSession:{start:async()=>{},stop(){}},AHManualOrder:{createManualController:()=>({reset(){}})}},fetch:async()=>({ok:true,status:200,json:async()=>await response})};
 let source=fs.readFileSync('gestao/dashboard.js','utf8').replace('load();setInterval(','window.__test={state,openOrder,load,lock,beginAction,render,supplierText};setInterval(');vm.runInNewContext(source,context);
 const ui=context.window.__test;
 const order=status=>({id:'11111111-1111-4111-8111-111111111111',createdAt:new Date().toISOString(),method:'manual_dashboard',status:'paid',customer:{name:'Synthetic',email:'test@example.invalid'},items:[],totalCents:100,operations:{stage:'new',notes:'saved',events:[],paidEmail:{status}}});
 return {ui,get,order,tick:async()=>{interval();await new Promise(setImmediate)},respond:orders=>response={orders,identity:'Owner',historyReady:true},defer:p=>response=p,note:()=>get('detail').children.find(x=>x.textContent?.startsWith('E-mail de confirmação:'))};
}
test('quiet refresh updates open email status without replacing focused edits or dialogs',async()=>{
 const x=setup(),pending=x.order('pending');x.ui.state.orders=[pending];x.ui.openOrder(pending.id);const note=x.note(),detail=x.get('detail');assert.match(note.textContent,/pendente/);
 const draft={value:'unsaved note'};detail.draft=draft;x.get('actionDialog').open=true;x.respond([x.order('accepted')]);await x.ui.load(false,true);
 assert.match(note.textContent,/aceite pelo serviço/);assert.equal(detail.draft,draft);assert.equal(draft.value,'unsaved note');assert.equal(x.get('orderDialog').open,true);assert.equal(x.get('actionDialog').open,true);
 x.respond([x.order('needs_review')]);await x.ui.load(false,true);assert.match(note.textContent,/necessita de revisão/);
});
test('email approval review preserves the original hash reference instead of displaying the internal UUID',()=>{
 const x=setup(),o={...x.order('not_sent'),id:'64bada3c-2c23-49de-9576-351de7e56cad',manualEmailAvailable:true,orderDigest:'a'.repeat(64)};
 x.ui.state.orders=[o];x.ui.openOrder(o.id);
 assert.ok(x.get('detail').innerHTML.includes('Encomenda #E7E56CAD'));
 x.ui.beginAction('approve_paid_email');
 const review=x.get('paidEmailReview').innerHTML;
 assert.ok(review.includes('#E7E56CAD'),'review must use the same reference as the order list and details');
 assert.ok(!review.includes(o.id),'technical UUID must not replace the original order reference');
 assert.equal(x.ui.state.reviewedOrder.id,o.id,'approval must still target the exact internal record');
});
for(const fulfillmentMethod of ['delivery','pickup'])test(`${fulfillmentMethod}: initial reference survives payment, supplier, carrier or collection, and completion`,()=>{
 const backend=require('../backend/business-dashboard.cjs'),supplier=require('../gestao/supplier-pdf.js');
 const x=setup(),id='64bada3c-2c23-49de-9576-351de7e56cad',reference='#E7E56CAD';
 const order={...x.order(''),id,status:'awaiting_payment',version:1,manualRequestHash:'b'.repeat(64),fulfillmentMethod,items:[{title:'Synthetic wig',qty:1,unitCents:100}]};
 delete order.operations;const before=JSON.stringify(order);let op=backend.blankOperations(order);
 x.get('statusFilter').value='all';x.get('period').value='all';
 const check=()=>{const safe=backend.safeOrder(order,op);x.ui.state.orders=[safe];x.ui.render();x.ui.openOrder(id);assert.ok(x.get('ordersBody').innerHTML.includes('class="order-ref">'+reference));assert.ok(x.get('detail').innerHTML.includes('Encomenda '+reference));assert.equal(safe.id,id);assert.equal(JSON.stringify(order),before);if(op.paymentConfirmation){assert.ok(x.ui.supplierText(safe).includes('Referência: '+reference));assert.equal(supplier.model(safe).reference,reference);}};
 check();const digest=backend.safeOrder(order,op).orderDigest;
 for(const action of ['confirm_payment','supplier_sent','supplier_accepted',fulfillmentMethod==='pickup'?'pickup_ready':'courier_accepted','delivered']){
  op=backend.applyAction(order,op,{version:op.version,action,acknowledged:true,reference:'synthetic-receipt',tracking:'synthetic-tracking',expectedOrderDigest:digest},'test-operator');check();
 }
});
test('manual payment confirmation explains accounting is not updated',()=>{
 const x=setup(),o=x.order('pending');x.ui.state.orders=[o];x.ui.state.selected=o.id;x.ui.beginAction('confirm_payment');
 assert.match(x.get('actionDescription').textContent,/apenas na área de gestão/i);assert.match(x.get('actionDescription').textContent,/não atualiza a contabilidade/i);
});
test('scheduled refresh updates an open order while preserving an unsaved draft and pauses for confirmation',async()=>{
 const x=setup(),pending=x.order('pending');x.ui.state.orders=[pending];x.ui.openOrder(pending.id);const note=x.note(),detail=x.get('detail'),draft={value:'unsaved'};detail.draft=draft;
 x.respond([x.order('accepted')]);await x.tick();assert.match(note.textContent,/aceite pelo serviço/);assert.equal(detail.draft,draft);assert.equal(draft.value,'unsaved');
 x.get('actionDialog').open=true;x.respond([x.order('needs_review')]);await x.tick();assert.match(note.textContent,/aceite pelo serviço/);assert.equal(x.get('actionDialog').open,true);
 x.get('actionDialog').open=false;await x.tick();assert.match(note.textContent,/necessita de revisão/);
});
test('a refresh completing after lock cannot reopen the dialog or restore private orders',async()=>{
 const x=setup(),pending=x.order('pending');x.ui.state.orders=[pending];x.ui.openOrder(pending.id);
 let resolve; x.defer(new Promise(r=>resolve=r));const loading=x.ui.load(false,true);await Promise.resolve();x.ui.lock();resolve({orders:[x.order('accepted')],identity:'Owner',historyReady:true});await loading;
 assert.equal(x.ui.state.orders.length,0);assert.equal(x.ui.state.selected,null);assert.equal(x.get('orderDialog').open,false);assert.equal(x.get('detail').textContent,'');
});
