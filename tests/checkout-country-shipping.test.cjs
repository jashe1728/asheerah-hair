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
  return appSource.slice(cartTotalsStart, cartTotalsEnd) + '\n' + appSource.slice(start, end) + '\nthis.EU_COUNTRY_CODES = EU_COUNTRY_CODES;\nthis.EUROPE_COUNTRY_CODES = EUROPE_COUNTRY_CODES;\nthis.PICKUP_LOCATION = PICKUP_LOCATION;\n';
}

test('checkout shipping helpers classify explicit Europe list at €7.99 and rest at €20, with PT delivery/pickup options', () => {
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

  // Explicit Europe list: EU27 + 26 European countries/territories = 53 total
  const expectedEurope = [
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    'AD','AL','BA','BY','CH','GB','GI','GG','IM','IS','JE','LI','MC','MD','ME','MK','NO','RS','RU','SM','UA','VA','XK','AX','FO','SJ'
  ];
  assert.equal(context.EUROPE_COUNTRY_CODES.length, 53);
  for (const code of expectedEurope) {
    assert.ok(context.EUROPE_COUNTRY_CODES.includes(code), `Expected ${code} in Europe list`);
  }

  // TR, AM, AZ, GE, KZ must NOT be in Europe list
  for (const nonEuropeCode of ['TR', 'AM', 'AZ', 'GE', 'KZ']) {
    assert.equal(context.EUROPE_COUNTRY_CODES.includes(nonEuropeCode), false, `${nonEuropeCode} must NOT be in Europe list`);
    const rate = context.shippingRateForCountry(nonEuropeCode);
    assert.equal(rate.region, 'INTL');
    assert.equal(rate.shippingCents, 2000);
  }

  // Verify European countries at €7.99 for home delivery
  for (const input of ['PT', 'Portugal', 'FR', 'France', 'DE', 'Germany', 'GB', 'United Kingdom', 'CH', 'Switzerland', 'NO', 'Norway']) {
    const rate = context.shippingRateForCountry(input, 'delivery');
    assert.ok(rate, `Expected rate for ${input}`);
    assert.equal(rate.region, 'EU');
    assert.equal(rate.shippingCents, 799);
    const totals = context.cartTotals(null, rate.shippingCents / 100);
    assert.equal(totals.shipping, 7.99);
    assert.equal(totals.totalFinal, 194.98);
  }

  // Verify Portugal pickup option is €0.00
  const ptPickupRate = context.shippingRateForCountry('PT', 'pickup');
  assert.equal(ptPickupRate.countryCode, 'PT');
  assert.equal(ptPickupRate.fulfillmentMethod, 'pickup');
  assert.equal(ptPickupRate.shippingCents, 0);
  const ptPickupTotals = context.cartTotals(null, ptPickupRate.shippingCents / 100);
  assert.equal(ptPickupTotals.shipping, 0);
  assert.equal(ptPickupTotals.totalFinal, 186.99);

  // Verify non-PT countries cannot get free pickup
  for (const nonPT of ['ES', 'FR', 'DE', 'GB', 'US', 'MZ']) {
    const attemptedPickupRate = context.shippingRateForCountry(nonPT, 'pickup');
    assert.equal(attemptedPickupRate.fulfillmentMethod, 'delivery');
    assert.notEqual(attemptedPickupRate.shippingCents, 0);
  }

  // Verify non-Europe countries at €20
  for (const [code, name] of [['US', 'United States'], ['MZ', 'Mozambique'], ['BR', 'Brazil'], ['ZA', 'South Africa'], ['CA', 'Canada']]) {
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
  const ptTotalsWithCoupon = context.cartTotals({ type: 'fixed', value: 7 }, 7.99);
  assert.equal(ptTotalsWithCoupon.subtotalOriginal, 251.99);
  assert.equal(ptTotalsWithCoupon.itemDiscount, 65);
  assert.equal(ptTotalsWithCoupon.couponDiscount, 7);
  assert.equal(ptTotalsWithCoupon.totalDiscount, 72);
  assert.equal(ptTotalsWithCoupon.subtotalFinal, 179.99);
  assert.equal(ptTotalsWithCoupon.shipping, 7.99);
  assert.equal(ptTotalsWithCoupon.totalFinal, 187.98);

  const ptPickupWithCoupon = context.cartTotals({ type: 'fixed', value: 15 }, 0);
  assert.equal(ptPickupWithCoupon.couponDiscount, 15);
  assert.equal(ptPickupWithCoupon.subtotalFinal, 171.99);
  assert.equal(ptPickupWithCoupon.shipping, 0);
  assert.equal(ptPickupWithCoupon.totalFinal, 171.99);

  // Verify draft persistence preserves country and customer details
  context.saveCheckoutDraft({ first: 'Ana', last: 'Silva', email: 'ana@example.com', country: 'PT', fulfillmentMethod: 'pickup' });
  const loaded = context.loadCheckoutDraft();
  assert.equal(loaded.first, 'Ana');
  assert.equal(loaded.country, 'PT');
  assert.equal(loaded.fulfillmentMethod, 'pickup');
});

test('checkout template renders searchable country combobox, PT fulfillment options, and updated coupon placeholder', () => {
  assert.match(appSource, /id="coCountrySearch"[^>]*role="combobox"/);
  assert.match(appSource, /id="coCountryList"[^>]*role="listbox"/);
  assert.match(appSource, /id="coCountry"\s+name="country"\s+type="hidden"/);
  assert.match(appSource, /id="coMerchandiseSubtotal"/);
  assert.match(appSource, /shipping_select_country/);
  assert.match(i18nSource, /Select your country to calculate shipping\./);

  // PT fulfillment radio group and pickup location card
  assert.match(appSource, /id="coFulfillmentGroup"[^>]*role="radiogroup"/);
  assert.match(appSource, /name="fulfillmentMethod"\s+value="delivery"/);
  assert.match(appSource, /name="fulfillmentMethod"\s+value="pickup"/);
  assert.match(appSource, /id="coPickupLocationCard"/);
  assert.match(appSource, /Midana Beauty/);
  assert.match(appSource, /Centro Comercial da Amadora/);
  assert.match(appSource, /Rua Elias Garcia, n\.º 229/);
  assert.match(appSource, /2700-319 Amadora/);
  assert.match(appSource, /1\.º andar, Loja E/);

  // Coupon placeholder updated to EXEMPLO01
  assert.match(appSource, /placeholder="EXEMPLO01"/);
});
