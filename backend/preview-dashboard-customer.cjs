'use strict';
// Reproducible synthetic preview through the same attachment path as approval.
const fs=require('node:fs'),path=require('node:path');
const {createDemo,ID,fixture}=require('../tests/helpers/dashboard-synthetic.cjs');
const {makeCustomerPdf}=require('./dashboard-customer-pdf.cjs');
async function main(){
 const d=createDemo(),out=path.join(__dirname,'../output/pdf');fs.mkdirSync(out,{recursive:true});
 await d.flow.record(ID,{version:0,carrier:'DHL',code:'DEMO-PT-24001'},'operator@example.invalid');
 const p=await d.flow.preview(ID,{version:1,kind:'tracking'},'operator@example.invalid');
 fs.writeFileSync(path.join(out,'dashboard-customer-preview.pdf'),Buffer.from(p.payload.attachments[0].content,'base64'));
 fs.writeFileSync(path.join(out,'dashboard-email-preview.json'),JSON.stringify(p.payload,null,2));
 fs.writeFileSync(path.join(out,'dashboard-email-raw.html'),p.payload.html);
 const logo=p.payload.attachments.find(a=>a.content_id==='asheerah-logo');
 // MIME-aware browser simulation only: resolve CID from the exact sealed bytes.
 fs.writeFileSync(path.join(out,'dashboard-email-preview.html'),p.payload.html.replace('cid:asheerah-logo','data:image/png;base64,'+logo.content));
 const order=fixture().order,tracking={carrier:'DHL',code:'DEMO-CORRECTED-2',url:'https://www.dhl.com/pt-en/home/tracking.html'};
 fs.writeFileSync(path.join(out,'dashboard-correction-preview.pdf'),await makeCustomerPdf(order,tracking,true));
 order.customer.name='Inês Gonçalves';order.items=Array.from({length:18},(_,i)=>({qty:1,title:'Lamara Chocolate - artigo '+(i+1),variant:'Castanho chocolate · 18 polegadas · Edição verão'}));
 fs.writeFileSync(path.join(out,'dashboard-multipage-preview.pdf'),await makeCustomerPdf(order,tracking));
 console.log('Synthetic PDF extracted from the exact dashboard email attachment. No approval or provider call.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
