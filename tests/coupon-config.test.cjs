const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('all approved ambassador and personal codes carry fixed EUR discounts', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
  const coupons = JSON.parse(JSON.stringify(context.window.CONFIG.coupons));
  const sevenEuro = ['ONIKA10','LILIAN10','TUCHA10','CASSIE10'];
  const personal = ['ONIKAAH','LILIANAH','TUCHAAH','CASSIEAH'];
  assert.deepEqual(Object.keys(coupons).sort(), [...sevenEuro,...personal].sort());
  for (const code of sevenEuro) assert.deepEqual(coupons[code], {type:'fixed',value:7,minSubtotalEur:0});
  for (const code of personal) assert.deepEqual(coupons[code], {type:'fixed',value:15,minSubtotalEur:0});
});
