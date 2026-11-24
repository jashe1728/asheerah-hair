'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {PDFDocument,PDFName,PDFDict,PDFRawStream}=require('../backend/node_modules/pdf-lib');
const {makeCustomerPdf}=require('../backend/dashboard-customer-pdf.cjs');
const {createDemo,ID,fixture}=require('./helpers/dashboard-synthetic.cjs');
const brand=require('../backend/dashboard-brand-assets.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('original logo bytes are packaged unchanged, including embedded PDF image and mask',async()=>{
 const png=fs.readFileSync(path.join(__dirname,'../assets/logo-sm.png'));
 assert.equal(sha(Buffer.from(brand.png,'base64')),sha(png));assert.equal(brand.sha256,sha(png));
 const reference=await PDFDocument.create(),image=await reference.embedPng(png);await reference.save();
 const expected=reference.context.lookup(image.ref,PDFRawStream),pdf=await PDFDocument.load(await makeCustomerPdf(fixture().order,null));
 const actual=pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject'),PDFDict).lookup(PDFName.of('Logo'),PDFRawStream);
 assert.equal(sha(actual.getContents()),sha(expected.getContents()));
 assert.equal(sha(actual.dict.lookup(PDFName.of('SMask'),PDFRawStream).getContents()),sha(expected.dict.lookup(PDFName.of('SMask'),PDFRawStream).getContents()));
});
test('every PDF page repeats actual logo, editorial brand title and numbered footer',async()=>{
 const order=fixture().order;order.items=Array.from({length:30},()=>order.items[0]);
 const bytes=await makeCustomerPdf(order,null),pdf=await PDFDocument.load(bytes),raw=bytes.toString('latin1');
 assert.ok(pdf.getPageCount()>2);assert.equal((raw.match(/\/Logo Do/g)||[]).length,pdf.getPageCount());
 assert.equal((raw.match(/\/F3 34 Tf/g)||[]).length,pdf.getPageCount());assert.match(raw,/\/BaseFont \/Times-Italic/);
 for(let i=0;i<pdf.getPageCount();i++)assert.ok(pdf.getPage(i).node.Resources().lookup(PDFName.of('XObject'),PDFDict).has(PDFName.of('Logo')));
 assert.ok(!raw.includes('Ashyeerah'));assert.ok(raw.includes('41736865657261682048616972')); // Asheerah Hair, exact case and spelling.
});
test('all customer email kinds seal original inline logo and PDF; HTML has no external font or image request',async()=>{
 const d=createDemo();const initial=await d.store.read(ID);initial.value.order.method='manual_dashboard';initial.value.order.status='awaiting_payment';initial.value.order.version=1;initial.value.order.manualRequestHash='a'.repeat(64);initial.value.operations.paymentConfirmation={amountCents:initial.value.order.totalCents,orderDigest:sha(JSON.stringify(initial.value.order))};await d.store.cas(ID,initial.etag,initial.value);await d.flow.record(ID,{version:0,carrier:'DHL',code:'DEMO-1'},'demo');
 for(const kind of ['receipt','tracking','correction']){
  if(kind==='correction'){const r=await d.store.read(ID);r.value.messages.push({kind:'tracking',status:'accepted',tracking:{carrier:'DHL',code:'OLD'}});await d.store.cas(ID,r.etag,r.value);}
  const current=await d.flow.get(ID),p=await d.flow.preview(ID,{version:current.version,kind},'demo'),logo=p.payload.attachments.find(a=>a.content_id==='asheerah-logo');
  assert.equal(logo.content,brand.png);assert.equal(logo.content_type,'image/png');assert.match(p.payload.html,/<img src="cid:asheerah-logo"/);assert.match(p.payload.html,/font-style:italic/);assert.ok(!/src="https?:|@font-face|fonts\.google/.test(p.payload.html));
  assert.equal(p.payload.attachments[0].filename.endsWith('.pdf'),true);
 }
});
test('Portuguese NFC and editorial punctuation are supported; unknown Unicode blocks preview without queueing',async()=>{
 const order=fixture().order;order.customer.name='Ine\u0302s Gonçalves';order.items[0].title='Edição verão — “Chocolate” · 160 €';
 await assert.doesNotReject(()=>makeCustomerPdf(order,null));
 order.customer.name='示例';await assert.rejects(()=>makeCustomerPdf(order,null),/não suporta/);
 const d=createDemo(),r=await d.store.read(ID);r.value.order.customer.name='示例';await d.store.cas(ID,r.etag,r.value);
 await d.flow.record(ID,{version:0,carrier:'DHL',code:'UNICODE-DEMO'},'demo');await assert.rejects(()=>d.flow.preview(ID,{version:1,kind:'tracking'},'demo'),/não suporta/);assert.equal((await d.flow.get(ID)).messages.length,0);assert.equal(d.calls.length,0);
});
test('Worker-shaped runtime generates branded PDF without filesystem, font decoder, network or pdf-lib',async()=>{
 const cache=new Map(),base=path.resolve(__dirname,'../backend'),seen=[];
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);seen.push(path.basename(file));
  if(file.endsWith('.json')){const data=JSON.parse(fs.readFileSync(file,'utf8'));cache.set(file,data);return data;}
  const module={exports:{}};cache.set(file,module.exports);
  const context={module,exports:module.exports,Buffer,Uint8Array,Map,performance,structuredClone,require(name){if(name==='node:crypto')return crypto;if(!name.startsWith('./'))throw Error('Runtime import forbidden: '+name);return load(path.resolve(path.dirname(file),name));},fetch(){throw Error('No network')}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});cache.set(file,module.exports);return module.exports;
 }
 const renderer=load(path.join(base,'dashboard-customer-pdf.cjs')),bytes=await renderer.makeCustomerPdf(fixture().order,null);assert.match(bytes.toString(),/^%PDF/);assert.ok(seen.includes('dashboard-brand-assets.json'));assert.ok(seen.every(s=>!s.includes('node_modules')));
});
