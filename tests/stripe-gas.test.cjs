const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../backend/Code.gs'),'utf8');
function harness(properties={WORKER_GAS_SECRET:'worker-gas'}){
  const sheets=new Map();
  function sheetFor(name,header){
    if(!sheets.has(name)){
      const rows=[header.slice()];
      sheets.set(name,{
        rows,
        getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),
        appendRow:r=>rows.push(r.slice()),
        getLastRow:()=>rows.length,
        getRange:(row,col,height=1)=>({
          getValue:()=>rows[row-1]?.[col-1]??'',
          getValues:()=>Array.from({length:height},(_,i)=>[rows[row-1+i]?.[col-1]??'']),
          setValue:v=>{rows[row-1][col-1]=v;},
        }),
      });
    }
    return sheets.get(name);
  }
  const context={
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    MailApp:{sendEmail(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null})},
    Utilities:{Charset:{UTF_8:'UTF_8'},computeHmacSha256Signature:(body,key)=>Array.from(crypto.createHmac('sha256',key).update(body).digest()),formatDate:()=> '20261001-120000'},
    Session:{getScriptTimeZone:()=> 'Europe/Lisbon'},
    console:{error(){}},
    ContentService:{MimeType:{JSON:'JSON'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  context.getSheet_=sheetFor;
  const rows=sheetFor('Stripe Payments',context.stripePaymentsSheet_().getDataRange().getValues()[0]).rows;
  return {context,rows,sheets};
}
const pending={action:'stripe_pending',orderId:'123e4567-e89b-42d3-a456-426614174000',customer:{name:'A Buyer',email:'buyer@example.com',phone:'+351912345678',country:'PT',address:'Street 1',city:'Lisbon',postalCode:'1000'},itemsSummary:'2x Sample Wig',orderItems:[{title:'Sample Wig',qty:2,opts:{opt1:'20 inch'}}],expectedTotalCents:42998,subtotalCents:39998,shippingCents:3000,currency:'EUR'};
test('Apps Script authenticates the exact Worker payload with HMAC',()=>{const h=harness();const payload=JSON.stringify({action:'stripe_pending'});const signature=crypto.createHmac('sha256','worker-gas').update(payload).digest('hex');assert.deepEqual(JSON.parse(JSON.stringify(h.context.verifyWorkerPayload_({payload,signature}))),{action:'stripe_pending'});assert.equal(h.context.verifyWorkerPayload_({payload,signature:'0'.repeat(64)}),null);});
test('Apps Script rejects retired compatibility keys and accepts only the configured Worker key',()=>{const h=harness({WORKER_GAS_SECRET:'worker-gas',WORKER_GAS_SECRET_LIVE:'retired-synthetic'});const payload=JSON.stringify({action:'stripe_pending'});const signature=crypto.createHmac('sha256','worker-gas').update(payload).digest('hex');assert.deepEqual(JSON.parse(JSON.stringify(h.context.verifyWorkerPayload_({payload,signature}))),{action:'stripe_pending'});assert.equal(h.context.verifyWorkerPayload_({payload,signature:crypto.createHmac('sha256','retired-synthetic').update(payload).digest('hex')}),null);});
test('Apps Script uses the same single canonical HMAC encoding as the Worker',()=>{const h=harness({WORKER_GAS_SECRET:' "MiXeD Synthetic Key" '});const payload=JSON.stringify({action:'stripe_pending'});const signature=crypto.createHmac('sha256','mixedsynthetickey').update(payload).digest('hex');assert.ok(h.context.verifyWorkerPayload_({payload,signature}));assert.equal(h.context.verifyWorkerPayload_({payload,signature:crypto.createHmac('sha256',' "MiXeD Synthetic Key" ').update(payload).digest('hex')}),null);});
test('unsigned order requests cannot write ledger rows or send email',()=>{const h=harness();let writes=0,mails=0;h.context.getSheet_=()=>{writes++;throw new Error('unexpected write');};h.context.MailApp.sendEmail=()=>{mails++;};const result=h.context.doPost({postData:{contents:JSON.stringify({type:'order'})}});assert.equal(JSON.parse(result.text).ok,false);assert.equal(writes,0);assert.equal(mails,0);});
test('contact writes validate email and neutralize spreadsheet formulas',()=>{
  const h=harness();
  const result=h.context.doPost({postData:{contents:JSON.stringify({type:'contact',name:'=IMPORTDATA("https://example.invalid")',email:'buyer@example.com',phone:'+351 900',comment:'@SUM(1,1)'})}});
  assert.equal(JSON.parse(result.text).ok,true);
  const row=h.sheets.get('Messages').rows[1];
  assert.equal(row[1],"'=IMPORTDATA(\"https://example.invalid\")");
  assert.equal(row[4],"'@SUM(1,1)");
  let writes=0;h.context.getSheet_=()=>{writes++;throw new Error('unexpected write');};
  const invalid=h.context.doPost({postData:{contents:JSON.stringify({type:'contact',name:'Name',email:'not-an-email'})}});
  assert.equal(JSON.parse(invalid.text).ok,false);assert.equal(writes,0);
});
test('public handler errors do not expose exception details',()=>{
  const h=harness();h.context.getSheet_=()=>{throw new Error('synthetic private diagnostic');};
  const result=h.context.doPost({postData:{contents:JSON.stringify({type:'contact',name:'Name',email:'buyer@example.com'})}});
  assert.equal(result.text.includes('synthetic private diagnostic'),false);
  assert.equal(JSON.parse(result.text).error,'Request could not be processed');
});
test('unsupported signed actions cannot write ledger rows',()=>{const h=harness();let writes=0;h.context.getSheet_=()=>{writes++;throw new Error('unexpected write');};const payload=JSON.stringify({action:'unsupported'}),signature=crypto.createHmac('sha256','worker-gas').update(payload).digest('hex');const result=h.context.doPost({postData:{contents:JSON.stringify({payload,signature})}});assert.equal(JSON.parse(result.text).ok,false);assert.equal(writes,0);});
test('ledger selection fails closed for missing, inaccessible or mismatched destinations',()=>{
  const cases=[{}, {ASH_SS_ID:'synthetic-ledger'}, {ASH_SS_ID:'synthetic-ledger',ASH_SS_EXPECTED_NAME:'Synthetic Ledger'}];
  for(const properties of cases){
    const h=harness(properties);let fallbackCalls=0,propertyWrites=0;
    h.context.PropertiesService.getScriptProperties=()=>({getProperty:k=>properties[k],setProperty(){propertyWrites++;}});
    h.context.SpreadsheetApp={openById(){throw new Error('unavailable');},getActiveSpreadsheet(){fallbackCalls++;},create(){fallbackCalls++;}};
    assert.throws(()=>h.context.getSpreadsheet_());assert.equal(fallbackCalls,0);assert.equal(propertyWrites,0);
  }
  const h=harness({ASH_SS_ID:'synthetic-ledger',ASH_SS_EXPECTED_NAME:'Synthetic Ledger'});
  for(const [id,name] of [['synthetic-ledger','Wrong Ledger'],['wrong-ledger','Synthetic Ledger']]){
    h.context.SpreadsheetApp={openById:()=>({getId:()=>id,getName:()=>name})};assert.throws(()=>h.context.getSpreadsheet_());
  }
  const approved={getId:()=> 'synthetic-ledger',getName:()=> 'Synthetic Ledger'};
  h.context.SpreadsheetApp={openById:()=>approved};assert.equal(h.context.getSpreadsheet_(),approved);
});
test('trusted pending order is recorded before Stripe checkout is returned',()=>{const h=harness();const result=h.context.processStripeWorkerPayload_(pending);assert.equal(result.ok,true);assert.equal(h.rows.length,2);assert.equal(h.rows[1][2],'pending');assert.equal(h.rows[1][10],429.98);assert.match(h.rows[1][8],/Street 1/);});
test('paid checkout keeps the delivery address entered on the site',()=>{
  const h=harness();
  h.context.processStripeWorkerPayload_(pending);
  h.context.processStripeWorkerPayload_({action:'stripe_session_created',orderId:pending.orderId,sessionId:'cs_test_website_address'});
  const result=h.context.processStripeWorkerPayload_({action:'stripe_event',eventId:'evt_website_address',eventType:'checkout.session.completed',session:{
    id:'cs_test_website_address',client_reference_id:pending.orderId,amount_total:42998,currency:'eur',payment_status:'paid',payment_intent:'pi_test_website_address',
    metadata:{order_id:pending.orderId,expected_total_cents:'42998',items_summary:'2x Sample Wig'},customer_details:{email:'buyer@example.com'}
  }});
  assert.equal(result.status,'paid');
  assert.equal(h.rows[1][7],'A Buyer');
  assert.equal(h.rows[1][8],'Street 1, Lisbon, 1000, PT');
  assert.equal(h.rows[1][6],"'+351912345678");
});
test('Stripe session ID is attached to the matching pending order',()=>{const h=harness();h.context.processStripeWorkerPayload_(pending);const r=h.context.processStripeWorkerPayload_({action:'stripe_session_created',orderId:pending.orderId,sessionId:'cs_test_123'});assert.equal(r.ok,true);assert.equal(h.rows[1][3],'cs_test_123');});
test('only a matching signed paid session creates one Orders row',()=>{const h=harness();h.context.processStripeWorkerPayload_(pending);h.context.processStripeWorkerPayload_({action:'stripe_session_created',orderId:pending.orderId,sessionId:'cs_test_123'});const event={action:'stripe_event',eventId:'evt_123',eventType:'checkout.session.completed',session:{id:'cs_test_123',client_reference_id:pending.orderId,amount_total:42998,currency:'eur',payment_status:'paid',payment_intent:'pi_test',metadata:{order_id:pending.orderId,expected_total_cents:'42998',items_summary:'2x Sample Wig'},customer_details:{email:'buyer@example.com',phone:'+351912345678'},shipping_details:{name:'A Buyer',address:{line1:'Street 1',city:'Lisbon',postal_code:'1000',country:'PT'}}}};const result=h.context.processStripeWorkerPayload_(event);assert.equal(result.status,'paid');assert.equal(h.rows.length,2);assert.equal(h.rows[1][2],'paid');assert.equal(h.rows[1][4],'pi_test');const orders=h.sheets.get('Orders').rows;assert.equal(orders.length,2);assert.equal(orders[1][5],'stripe');assert.equal(orders[1][9],429.98);assert.equal(orders[1][13],pending.orderId);assert.equal(h.context.processStripeWorkerPayload_(event).duplicate,true);assert.equal(orders.length,2);});
test('mismatched Stripe amount is rejected and order remains pending',()=>{const h=harness();h.context.processStripeWorkerPayload_(pending);h.context.processStripeWorkerPayload_({action:'stripe_session_created',orderId:pending.orderId,sessionId:'cs_test_123'});const result=h.context.processStripeWorkerPayload_({action:'stripe_event',eventId:'evt_bad',eventType:'checkout.session.completed',session:{id:'cs_test_123',client_reference_id:pending.orderId,amount_total:1,currency:'eur',payment_status:'paid',metadata:{order_id:pending.orderId,expected_total_cents:'42998'}}});assert.equal(result.ok,false);assert.equal(h.rows[1][2],'pending');});
test('paid ambassador order keeps the €7 discount in Orders',()=>{
  const h=harness();
  const discounted={...pending,orderId:'123e4567-e89b-42d3-a456-426614174001',itemsSummary:'Ambassador coupon: ONIKA10 | 2x Sample Wig',couponCode:'ONIKA10',expectedTotalCents:42298};
  assert.equal(h.context.processStripeWorkerPayload_(discounted).ok,true);
  h.context.processStripeWorkerPayload_({action:'stripe_session_created',orderId:discounted.orderId,sessionId:'cs_test_coupon'});
  const result=h.context.processStripeWorkerPayload_({action:'stripe_event',eventId:'evt_coupon',eventType:'checkout.session.completed',session:{id:'cs_test_coupon',client_reference_id:discounted.orderId,amount_total:42298,currency:'eur',payment_status:'paid',metadata:{order_id:discounted.orderId,expected_total_cents:'42298'},customer_details:{email:'buyer@example.com'}}});
  assert.equal(result.status,'paid');
  const order=h.sheets.get('Orders').rows[1];
  assert.match(order[6],/Ambassador coupon: ONIKA10/);
  assert.equal(order[9],422.98);
});
