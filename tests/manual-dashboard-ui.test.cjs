const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('dashboard exposes manual intake and pending manual confirmation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../gestao/index.html'),'utf8');
 const dashboard=fs.readFileSync(path.join(__dirname,'../gestao/dashboard.js'),'utf8');
 assert.match(html,/id="manualOrderDialog"/);assert.match(html,/manual-order\.js/);
 assert.match(dashboard,/manual_dashboard.*confirm_payment/);
});
const {createManualController,variantItem}=require('../gestao/manual-order.js');
function memory(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('reset clears reviewed customer data and prevents submission',()=>{
 const c=createManualController({storage:memory(),key:()=> 'a'.repeat(32),send:()=>{throw Error('must not send')}});c.review({customer:{name:'Fiction'}});c.reset();assert.throws(()=>c.submit(),/Revê/);
});
test('variant selection sends only catalog option keys and quantity',()=>{
 const item=variantItem({handle:'wig',variants:[{title:'16 / HD',opt1:'16',opt2:'HD',price_eur:100}]},0,2);
 assert.deepEqual(item,{handle:'wig',options:{opt1:'16',opt2:'HD'},quantity:2});
 assert.throws(()=>variantItem({variants:[]},0,1));
 assert.throws(()=>variantItem({handle:'wig',variants:[{opt1:'16'}]},0,11));
});
test('failed submission retries with the same frozen payload and key',async()=>{
 let calls=[];const c=createManualController({storage:memory(),key:()=> 'k'.repeat(32),send:async(body,key)=>{calls.push({body:structuredClone(body),key});if(calls.length===1)throw Error('offline');return {ok:true};}});c.review({customer:{name:'Fiction'}});await assert.rejects(c.submit());await c.submit();assert.deepEqual(calls[0],calls[1]);
});
test('review freezes the exact request and duplicate submissions share one in-flight request',async()=>{
 let resolve,calls=[];const ctl=createManualController({storage:memory(),key:()=> 'a'.repeat(32),send:(body,key)=>{calls.push({body,key});return new Promise(r=>resolve=r)}});
 const input={channel:'whatsapp',customer:{name:'Fiction',email:'fiction@example.invalid',phone:'123',country:'PT',address:'Fiction street',city:'Lisbon',postalCode:'1000'},items:[{handle:'wig',options:{opt1:'16'},quantity:1}],fulfillmentMethod:'delivery',language:'pt'};
 ctl.review(input);input.items[0].quantity=9;
 const a=ctl.submit(),b=ctl.submit();assert.equal(calls.length,1);assert.equal(calls[0].body.items[0].quantity,1);resolve({order:{id:'example'}});assert.deepEqual(await a,await b);
});

test('manual catalog comes from the authenticated backend catalog endpoint',()=>{const source=fs.readFileSync(path.join(__dirname,'../gestao/dashboard.js'),'utf8');assert.match(source,/fetch\('\/management-api\/manual-catalog'/);});

test('review fetches and displays authoritative quote totals',()=>{const source=fs.readFileSync(path.join(__dirname,'../gestao/dashboard.js'),'utf8');assert.match(source,/fetch\('\/management-api\/manual-quote'/);assert.match(source,/quote\.shippingCents/);assert.match(source,/quote\.totalCents/);assert.match(source,/quoteId:quote\.quoteId/);});

test('quote rejection leaves marker pending',async()=>{const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};const controller=createManualController({key:()=> 'x'.repeat(32),storage,send:async()=>{const e=Error('stale');e.status=422;throw e;}});controller.review({a:1});await assert.rejects(controller.submit());assert.ok(controller.recovery());assert.throws(()=>controller.review({a:2}),/pendente/i);});
