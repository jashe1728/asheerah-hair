'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function harness(){
 const nodes=new Map(),events={};
 function node(id,tag='DIV'){return {id,tagName:tag,children:[],value:'',textContent:'',hidden:false,disabled:false,checked:false,open:false,append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},querySelector(){return this.option??={disabled:false}},addEventListener(name,fn){this[name]=fn},removeAttribute(name){delete this[name]},showModal(){this.open=true},close(){this.open=false}};}
 const html=fs.readFileSync('gestao/index.html','utf8');for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="(customer[^"]+)"/g))nodes.set(match[2],node(match[2],match[1].toUpperCase()));
 const context={window:{},document:{getElementById:id=>{assert.ok(nodes.has(id),id);return nodes.get(id)},createElement:tag=>node('',tag.toUpperCase()),addEventListener:(name,fn)=>events[name]=fn},crypto:crypto.webcrypto,Uint8Array,Date,JSON,Error};
 vm.runInNewContext(fs.readFileSync('gestao/customer-email.js','utf8'),context);events.DOMContentLoaded();
 let outerVersion=0,afterSaveCalls=0,version=0;
 const state=()=>({version,order:{id:'00000000-0000-4000-8000-00000000de01',method:'manual_dashboard',fulfillmentMethod:'delivery'},operations:{stage:'courier_accepted'},tracking:null,carriers:{DHL:'https://www.dhl.com/pt-en/home/tracking.html'},messages:[],audit:[],senderEnabled:false,receiptAvailable:false});
 const api=async(path,input)=>{if(!input)return state();if(path.endsWith('/preview'))return {eventId:'event',version,digest:'a'.repeat(64),expiresAt:Date.now()+60000,payload:{from:'brand@example.invalid',to:['customer@example.invalid'],reply_to:'reply@example.invalid',subject:'review',text:'exact'}};if(path.endsWith('/approve')||path.endsWith('/resolve')){version++;return {status:'queued'}};throw Error('Unexpected API action');};
 const afterSave=async()=>{await new Promise(resolve=>setTimeout(resolve,5));outerVersion=version;afterSaveCalls++};
 return {nodes,app:context.window.AHCustomerEmail,order:state().order,api,afterSave,stats:()=>({outerVersion,version,afterSaveCalls})};
}
test('approve and resolve await outer dashboard version refresh before another order action',async()=>{
 const h=harness();await h.app.open(h.order,{api:h.api,afterSave:h.afterSave});assert.equal(h.nodes.get('customerReceipt').hidden,true,'staged UI must not offer a paused receipt cutover');
 await h.nodes.get('customerTrackingPreview').onclick({currentTarget:h.nodes.get('customerTrackingPreview'),preventDefault(){}});h.nodes.get('customerAck').checked=true;
 await h.nodes.get('customerApprove').onclick({currentTarget:h.nodes.get('customerApprove'),preventDefault(){}});
 assert.deepEqual(h.stats(),{outerVersion:1,version:1,afterSaveCalls:1});
 h.nodes.get('customerEvidence').value='Provider verification evidence';h.nodes.get('customerResolveAck').checked=true;
 await h.nodes.get('customerResolveForm').onsubmit({submitter:{tagName:'BUTTON'},preventDefault(){}});
 assert.deepEqual(h.stats(),{outerVersion:2,version:2,afterSaveCalls:2});
 h.app.reset();assert.equal(h.nodes.get('customerEmailDialog').open,false);
});
test('outer dialog accepts the returned current order without resetting pagination or dirty notes',()=>{const source=fs.readFileSync('gestao/dashboard.js','utf8'),start=source.indexOf('function acceptCustomerOrder('),end=source.indexOf('function renderDetail()',start),state={orders:[{id:'page-one',operations:{version:0}},{id:'selected-page-two',operations:{version:2}}],selected:'selected-page-two',cursor:'page-three'},note={textContent:'old',hidden:false},dirty={value:'unsaved note'},legacy={removed:false,remove(){this.removed=true}},detail={querySelector(selector){return selector==='.paid-email-status'?note:legacy}};let renders=0;const accept=vm.runInNewContext('('+source.slice(start,end)+')',{state,$:id=>id==='detail'?detail:dirty,render:()=>renders++,paidEmailMessage:()=> 'new receipt queued'});accept({id:'selected-page-two',operations:{version:5},dashboardReceiptOwned:true});assert.equal(state.orders.length,2);assert.equal(state.orders[1].operations.version,5);assert.equal(state.cursor,'page-three');assert.equal(dirty.value,'unsaved note');assert.equal(legacy.removed,true);assert.equal(renders,1);assert.ok(source.includes('afterSave:acceptCustomerOrder'));});
