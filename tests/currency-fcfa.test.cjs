const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');

function loadMoney() {
  const currencies = app.match(/const CURRENCIES = \{[\s\S]*?\n\};/)[0];
  const money = app.match(/function money\([\s\S]*?\n\}/)[0];
  const context = { CONFIG: { rates: { EUR: 1, USD: 1.08, GBP: 0.85, XOF: 660 } } };
  vm.runInNewContext(`${currencies}\n${money}\nglobalThis.result = money;`, context);
  return context.result;
}

test('FCFA is selectable and display rate is exactly 660 per euro', () => {
  const context = { window: {} };
  vm.runInNewContext(configSource, context);
  assert.equal(context.window.CONFIG.rates.XOF, 660);
  assert.match(app.match(/const CURRENCIES = \{[\s\S]*?\n\};/)[0], /XOF:[\s\S]*?FCFA/);
});

test('FCFA prices are converted at 660 per euro and displayed as whole francs', () => {
  const money = loadMoney();
  assert.equal(money(1, 'XOF'), 'FCFA 660');
  assert.equal(money(2.5, 'XOF'), 'FCFA 1,650');
  assert.equal(money(1.01, 'EUR'), '€1.01');
});
