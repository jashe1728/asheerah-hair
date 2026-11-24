'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cases,attachment}=require('../backend/preview-customer-pdfs.cjs');
const {makePdf}=require('../backend/order-email.cjs');
const {translator}=require('../backend/order-email-i18n.cjs');
const {PDFDocument}=require('../backend/node_modules/pdf-lib');
function strings(bytes){return [...Buffer.from(bytes).toString('latin1').matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>new TextDecoder('windows-1252').decode(Buffer.from(m[1],'hex'))).join(' ');}
test('actual provider attachments match actual PDF renderer in all payment, fulfillment and locale variants',async()=>{
 const original=global.fetch;global.fetch=async()=>{throw Error('Unexpected network')};
 try{for(const c of cases().filter(c=>!c.kind)){
  const payload=await attachment(c),bytes=Buffer.from(payload.attachments[0].content,'base64');assert.deepEqual(bytes,Buffer.from(await makePdf(c.order)),c.name);
  assert.equal(payload.attachments.length,1);assert.equal(payload.attachments[0].filename,'Asheerah-Hair-0000DE01.pdf');
  const text=strings(bytes),t=translator(c.order.language);assert.ok(text.includes(t(c.order.status==='paid'?'Total pago':'Total a pagar')),c.name);
  if(c.order.status!=='paid'){assert.ok(!text.includes(t('Total pago')));assert.ok(text.includes('Ciara Ly'));assert.ok(text.includes(t('A encomenda é confirmada após a receção do pagamento.')));}
  if(c.order.method==='manual_dashboard')assert.ok(!/Stripe|Orange Money|6[–-]10|9[–-]15/.test(text));
  if(c.order.fulfillmentMethod==='pickup')assert.ok(!/6[–-]10|9[–-]15/.test(text));
  const pdf=await PDFDocument.load(bytes),source=bytes.toString('latin1');assert.match(source,/\/BaseFont \/Times-Italic/);
  if(c.name!=='pt-multipage')assert.equal(pdf.getPageCount(),1,c.name+': ordinary orders must not strand notes or signoff on page 2');
  if(c.order.isTest)assert.ok(text.includes(t('TESTE - SEM COMPRA OU PAGAMENTO REAL')));
  assert.equal((source.match(/\/Logo Do/g)||[]).length,pdf.getPageCount());
  assert.equal((source.match(/34 Tf .* 180 765 Tm/g)||[]).length,pdf.getPageCount());
  const metrics=new Map(Object.values(require('../backend/order-pdf-template.json').glyphs).map(g=>[g[0].toLowerCase(),g]));
  const draws=[];
  for(const m of source.matchAll(/BT \/(F[12]) ([\d.]+) Tf [\d. ]+ rg 1 0 0 1 ([\d.]+) ([\d.]+) Tm <([a-f\d]+)> Tj/gi)){
   const size=Number(m[2]),x=Number(m[3]),y=Number(m[4]),width=(m[5].match(/../g)||[]).reduce((sum,b)=>sum+metrics.get(b.toLowerCase())[m[1]==='F1'?1:2]*size,0);
   assert.ok(x>=36&&x+width<=560,`${c.name}: text outside horizontal margin at ${x},${y}`);
   assert.ok(y===32||y>=64,`${c.name}: body entered footer at ${y}`);
   draws.push({x,y,width,text:new TextDecoder('windows-1252').decode(Buffer.from(m[5],'hex'))});
  }
  const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,c.name+': numeric right edge '+actual+' expected '+expected);
  const header=draws.find(d=>d.text===t('ARTIGO'));
  for(const [label,edge]of [[t('QTD.'),355],[t('UNITÁRIO'),447],[t('TOTAL'),547]]){const d=draws.find(d=>d.y===header.y&&d.text===label);assert.ok(d,c.name+': translated numeric header');close(d.x+d.width,edge);}
  const row=draws.find(d=>d.text===c.order.items[0].title),numeric=draws.filter(d=>d.y===row.y&&d.x>320);assert.equal(numeric.length,3,c.name+': three numeric row values');numeric.forEach((d,i)=>close(d.x+d.width,[355,447,547][i]));
  const date=draws.find(d=>d.text===c.order.createdAt.slice(0,10));close(date.x+date.width,547);
  assert.ok(text.includes('26"'));if(c.name==='pt-multipage')assert.ok(pdf.getPageCount()>=3);
  if(c.name==='fr-encoding'){assert.ok(text.includes('Café'));assert.ok(text.includes('4\''));assert.ok(text.includes('-1'));assert.ok(text.includes('?'));}
 }}finally{global.fetch=original;}
});
test('all locales distinguish paid and unpaid Orange Money without contradictory instructions',async()=>{
 for(const c of cases().filter(c=>c.name.endsWith('orange-awaiting')))for(const status of ['paid','awaiting_payment']){
  const text=strings(await makePdf({...c.order,status})),t=translator(c.order.language),paid=status==='paid';
  assert.ok(text.includes(t(paid?'Total pago':'Total a pagar')));assert.equal(text.includes('Ciara Ly'),!paid);
  assert.equal(text.includes(t('A encomenda é confirmada após a receção do pagamento.')),!paid);
  assert.equal(text.includes(t('Pagamento confirmado')),paid);assert.equal(text.includes(t('A aguardar confirmação do pagamento')),!paid);
 }
});
