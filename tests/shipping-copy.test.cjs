const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const i18n = fs.readFileSync(path.join(__dirname, '../assets/js/i18n.js'), 'utf8');
const shipping = fs.readFileSync(path.join(__dirname, '../pages/shipping.html'), 'utf8');

test('shipping page has the supplied regional estimates and €7.99 Europe / €20 international shipping rules translated in all six languages', () => {
  const c = { document: { addEventListener() {} }, localStorage: { getItem() { return null; } }, navigator: { language: 'en' }, window: {} };
  vm.runInNewContext(i18n, c);

  const requiredKeys = [
    'shipping_europe',
    'shipping_africa',
    'shipping_americas',
    'shipping_countries',
    'shipping_fee_policy',
    'shipping_select_country',
    'country_search_ph',
    'fulfillment_method',
    'delivery_home_pt',
    'delivery_pickup_pt',
    'pickup_location_label',
    'pickup_address',
    'free'
  ];

  for (const key of requiredKeys) {
    for (const lang of c.LANGS) {
      assert.ok(c.I18N[key]?.[lang], `${key} missing translation for ${lang}`);
    }
  }

  for (const key of ['shipping_europe', 'shipping_africa', 'shipping_americas', 'shipping_countries', 'shipping_fee_policy']) {
    assert.match(shipping, new RegExp(`data-i18n="${key}"`));
  }

  assert.match(c.I18N.shipping_fee_policy.en, /€7\.99.*€20/i);
  assert.match(c.I18N.shipping_fee_policy.pt, /7,99 €.*20 €/i);
  assert.match(shipping, /€7\.99/);
  assert.equal(c.I18N.shipping_select_country.en, 'Select your country to calculate shipping.');
  assert.match(c.I18N.shipping_europe.en, /6–10 business days/i);
  assert.match(c.I18N.shipping_africa.en, /7–15 days/i);
  assert.match(c.I18N.shipping_americas.en, /3–7 days/i);
});
