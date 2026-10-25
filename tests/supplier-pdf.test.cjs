'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,model}=require('../gestao/supplier-pdf.js');
const {PDFDocument}=require('../gestao/vendor/pdf-lib-1.17.1.min.js');
const fixture=()=>({id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-10-25T10:00:00Z',status:'paid',method:'stripe',customer:{name:'Inês Exemplo',email:'private@example.com',phone:'+351 000 000 000',notes:'PRIVATE CUSTOMER NOTE',address:'Morada fictícia',city:'Lisboa',country:'PT'},items:[{title:'Body Wave Wig',variant:'26″ / 13x4 HD / 200% / M',qty:3,unitCents:21399}],totalCents:64697,couponCode:'PRIVATE COUPON',sessionId:'PRIVATE STRIPE SESSION',operations:{stage:'new',notes:'PRIVATE INTERNAL NOTE',events:[]}});
test('supplier model only includes preparation and delivery data',()=>{
 const data=model(fixture()),json=JSON.stringify(data);
 for(const s of ['Inês Exemplo','Morada fictícia','13x4 HD','"qty":3'])assert.ok(json.includes(s));
 for(const s of ['private@example.com','21399','64697','PRIVATE','coupon','unitCents','totalCents'])assert.equal(json.includes(s),false);
});
test('export requires payment and historical classification',()=>{
 assert.throws(()=>model({...fixture(),status:'pending_checkout'}),/pagamento/);
 assert.throws(()=>model({...fixture(),operations:{stage:'needs_review'}}),/estado anterior/);
 const manual={...fixture(),method:'orange_money',status:'awaiting_payment',operations:{stage:'new',paymentConfirmation:{at:'2026-10-25'}}};
 assert.equal(model(manual).items[0].qty,3);
 assert.throws(()=>model({...fixture(),items:[{title:'Invalid',qty:0}]}),/Quantidade/);
});
test('actual PDF is readable and long orders paginate',async()=>{
 const one=await create(fixture());assert.equal(Buffer.from(one).subarray(0,5).toString(),'%PDF-');
 assert.equal((await PDFDocument.load(one)).getPageCount(),1);
 const many=fixture();many.items=Array.from({length:28},(_,i)=>({...many.items[0],title:'Artigo '+i+' - '+('descrição detalhada '.repeat(6)),variant:'26 / '+('opção '.repeat(35))}));
 const bytes=await create(many);assert.ok((await PDFDocument.load(bytes)).getPageCount()>2);
});
test('pickup uses collection location and options fallback',()=>{
 const o={...fixture(),fulfillmentMethod:'pickup',fulfillmentAddress:'Loja fictícia',items:[{title:'Wig',qty:1,opts:{opt1:'26',opt2:'13x4',opt3:'200%'}}]};
 assert.equal(model(o).pickup,true);assert.equal(model(o).address,'Loja fictícia');assert.equal(model(o).items[0].variant,'26 · 13x4 · 200%');
});
