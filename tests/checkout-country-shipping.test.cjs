const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/app.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/i18n.js'), 'utf8');

function extractCheckoutHelpers() {
  const start = appSource.indexOf('// ---------- Checkout ----------');
  const end = appSource.indexOf('function renderCheckoutPage()');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const cartTotalsStart = appSource.indexOf('function itemOriginalEur(');
  const cartTotalsEnd = appSource.indexOf('function stripeWorkerURL(');
  return appSource.slice(cartTotalsStart, cartTotalsEnd) + '\n' + appSource.slice(start, end) + '\nthis.EU_COUNTRY_CODES = EU_COUNTRY_CODES;\n';
}

test('checkout country shipping helpers classify all 27 EU countries at €5.99 and non-EU countries at €20', () => {
  const storage = new Map();
  const context = {
    LANG: 'en',
    Intl,
    CONFIG: { shipping: null, taxRate: 0 },
    getCart: () => [{ priceEur: 186.99, compareEur: 251.99, qty: 1 }],
    round2: x => Math.round((Number(x) || 0) * 100) / 100,
    sessionStorage: {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
    localStorage: {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
  };
  vm.runInNewContext(extractCheckoutHelpers(), context);

  // Verify EU countries (Portugal, France, Germany + all 27 EU members)
  assert.equal(context.EU_COUNTRY_CODES.length, 27);
  for (const input of ['PT', 'Portugal', 'FR', 'France', 'DE', 'Germany', 'Deutschland', ...context.EU_COUNTRY_CODES]) {
    const rate = context.shippingRateForCountry(input);
    assert.ok(rate, `Expected rate for ${input}`);
    assert.equal(rate.region, 'EU');
    assert.equal(rate.shippingCents, 599);
    const totals = context.cartTotals(null, rate.shippingCents / 100);
    assert.equal(totals.shipping, 5.99);
    assert.equal(totals.totalFinal, 192.98);
  }

  // Verify non-EU countries (UK, Switzerland, Norway, US, Mozambique)
  for (const [code, name] of [['GB', 'United Kingdom'], ['GB', 'UK'], ['CH', 'Switzerland'], ['NO', 'Norway'], ['US', 'United States'], ['MZ', 'Mozambique']]) {
    for (const input of [code, name]) {
      const rate = context.shippingRateForCountry(input);
      assert.ok(rate, `Expected rate for ${input}`);
      assert.equal(rate.countryCode, code);
      assert.equal(rate.region, 'INTL');
      assert.equal(rate.shippingCents, 2000);
      const totals = context.cartTotals(null, rate.shippingCents / 100);
      assert.equal(totals.shipping, 20);
      assert.equal(totals.totalFinal, 206.99);
    }
  }

  // Verify discounts apply to merchandise only, never shipping
  const ptTotalsWithCoupon = context.cartTotals({ type: 'fixed', value: 7 }, 5.99);
  assert.equal(ptTotalsWithCoupon.subtotalOriginal, 251.99);
  assert.equal(ptTotalsWithCoupon.itemDiscount, 65);
  assert.equal(ptTotalsWithCoupon.couponDiscount, 7);
  assert.equal(ptTotalsWithCoupon.totalDiscount, 72);
  assert.equal(ptTotalsWithCoupon.subtotalFinal, 179.99);
  assert.equal(ptTotalsWithCoupon.shipping, 5.99);
  assert.equal(ptTotalsWithCoupon.totalFinal, 185.98);

  const usTotalsWithCoupon = context.cartTotals({ type: 'fixed', value: 7 }, 20);
  assert.equal(usTotalsWithCoupon.subtotalFinal, 179.99);
  assert.equal(usTotalsWithCoupon.shipping, 20);
  assert.equal(usTotalsWithCoupon.totalFinal, 199.99);

  // Verify draft persistence preserves country and customer details
  context.saveCheckoutDraft({ first: 'Ana', last: 'Silva', email: 'ana@example.com', country: 'PT' });
  const loaded = context.loadCheckoutDraft();
  assert.equal(loaded.first, 'Ana');
  assert.equal(loaded.country, 'PT');
});

test('checkout template renders searchable country combobox, merchandise subtotal, and select-country prompt', () => {
  assert.match(appSource, /id="coCountrySearch"[^>]*role="combobox"/);
  assert.match(appSource, /id="coCountryList"[^>]*role="listbox"/);
  assert.match(appSource, /id="coCountry"\s+name="country"\s+type="hidden"/);
  assert.match(appSource, /id="coMerchandiseSubtotal"/);
  assert.match(appSource, /shipping_select_country/);
  assert.match(i18nSource, /Select your country to calculate shipping\./);
});
