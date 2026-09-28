const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/styles.css'), 'utf8');

test('product options render as separate labelled selector sections, not a compressed two-by-two block', () => {
  const helper = app.match(/function productOptionGroupsHTML\([\s\S]*?\n\}/);
  assert.ok(helper, 'option group renderer should be present');
  const context = { optionGroupHTML: o => `<section>${o.name}</section>` };
  vm.runInNewContext(helper[0], context);
  const html = context.productOptionGroupsHTML([
    { name: 'Hair Length' }, { name: 'Lace' }, { name: 'Hair Density' }, { name: 'Cap Size' },
  ], {}, 'EUR');
  assert.match(html, /class="pd-option-groups"/);
  assert.doesNotMatch(html, /class="pd-option-grid"/);
  assert.equal((html.match(/<section>/g) || []).length, 4);
});

test('hair-length choices form a compact grid and selected options use the warm brand accent', () => {
  const helper = app.match(/function optionGroupHTML\([\s\S]*?\n\}/);
  assert.ok(helper, 'single-option renderer should be present');
  const context = {
    escapeHTML: String,
    optionDisplayLabel: String,
    isLaceOption: () => false,
    hasLaceTypes: () => false,
    escapeAttr: String,
  };
  vm.runInNewContext(helper[0], context);
  const html = context.optionGroupHTML({ name: 'Hair Length', values: ['10', '12'] }, { 'Hair Length': '10' }, 0, 'EUR');
  assert.match(html, /class="option-group option-group--length"/);
  assert.match(html, /class="pill active"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(css, /\.pd \.option-group--length \.pills\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.pd \.pill\.active\s*\{[^}]*background:\s*var\(--ink\)/);
  assert.match(css, /\.pd \.pill\s*\{[^}]*background:\s*var\(--soft\)/);
});

test('lace choices stay in two columns and adapt to narrow mobile widths', () => {
  assert.match(css, /\.lace-row\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  assert.match(css, /\.pd \.lace-cell\.active\s*\{[^}]*background:\s*var\(--ink\)/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)/);
});
