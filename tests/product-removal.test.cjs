const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = require('../catalog.json');
const summary = require('../docs/catalog_summary.json');
const appSource = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

test('colored crochet hair swatch product is removed from active storefront data', () => {
  const handle = 'colored-crochet-human-hair';
  assert.equal(catalog.products.length, 17);
  assert.equal(catalog.products.reduce((count, product) => count + product.variants.length, 0), 1572);
  assert.equal(catalog.products.some(product => product.handle === handle), false);
  assert.equal(summary.some(product => product.handle === handle), false);
  assert.doesNotMatch(appSource, new RegExp(handle));
});
