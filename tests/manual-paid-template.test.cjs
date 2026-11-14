'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renderEmail,makePdf}=require('../backend/order-email.cjs');
const {fixture}=require('../backend/preview-order-email.cjs');
const {languages,translator}=require('../backend/order-email-i18n.cjs');
const {PDFDocument,PDFName,PDFArray,decodePDFRawStream}=require('../backend/node_modules/pdf-lib');
async function pdfText(order){
 const doc=await PDFDocument.load(await makePdf(order));let text='';
 for(const page of doc.getPages()){
  const contents=page.node.Contents();
  const refs=contents instanceof PDFArray?contents.asArray():[contents];
  for(const ref of refs){const stream=doc.context.lookup(ref);if(!stream)continue;const source=Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');for(const match of source.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))text+=Buffer.from(match[1],'hex').toString('latin1')+'\n';}
 }
 return text;
}
for(const language of languages)for(const fulfillmentMethod of ['delivery','pickup'])test(`${language} ${fulfillmentMethod}: paid manual confirmation is provider-neutral and makes no delivery estimate`,async()=>{
 const order={...fixture,language,fulfillmentMethod,method:'manual_dashboard',status:'paid'};
 const email=renderEmail(order),pdf=await pdfText(order),t=translator(language);
 for(const output of [email.html,email.text,pdf]){
  assert.ok(output.includes(t('Pagamento confirmado')),'payment confirmed');
  assert.ok(!/Stripe|Orange Money|Ciara Ly|(?<!\d)(?:6[–-]10|9[–-]15)(?!\d)/i.test(output),'incorrect provider or estimate');
 }
 assert.ok(!email.html.includes(t('A caminho de si')));
 assert.ok(!email.html.includes(t('À sua espera na loja')));
 assert.ok(email.html.includes(t(fulfillmentMethod==='pickup'?'Ponto de recolha':'Morada de entrega')));
 const reference='#'+order.id.slice(-8).toUpperCase();
 for(const output of [email.subject,email.html,email.text,pdf]) {
  assert.ok(output.includes(reference),'short order reference');
  assert.ok(!output.includes(order.id),'full order ID is not customer-facing');
 }
});
test('other payment flows retain their provider and delivery information',async()=>{
 for(const [method,status,provider] of [['stripe','paid','Stripe'],['orange_money','awaiting_payment','Orange Money']]){
  const order={...fixture,method,status,fulfillmentMethod:'delivery'};const email=renderEmail(order),pdf=await pdfText(order);
  assert.ok(email.text.includes(provider));assert.ok(pdf.includes(provider));assert.match(email.html,/6–10 dias úteis/);
 }
});
