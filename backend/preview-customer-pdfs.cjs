'use strict';
// Offline only: fictional records, in-memory storage, provider intercepted before HTTP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {bucket}=require('../tests/helpers/mock-r2.cjs');
const {makePdf,deliver}=require('./order-email.cjs');
const {render}=require('./dashboard-customer-email.cjs');
const {PDFDocument}=require('./node_modules/pdf-lib');
const base={version:1,id:'00000000-0000-4000-8000-00000000de01',createdAt:'2026-11-24T10:00:00Z',language:'pt',method:'stripe',status:'paid',manualRequestHash:'a'.repeat(64),customer:{name:'Inês Exemplo Fictício',email:'review@example.invalid',phone:'+351 000 000 000',notes:'Exemplo inteiramente fictício para revisão visual.'},items:[{title:'Lamara Chocolate',variant:'26″ · 200 g · Castanho chocolate',qty:2,unitCents:15000},{title:'Lamara Caramelo',variant:'18″ · Lace HD',qty:1,unitCents:12000}],subtotalCents:42000,discountCents:4200,couponCode:'FICTICIO',shippingCents:1000,totalCents:38800,fulfillmentMethod:'delivery',fulfillmentAddress:'Rua Fictícia 12, 0000-000 Cidade Exemplo, Portugal',shippingRegion:'EUROPE'};
function cases(){const result=[];for(const language of ['pt','en','es','fr','de','it'])for(const state of ['stripe-delivery','stripe-pickup','orange-awaiting','orange-paid','manual-delivery','manual-pickup']){const order=structuredClone(base);order.language=language;if(state.includes('pickup')){order.fulfillmentMethod='pickup';order.fulfillmentAddress='Loja Fictícia, Cidade Exemplo';order.shippingCents=0;order.totalCents-=1000;}if(state.startsWith('orange-'))Object.assign(order,{method:'orange_money',status:state==='orange-paid'?'paid':'awaiting_payment',shippingRegion:'INTL',fulfillmentAddress:'Rua Fictícia 12, Cidade Exemplo, Guiné-Bissau'});if(state.startsWith('manual'))order.method='manual_dashboard';result.push({name:language+'-'+state,order});}
 for(const fulfillmentMethod of ['delivery','pickup'])for(const kind of ['receipt','tracking','correction'])result.push({name:'pt-dashboard-'+kind+'-'+fulfillmentMethod,kind,order:{...structuredClone(base),fulfillmentMethod},tracking:kind==='receipt'?null:{carrier:'DHL',code:'FICTIONAL-REVIEW-0001',url:'https://www.dhl.com/pt-en/home/tracking.html'}});
 for(const isTest of [false,true]){const order=structuredClone(base);order.items=[order.items[0]];order.subtotalCents=30000;order.totalCents=26800;order.customer.notes='';if(isTest)order.isTest=true;result.push({name:isTest?'pt-test-mode':'pt-single-no-notes',order});}
 const long=structuredClone(base);long.items=Array.from({length:26},(_,i)=>({...base.items[i%2],title:'Artigo fictício '+(i+1)+' - '+base.items[i%2].title,qty:1}));long.subtotalCents=long.items.reduce((n,i)=>n+i.unitCents,0);long.totalCents=long.subtotalCents-long.discountCents+long.shippingCents;long.customer.notes=('Nota fictícia longa sem dados reais. ').repeat(90)+'X'.repeat(400);result.push({name:'pt-multipage',order:long});result.push({name:'fr-encoding',order:{...structuredClone(base),language:'fr',customer:{...base.customer,name:'Élodie Exemple',notes:'Cafe\u0301 · 26″ · 4′ · −1 · 😀 · 字'}}});return result;}
async function attachment(c){
 if(c.kind)return render(c.order,c.tracking,c.kind);
 const storage=bucket();
 if(c.order.method==='manual_dashboard'){
  const dashboard=require('./business-dashboard.cjs'),mail=require('./manual-paid-email.cjs'),order={...c.order,status:'awaiting_payment'};
  const digest=dashboard.safeOrder(order,null).orderDigest;
  let op=dashboard.applyAction(order,dashboard.blankOperations(),{version:0,action:'confirm_payment',acknowledged:true,reference:'fictional-only',expectedOrderDigest:digest},'review@example.invalid');
  op=dashboard.applyAction(order,op,{version:1,action:'approve_paid_email',acknowledged:true,expectedOrderDigest:digest,recipient:order.customer.email,idempotencyKey:'f'.repeat(32)},'review@example.invalid');
  Object.assign(op.paidEmail,{status:'claimed',leaseId:'fictional',claimedAt:'2026-11-24T10:00:00Z',expiresAt:'2026-11-24T10:05:00Z'});
  await storage.put('business-operations/'+order.id+'.json',JSON.stringify(op));
  const sealed=await mail.preparePaidEmail({REVIEW_MEDIA:storage,WORKER_GAS_SECRET:'fictional-local-key-never-used-in-production'},{id:order.id,eventId:op.paidEmail.eventId,leaseId:'fictional',now:'2026-11-24T10:01:00Z'});assert.equal(sealed.prepared,true);return JSON.parse(sealed.payload);
 }
 let payload;const saved=global.fetch;
 global.fetch=async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(init.body);return new Response(JSON.stringify({id:'fictional-provider-intercept'}));};
 try{await deliver({REVIEW_MEDIA:storage,RESEND_API_KEY:'fictional-no-network'},structuredClone(c.order));}finally{global.fetch=saved;}return payload;
}
async function main(){const out=path.resolve(__dirname,'../output/pdf/customer-redesign');fs.mkdirSync(out,{recursive:true});const manifest=[];const saved=global.fetch;global.fetch=async()=>{throw Error('Network forbidden in local PDF review')};try{for(const c of cases()){const payload=await attachment(c),bytes=Buffer.from(payload.attachments[0].content,'base64');if(!c.kind)assert.deepEqual(bytes,Buffer.from(await makePdf(c.order)));const file=path.join(out,c.name+'.pdf');fs.writeFileSync(file,bytes);const pdf=await PDFDocument.load(bytes);manifest.push({name:c.name,pdf:file,pngPrefix:path.join(out,c.name),pages:pdf.getPageCount(),attachmentFilename:payload.attachments[0].filename,sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')});}fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Generated '+manifest.length+' fictional production attachment PDFs; no HTTP requests. '+out);}finally{global.fetch=saved;}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={cases,attachment};
