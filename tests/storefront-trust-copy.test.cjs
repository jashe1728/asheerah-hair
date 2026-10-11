const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const htmlPages = [
  ...fs.readdirSync(root).filter(file => file.endsWith('.html')),
  ...fs.readdirSync(path.join(root, 'pages')).filter(file => file.endsWith('.html')).map(file => `pages/${file}`),
];

test('every storefront page footer links directly to Privacy and Terms with valid relative paths', () => {
  for (const page of htmlPages) {
    const html = read(page);
    const footer = html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1];
    assert.ok(footer, `${page}: footer exists`);
    for (const [key, expected] of [['legal_privacy', 'pages/privacy.html'], ['legal_terms', 'pages/terms.html']]) {
      const href = footer.match(new RegExp(`<a href="([^"]+)" data-i18n="${key}"`))?.[1];
      assert.ok(href, `${page}: ${key} footer link exists`);
      assert.equal(path.relative(root, path.resolve(path.dirname(path.join(root, page)), href)).replaceAll('\\', '/'), expected, `${page}: ${key} points to the canonical page`);
      assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(root, page)), href)), `${page}: ${key} target exists`);
    }
  }
});

test('checkout renders only configured methods and describes Stripe payment verification accurately', () => {
  const config = read('config.js');
  const app = read('assets/js/app.js');
  const i18n = read('assets/js/i18n.js');
  assert.match(config, /stripe:\s*\{\s*configured:\s*true/);
  assert.match(config, /paypal:\s*\{\s*configured:\s*false/);
  assert.match(config, /mbway:\s*\{\s*configured:\s*false/);
  assert.match(app, /\['stripe','paypal','mbway'\]\.filter\(m=>CONFIG\.payment && CONFIG\.payment\[m\] && CONFIG\.payment\[m\]\.configured\)/);
  assert.match(i18n, /payment_choose:\s*\{[^\n]*Stripe Checkout[^\n]*Stripe verifies the payment/);
  assert.match(i18n, /foot_payments:\s*\{[^\n]*Stripe/);
  assert.doesNotMatch(i18n.match(/foot_payments:\s*\{[^\n]*/)?.[0] || '', /PayPal|MB Way/);
});

test('damage-report copy is neutral and consistent pending a confirmed policy', () => {
  const faq = read('faq.html');
  const shipping = read('pages/shipping.html');
  const returns = read('pages/returns.html');
  const i18n = read('assets/js/i18n.js');
  for (const [name, source] of Object.entries({ faq, shipping, returns })) {
    assert.match(source, /as soon as possible/i, `${name}: neutral prompt exists`);
    assert.match(source, /statutory rights/i, `${name}: rights are not waived`);
    assert.doesNotMatch(source, /within 48 hours|within 7 days|48 hours of (delivery|receiving)|7 days of delivery|nas 48 horas|no prazo de 7 dias/i, `${name}: no unsupported deadline`);
  }
  assert.doesNotMatch(i18n, /within 48 hours|within 7 days|nas 48 horas|no prazo de 7 dias/i);
});

test('cart and checkout disclose destination-dependent totals and separately imposed import charges', () => {
  const app = read('assets/js/app.js');
  const i18n = read('assets/js/i18n.js');
  const shipping = read('pages/shipping.html');
  assert.equal((app.match(/uiTxt\('checkout_disclosure'\)/g) || []).length, 2);
  assert.match(i18n, /checkout_disclosure:\s*\{[^\n]*Product prices include taxes[^\n]*import charges[^\n]*separately/);
  assert.match(app, /const taxes = round2\(subtotalFinal \* \(CONFIG\.taxRate \|\| 0\)\)/);
  assert.match(shipping, /may impose customs duties or import charges[^<]*may be collected separately/i);
  assert.doesNotMatch(shipping, /VAT[^<]*sole responsibility|IVA[^<]*responsabilidade exclusiva/i);
});

test('contact fields have associated visible labels and WhatsApp handoff does not claim auto-send', () => {
  const contact = read('pages/contact.html');
  const app = read('assets/js/app.js');
  const labels = [...contact.matchAll(/<label[^>]*for="([^"]+)"/g)].map(match => match[1]);
  for (const id of ['contactName', 'contactEmail', 'contactPhone', 'contactComment']) {
    assert.ok(labels.includes(id), `${id}: associated label exists`);
    assert.match(contact, new RegExp(`<input[^>]*id="${id}"|<textarea[^>]*id="${id}"`), `${id}: labelled control exists`);
  }
  assert.match(contact, /uiTxt\('whatsapp_handoff'\)/);
  assert.match(contact, /id="formMsg" role="status" aria-live="polite"/);
  assert.match(app, /btn\.setAttribute\('aria-expanded', open\?'true':'false'\)/);
  assert.match(app, /btn\.setAttribute\('aria-expanded','false'\)/);
});

test('runtime chatbot payment answer is localized and consistent with Stripe-only checkout', () => {
  const chatbot = read('assets/js/chatbot.js');
  const kb = JSON.parse(read('assets/data/chatbot-kb.json'));
  const locales = JSON.parse(read('assets/data/chatbot-locales.json'));
  assert.match(chatbot, /const CHAT_PAYMENT_ANSWERS\s*=\s*\{/);
  for (const lang of ['en','pt','es','de','fr','it']) assert.match(chatbot, new RegExp(`${lang}:[^\\n]*Stripe Checkout`));
  assert.match(chatbot, /if\(entry\.id==='PAY07'\)return CHAT_PAYMENT_ANSWERS\[chatLang\(\)\]/);
  for (const lang of ['pt','es','de','fr','it']) {
    assert.match(locales[lang].entries.PAY07.answer, /Stripe Checkout/);
    assert.doesNotMatch(locales[lang].entries.PAY07.answer, /PayPal|MB ?WAY|finalis|finaliz/i);
  }
  const whatsappOrderAnswer = kb.entries.find(entry => entry.id === 'O20').answer;
  assert.match(whatsappOrderAnswer, /confirm availability and the full EUR total/i);
  assert.doesNotMatch(whatsappOrderAnswer, /payment details|payment method|charged/i);
});

test('shipping and localized chatbot avoid making unverified VAT liability claims', () => {
  const kb = JSON.parse(read('assets/data/chatbot-kb.json'));
  const locales = JSON.parse(read('assets/data/chatbot-locales.json'));
  assert.match(kb.entries.find(entry => entry.id === 'S12').answer, /may impose customs duties or import charges/i);
  assert.doesNotMatch(kb.entries.find(entry => entry.id === 'S12').answer, /VAT|responsibility|customer is responsible/i);
  for (const lang of ['pt','es','de','fr','it']) {
    const answer = locales[lang].entries.S12.answer;
    assert.match(answer, /aduaneir|import|arancel|Zoll|douane/i);
    assert.doesNotMatch(answer, /responsabilidade exclusiva|a cargo del cliente|trägt der Kunde|à la charge du client|a carico del cliente|IVA|TVA|Mehrwertsteuer/i);
  }
});
