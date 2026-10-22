const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('all eight new ambassador and personal codes are configured and old codes removed', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
  const coupons = JSON.parse(JSON.stringify(context.window.CONFIG.coupons));

  const ambassadorCodes = ['ONIKA01', 'LILIAN01', 'TUCHA01', 'CASSIE01'];
  const personalCodes = ['ONIKAAH', 'LILIANAH', 'TUCHAAH', 'CASSIEAH'];
  const allCodes = [...ambassadorCodes, ...personalCodes];

  // Old codes must be removed
  const oldCodes = ['ONIKA10', 'LILIAN10', 'TUCHA10', 'CASSIE10'];
  for (const oldCode of oldCodes) {
    assert.equal(coupons[oldCode], undefined, `Old code ${oldCode} must be removed`);
  }

  // Exactly 8 active codes
  assert.equal(Object.keys(coupons).length, 8);
  assert.deepEqual(Object.keys(coupons).sort(), allCodes.sort());

  // Ambassador codes: €7 fixed, merchandise only
  for (const code of ambassadorCodes) {
    assert.deepEqual(coupons[code], { type: 'fixed', value: 7, minSubtotalEur: 0 });
  }

  // Personal codes: €15 fixed, merchandise only
  for (const code of personalCodes) {
    assert.deepEqual(coupons[code], { type: 'fixed', value: 15, minSubtotalEur: 0 });
  }
});
