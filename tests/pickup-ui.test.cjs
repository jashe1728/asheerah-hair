const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/app.js'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/i18n.js'), 'utf8');

function setupEnvironment() {
  const storage = new Map();
  const win = {};
  win.window = win;
  const context = {
    window: win,
    document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
    navigator: { language: 'pt-PT' },
    Intl,
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
  vm.runInNewContext(configSource, context);
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(appSource, context);

  // Expose on context root for convenient testing
  Object.assign(context, win);
  context.CONFIG = win.CONFIG;
  return { context, storage };
}

test('coupon validation enforces 9 active codes, removes old codes, and purges stale localStorage coupon', () => {
  const { context, storage } = setupEnvironment();

  // 1. Verify 9 active codes in CONFIG.coupons
  const coupons = context.CONFIG.coupons;
  const expectedCodes = ['ONIKA01', 'LILIAN01', 'TUCHA01', 'CASSIE01', 'MIDANABT', 'ONIKAAH', 'LILIANAH', 'TUCHAAH', 'CASSIEAH'];
  assert.equal(Object.keys(coupons).length, 9);
  assert.deepEqual(Object.keys(coupons).sort(), expectedCodes.sort());

  // Old codes removed
  for (const old of ['ONIKA10', 'LILIAN10', 'TUCHA10', 'CASSIE10']) {
    assert.equal(coupons[old], undefined);
  }

  // 2. Validate stale coupon removal from localStorage
  storage.set('ash_coupon', JSON.stringify({ code: 'ONIKA10', type: 'fixed', value: 7 }));
  assert.equal(context.getAppliedCoupon(), null, 'Stale code ONIKA10 must return null');
  assert.equal(context.localStorage.getItem('ash_coupon'), null, 'Stale code ONIKA10 must be purged from storage');

  // 3. Validate valid code in localStorage
  storage.set('ash_coupon', JSON.stringify({ code: 'MIDANABT', type: 'fixed', value: 7 }));
  const applied = context.getAppliedCoupon();
  assert.ok(applied);
  assert.equal(applied.code, 'MIDANABT');
  assert.equal(applied.value, 7);

  // 4. Validate €15 personal code
  storage.set('ash_coupon', JSON.stringify({ code: 'ONIKAAH', type: 'fixed', value: 15 }));
  const appliedAH = context.getAppliedCoupon();
  assert.ok(appliedAH);
  assert.equal(appliedAH.code, 'ONIKAAH');
  assert.equal(appliedAH.value, 15);
});

test('PT delivery/pickup transitions and rates consistency', () => {
  const { context } = setupEnvironment();

  // Home delivery rate for Portugal: 7.99 €
  const ptDelivery = context.shippingRateForCountry('PT', 'delivery');
  assert.equal(ptDelivery.countryCode, 'PT');
  assert.equal(ptDelivery.region, 'EU');
  assert.equal(ptDelivery.fulfillmentMethod, 'delivery');
  assert.equal(ptDelivery.shippingCents, 799);

  // Pickup rate for Portugal: Grátis (0 €)
  const ptPickup = context.shippingRateForCountry('PT', 'pickup');
  assert.equal(ptPickup.countryCode, 'PT');
  assert.equal(ptPickup.fulfillmentMethod, 'pickup');
  assert.equal(ptPickup.shippingCents, 0);

  // Exact fixed location address
  assert.equal(
    context.PICKUP_LOCATION.fullAddress,
    'Midana Beauty, Centro Comercial da Amadora; Rua Elias Garcia, n.º 229, 2700-319 Amadora, Portugal; 1.º andar, Loja E'
  );
});

test('no non-PT free pickup permitted; non-PT countries fall back to delivery rates', () => {
  const { context } = setupEnvironment();

  // European countries outside PT: Europe rate €7.99, cannot use pickup
  for (const code of ['ES', 'FR', 'DE', 'GB', 'CH', 'IT']) {
    const rate = context.shippingRateForCountry(code, 'pickup');
    assert.equal(rate.countryCode, code);
    assert.equal(rate.fulfillmentMethod, 'delivery');
    assert.equal(rate.shippingCents, 799);
  }

  // Non-European countries: International rate €20, cannot use pickup
  for (const code of ['US', 'MZ', 'BR', 'CA', 'ZA', 'TR', 'AM', 'AZ', 'GE', 'KZ']) {
    const rate = context.shippingRateForCountry(code, 'pickup');
    assert.equal(rate.countryCode, code);
    assert.equal(rate.fulfillmentMethod, 'delivery');
    assert.equal(rate.shippingCents, 2000);
  }
});

test('checkout draft preservation keeps home address intact when toggling to pickup and back', () => {
  const { context } = setupEnvironment();

  // Customer enters home delivery draft
  const homeDraftData = {
    first: 'Maria',
    last: 'Santos',
    email: 'maria@example.com',
    phone: '+351912345678',
    country: 'PT',
    fulfillmentMethod: 'delivery',
    address: 'Rua das Flores 123',
    apt: '2º Dto',
    zip: '1000-001',
    city: 'Lisboa',
    district: 'Lisboa',
    homeDraft: {
      address: 'Rua das Flores 123',
      apt: '2º Dto',
      zip: '1000-001',
      city: 'Lisboa',
      district: 'Lisboa'
    }
  };
  context.saveCheckoutDraft(homeDraftData);

  // Customer toggles to pickup
  context.saveCheckoutDraft({
    fulfillmentMethod: 'pickup',
    address: context.PICKUP_LOCATION.address,
    apt: context.PICKUP_LOCATION.apt,
    zip: context.PICKUP_LOCATION.zip,
    city: context.PICKUP_LOCATION.city,
    homeDraft: homeDraftData.homeDraft
  });

  const pickupDraft = context.loadCheckoutDraft();
  assert.equal(pickupDraft.fulfillmentMethod, 'pickup');
  assert.equal(pickupDraft.homeDraft.address, 'Rua das Flores 123');
  assert.equal(pickupDraft.homeDraft.zip, '1000-001');

  // Customer toggles back to home delivery: draft is restored
  context.saveCheckoutDraft({
    fulfillmentMethod: 'delivery',
    address: pickupDraft.homeDraft.address,
    apt: pickupDraft.homeDraft.apt,
    zip: pickupDraft.homeDraft.zip,
    city: pickupDraft.homeDraft.city,
    district: pickupDraft.homeDraft.district
  });

  const restoredDraft = context.loadCheckoutDraft();
  assert.equal(restoredDraft.fulfillmentMethod, 'delivery');
  assert.equal(restoredDraft.address, 'Rua das Flores 123');
  assert.equal(restoredDraft.zip, '1000-001');
  assert.equal(restoredDraft.city, 'Lisboa');
});

test('stale quote avoidance: request identity combines country, fulfillmentMethod, and sequence', () => {
  assert.match(appSource, /const\s+currentRequestId\s*=\s*`\$\{code\}:\$\{method\}:\$\{sequence\}`/);
  assert.match(appSource, /if\s*\(currentQuoteIdentity\s*!==\s*currentRequestId\)\s*return;/);
  assert.match(appSource, /fulfillmentMethod:\s*method/);
});

test('Stripe and Orange Money submission payloads include fulfillmentMethod and pickup location details', () => {
  // Stripe request includes top-level fulfillmentMethod
  assert.match(appSource, /fulfillmentMethod:\s*method/);
  assert.match(appSource, /isPickup\s*\?\s*\[PICKUP_LOCATION\.address,\s*PICKUP_LOCATION\.apt\]/);

  // Orange Money visible text includes delivery vs pickup and fixed store address
  assert.match(appSource, /Método de envio:\s*\$\{fulfillmentLabel\}/);
  assert.match(appSource, /Local de recolha:\s*\$\{pickupLoc\.fullAddress\}/);
  assert.match(appSource, /pickupLocation:\s*isPickup\s*\?\s*pickupLoc\.fullAddress\s*:\s*null/);
});
