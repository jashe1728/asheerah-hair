const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/app.js'), 'utf8');
function functionBlock(name, endMarker) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} exists`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end marker for ${name} exists`);
  return source.slice(start, end);
}
function decodeAttr(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function parseButtons(html) {
  const buttons = [];
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = {};
    for (const attr of match[1].matchAll(/([^\s=]+)="([^"]*)"/g)) attrs[attr[1]] = decodeAttr(attr[2]);
    const listeners = {};
    const button = {
      attrs,
      dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])),
      addEventListener: (event, cb) => { listeners[event] = cb; },
      click: () => listeners.click?.({ currentTarget: button, target: button }),
    };
    buttons.push(button);
  }
  return buttons;
}

const item = {
  key: 'deep-wave-wig|{"opt1":"6x6 HD","opt2":"10 inch"}',
  handle: 'deep-wave-wig', title: 'Deep Wave Wig', image: 'wig.jpg', category: 'wigs',
  optionNames: ['Lace', 'Length'], opts: { opt1: '6x6 HD', opt2: '10 inch' }, qty: 1,
  priceEur: 186.99, compareEur: 251.99,
};

test('cart quantity controls safely preserve variant keys containing JSON quotes', () => {
  const element = {
    html: '', buttons: [],
    set innerHTML(value) { this.html = value; this.buttons = parseButtons(value); },
    get innerHTML() { return this.html; },
    querySelectorAll(selector) { return this.buttons.filter(b => selector === 'button[data-cart-qty]' ? 'cartQty' in b.dataset : selector === 'button[data-cart-remove]' ? 'cartRemove' in b.dataset : false); },
  };
  const changes = [];
  const context = {
    document: { getElementById: id => id === 'cartItems' ? element : null },
    getCart: () => [structuredClone(item)], curCode: () => 'EUR',
    itemOriginalEur: i => i.compareEur, priceHTML: () => '€186.99', money: n => `€${n}`,
    itemMetaHTML: () => '', catKey: () => '', uiTxt: key => key,
    escapeHTML: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]),
    changeQty: (key, delta) => changes.push([key, delta]),
  };
  vm.runInNewContext(functionBlock('renderCartDrawer', '// ---------- Nav'), context);
  context.renderCartDrawer();

  assert.equal(element.html.includes('onclick='), false, 'cart controls must not embed an unsafe inline handler');
  const buttons = element.buttons;
  const minus = buttons.find(b => b.dataset.cartQty === '-1');
  const plus = buttons.find(b => b.dataset.cartQty === '1');
  assert.ok(minus, 'minus control is rendered');
  assert.ok(plus, 'plus control is rendered');
  minus.click();
  plus.click();
  assert.deepEqual(changes, [[item.key, -1], [item.key, 1]]);
});

test('cart quantity changes rerender the cart page totals', () => {
  const calls = { cart: 0, checkout: 0, drawer: 0 };
  const context = {
    document: {
      body: { dataset: { page: 'cart' } },
      querySelectorAll: () => [],
    },
    renderCartPage: () => calls.cart++,
    renderCheckoutPage: () => calls.checkout++,
    renderCartDrawer: () => calls.drawer++,
  };
  vm.runInNewContext(functionBlock('updateCartUI', 'function optionLabel'), context);
  context.updateCartUI();
  assert.deepEqual(calls, { cart: 1, checkout: 0, drawer: 0 });
});

test('fixed coupon stacks with the product sale discount and contributes to checkout total', () => {
  const context = {
    getCart: () => [{ priceEur: 100, compareEur: 150, qty: 1 }],
    itemOriginalEur: item => item.compareEur > item.priceEur ? item.compareEur : item.priceEur,
    round2: value => Math.round((value + Number.EPSILON) * 100) / 100,
    CONFIG: { shipping: 0, taxRate: 0 },
  };
  vm.runInNewContext(functionBlock('cartTotals', 'function addToCart'), context);
  const totals = context.cartTotals({ type: 'fixed', value: 7 });
  assert.equal(totals.itemDiscount, 50);
  assert.equal(totals.couponDiscount, 7);
  assert.equal(totals.totalDiscount, 57);
  assert.equal(totals.totalFinal, 93);
});

test('cart displays the fourth wig option (cap size)', () => {
  const context = { escapeHTML: value => String(value), optionDisplayLabel: value => value };
  vm.runInNewContext(functionBlock('itemMetaHTML', 'function escapeHTML'), context);
  const html = context.itemMetaHTML({
    optionNames: ['Hair Length','Lace','Hair Density','Cap Size'],
    opts: { opt1:'16', opt2:'5x5 HD', opt3:'180%', opt4:'MEDIUM' },
  });
  assert.match(html, /Cap Size:<\/b> MEDIUM/);
});
