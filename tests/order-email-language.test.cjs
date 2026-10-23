const test=require('node:test'),assert=require('node:assert/strict');
const {languages,dictionaries,normalizeLanguage,translator}=require('../backend/order-email-i18n.cjs');
const {snapshot,renderEmail,makePdf}=require('../backend/order-email.cjs');
const {normalizeCheckoutRequest}=require('../backend/stripe-worker.cjs');
const {fixture}=require('../backend/preview-order-email.cjs');
const {PDFDocument}=require('../backend/node_modules/pdf-lib');
const catalog={currency:'EUR',products:[{handle:'wig',title:'Wig',variants:[{title:'16 / 200%',opt1:'16',price_eur:100}]}]};
const input={customer:{name:'Test',email:'test@example.com',phone:'123456789',country:'PT',address:'Test street',city:'Lisbon',postalCode:'1000'},items:[{handle:'wig',options:{opt1:'16'},quantity:1}]};
test('Stripe frontend captures the selected document language at submission time',async()=>{
 const fs=require('fs'),vm=require('vm'),source=fs.readFileSync(require.resolve('../assets/js/app.js'),'utf8');
 const start=source.indexOf('async function startStripeCheckout('),end=source.indexOf('function placeOrder(',start);
 let sent;const context={URL,CONFIG:{stripeCheckoutURL:'https://worker.example/create-checkout-session'},document:{documentElement:{lang:'fr'}},resolveCountryCode:()=> 'FR',getAppliedCoupon:()=>null,window:{location:{assign(){}}},fetch:async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({checkoutUrl:'https://checkout.stripe.com/c/pay/test'})};}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 for(const lang of languages){context.document.documentElement.lang=lang;await context.startStripeCheckout({...input.customer,zip:'1000'},[{handle:'wig',opts:{opt1:'16'},qty:1}]);assert.equal(sent.language,lang);}
});
test('normalizes supported regional locales and safely defaults legacy/unknown language to Portuguese',()=>{
 for(const [raw,want]of [['EN-gb','en'],['fr_FR','fr'],['it','it'],[undefined,'pt'],['xx','pt'],['<img>','pt']])assert.equal(normalizeLanguage(raw),want);
 assert.throws(()=>normalizeCheckoutRequest({...input,language:{}},catalog,{}),/language/);
});
for(const language of languages){
 test(language+': checkout language persists in Stripe and Orange Money snapshots',()=>{
  const checkout=normalizeCheckoutRequest({...input,language},catalog,{});
  assert.equal(checkout.language,language);
  for(const method of ['stripe','orange_money'])assert.equal(snapshot(checkout,fixture.id,method).language,language);
 });
 test(language+': complete email, PDF and payment-state translations preserve user text',async()=>{
  const t=translator(language);assert.deepEqual(Object.keys(dictionaries[language]),Object.keys(dictionaries.pt));
  assert.ok(Object.values(dictionaries[language]).every(v=>typeof v==='string'&&v.length));
  for(const status of ['paid','awaiting_payment'])for(const fulfillmentMethod of ['delivery','pickup']){
   const order={...fixture,language,status,fulfillmentMethod,method:status==='paid'?'stripe':'orange_money',customer:{...fixture.customer,name:'Olá Subtotal <client>',notes:'Obrigada pela sua compra! Original client text.'}};
   const email=renderEmail(order);
   assert.ok(email.html.includes('lang="'+language+'"'));
   assert.ok(email.subject.includes(t(status==='paid'?'Pagamento confirmado':'A aguardar confirmação do pagamento')));
   assert.ok(email.html.includes(t('As suas escolhas')));
   assert.ok(email.html.includes('Olá Subtotal &lt;client&gt;'));
   assert.ok(email.text.includes(order.customer.notes));
   assert.ok(email.html.includes(t(fulfillmentMethod==='pickup'?'Ponto de recolha':'Morada de entrega')));
   if(status!=='paid')assert.ok(email.html.includes(t('O envio deste pedido não confirma o pagamento.')));
   const bytes=await makePdf(order),pdf=await PDFDocument.load(bytes);
   assert.ok(pdf.getPageCount()>=1);assert.ok(pdf.getTitle().includes(t('Encomenda')));
  }
 });
}
