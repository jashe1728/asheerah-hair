const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function accounting() {
  const context = {
    Utilities: {formatDate: () => '2026-10-22'},
    Session: {getScriptTimeZone: () => 'UTC'}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../backend/Code.gs'), 'utf8'), context);
  return context;
}
test('Orange Money has zero fees across order amounts', () => {
  const c = accounting();
  for (const amount of [0, 50, 105.99, 1000]) assert.equal(c.feeFor_('orange_money', amount), 0);
});
test('Orange Money order row uses zero fee in the existing profit estimate', () => {
  const c = accounting();
  c.cogsFor_ = () => 60;
  const row = c.buildOrderRow_({method:'orange_money',totalEur:105.99,subtotalEur:100,shippingEur:5.99,items:[],customer:{}});
  assert.equal(row[11], 0);
  assert.equal(row[12], 45.99);
});
test('Stripe fees are unchanged and unknown methods remain unspecified', () => {
  const c = accounting();
  assert.equal(c.feeFor_('stripe', 100), 3.20);
  assert.equal(c.feeFor_('unknown', 100), null);
});
