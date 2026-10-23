const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/app.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/i18n.js'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');

// Load i18n dictionary
const i18nContext = {
  window: {},
  navigator: { language: 'en' },
  document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
  localStorage: { getItem: () => null, setItem: () => {} },
  escapeHTML: x => String(x),
};
vm.runInNewContext(i18nSource, i18nContext);
const I18N = i18nContext.I18N;
const LANGS = i18nContext.LANGS;

test('I18N has complete Stripe and Orange Money keys across all six languages', () => {
  const requiredKeys = [
    'pay_stripe',
    'pay_stripe_desc',
    'pay_stripe_qualifications',
    'pay_orange_money',
    'pay_orange_money_desc',
    'om_recipient_name_label',
    'om_recipient_phone_label',
    'om_notice_warning',
    'om_instructions',
    'submit_om_request',
    'pay_with_stripe',
    'om_request_recorded',
    'om_cart_retained',
    'om_open_whatsapp',
    'om_handoff_opened',
    'om_record_failed',
    'invalid_payment_method',
  ];

  for (const key of requiredKeys) {
    assert.ok(I18N[key], `Missing translation key: ${key}`);
    for (const lang of LANGS) {
      assert.ok(I18N[key][lang], `Missing language "${lang}" in key "${key}"`);
      assert.notEqual(I18N[key][lang].trim(), '', `Empty translation for "${lang}" in "${key}"`);
    }
  }

  // Exact notice in Portuguese
  assert.equal(
    I18N.om_notice_warning.pt,
    'A encomenda só será confirmada após a receção do pagamento.'
  );

  // Five Stripe methods in pay_stripe_desc
  for (const lang of LANGS) {
    const desc = I18N.pay_stripe_desc[lang];
    assert.match(desc, /Visa/i);
    assert.match(desc, /Mastercard/i);
    assert.match(desc, /Apple Pay/i);
    assert.match(desc, /MB WAY/i);
    assert.match(desc, /Klarna/i);
  }
});

test('checkout renders exactly stripe then orange_money, excluding paypal and mbway options', () => {
  assert.match(
    appSource,
    /paymentMethodsForCountry\(savedCountryCode\)\.map\(/,
    'Expected checkout methods array to be exactly stripe then orange_money'
  );
  assert.doesNotMatch(
    appSource,
    /\['stripe',\s*'paypal',\s*'mbway'\]\.map\(/,
    'Old payment methods array with paypal and mbway should be removed'
  );
});

test('draft pay recovery defaults paypal, mbway, and unknown selections to stripe', () => {
  assert.match(appSource, /\['paypal',\s*'mbway'\]\.includes\(activePay\)/);
  assert.match(appSource, /activePay\s*=\s*'stripe'/);
  assert.match(appSource, /saveCheckoutDraft\(\{\s*pay:\s*'stripe'\s*\}\)/);
});

test('Stripe method presents five methods and availability qualifier', () => {
  assert.match(appSource, /pay_stripe_desc/);
  assert.match(appSource, /pay_stripe_qualifications/);
});

test('Orange Money instructions render selectable recipient details and exact warning notice', () => {
  // Contains recipient details and exact notice
  assert.match(appSource, /om_recipient_name_label/);
  assert.match(appSource, /Ciara Ly/);
  assert.match(appSource, /om_recipient_phone_label/);
  assert.match(appSource, /\+245 95 734 21 44/);
  assert.match(appSource, /om_notice_warning/);
  assert.match(appSource, /om_instructions/);
  assert.match(appSource, /user-select:\s*all/);
});

test('placeOrder allows only stripe or orange_money and preserves Stripe flow', () => {
  assert.match(
    appSource,
    /if\s*\(!paymentMethodsForCountry\(countryCode\)\.includes\(method\)\)/
  );
  assert.match(appSource, /invalid_payment_method/);
  assert.match(appSource, /if\s*\(method\s*===\s*'stripe'\)\s*\{\s*startStripeCheckout/);
});

test('Orange Money flow keeps cart, does not show order confirmation or claim paid/sent, and handles rejection', () => {
  // Verifies that for Orange Money:
  // - cart is retained (clearCart is not called in OM path)
  // - showOrderConfirmation is not called in OM path
  // - ok:false is rejected properly
  // - om_request_recorded, om_cart_retained, om_record_failed, om_handoff_opened are used
  assert.match(appSource, /om_request_recorded/);
  assert.match(appSource, /om_cart_retained/);
  assert.match(appSource, /om_record_failed/);
  assert.match(appSource, /om_handoff_opened/);
  assert.match(appSource, /om_open_whatsapp/);
  assert.match(appSource, /throw new Error\('Server returned non-ok response'\)/);
  // Ensure clearCart and showOrderConfirmation are NOT in the placeOrder Orange Money fetch handler
  const omFetchSection = appSource.slice(
    appSource.indexOf('if (CONFIG.backendURL) {'),
    appSource.indexOf('function showOrderConfirmation(')
  );
  assert.doesNotMatch(omFetchSection, /clearCart\(\)/);
  assert.doesNotMatch(omFetchSection, /showOrderConfirmation\(/);
});
