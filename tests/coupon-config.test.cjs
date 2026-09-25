const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('public ambassador codes are enabled but personal-use codes are not exposed client-side', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
  const coupons = JSON.parse(JSON.stringify(context.window.CONFIG.coupons));
  const publicCodes = ['ONIKA10','LILIAN10','TUCHA10','CASSIE10'];
  assert.deepEqual(Object.keys(coupons).sort(), publicCodes.sort());
  for (const code of publicCodes) assert.deepEqual(coupons[code], {type:'fixed',value:7,minSubtotalEur:0});
  assert.equal(Object.keys(coupons).some(code => /AH$/i.test(code)), false);
  assert.equal(Object.values(coupons).some(coupon => coupon.value === 15), false);
});
