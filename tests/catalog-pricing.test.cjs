const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../catalog.json');
const appSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../assets/js/app.js'), 'utf8');
const vm = require('node:vm');

const byHandle = handle => catalog.products.find(product => product.handle === handle);
const variant = (product, opts) => product.variants.find(item =>
  item.opt1 === opts[0] && item.opt2 === opts[1] && (opts.length < 3 || item.opt3 === opts[2]) &&
  (opts.length < 4 || item.opt4 === opts[3])
);

 test('wig selection carries cap size through variant lookup and cart options', () => {
  const variantData = { opt1:'16', opt2:'5x5 HD', opt3:'180%', opt4:'SMALL', price_eur:185.99 };
  const p = { variants:[variantData] };
  const matchBlock = appSource.match(/function matchVariant\(p, opts\)\{[\s\S]*?\n\}/)[0];
  const optsBlock = appSource.match(/function cartOpts\(sel, opts\)\{[\s\S]*?\n\}/)[0];
  const context = {};
  vm.runInNewContext(matchBlock + '\n' + optsBlock, context);
  const options = [{name:'length'},{name:'lace'},{name:'density'},{name:'cap'}];
  const cartOpts = context.cartOpts({length:'16',lace:'5x5 HD',density:'180%',cap:'SMALL'}, options);
  assert.equal(cartOpts.opt4, 'SMALL');
  assert.equal(context.matchVariant(p, cartOpts), variantData);
});

test('wigs expose only updated lengths, HD lace options and cap sizes', () => {
  const expectedLengths = ['16','18','20','22','24','26','28','30','32'];
  const expectedLace = ['5x5 HD','13x4 HD','13x6 HD'];
  const expectedCaps = ['SMALL','MEDIUM','LARGE'];
  for (const product of catalog.products.filter(item => item.category === 'wigs')) {
    assert.deepEqual(product.options[0].values, expectedLengths, product.handle + ' lengths');
    assert.deepEqual(product.options[1].values, expectedLace, product.handle + ' lace options');
    assert.deepEqual(product.options[2].values, ['180%','200%','250%'], product.handle + ' density');
    assert.deepEqual(product.options[3].values, expectedCaps, product.handle + ' cap sizes');
    assert.equal(product.variants.length, 9 * 3 * 3 * 3, product.handle + ' variant count');
  }
  assert.equal(variant(byHandle('straight-wig'), ['16','5x5 HD','180%','SMALL']).price_eur, 185.99);
  assert.equal(variant(byHandle('deep-wave'), ['16','5x5 HD','180%','SMALL']).price_eur, 191.99);
});

test('existing crochet products use the spreadsheet NTR medium 100g minimum prices', () => {
  const prices = {
    '16': [118.99,169.99,219.99], '18': [125.99,179.99,233.99],
    '20': [135.99,194.99,254.99], '22': [141.99,203.99,265.99],
  };
  for (const product of catalog.products.filter(item => item.category === 'crochet' && !['colored-crochet-human-hair','p6-27-deep-wave-crochet'].includes(item.handle))) {
    assert.deepEqual(product.options[0].values, Object.keys(prices), product.handle + ' lengths');
    for (const [length, values] of Object.entries(prices)) {
      for (const [i, grams] of ['100g','200g','300g'].entries()) {
        const item = variant(product, [length, grams]);
        assert.ok(item, `${product.handle} ${length}/${grams} exists`);
        assert.equal(item.price_eur, values[i], `${product.handle} ${length}/${grams}`);
      }
    }
  }
});

test('P6/27 Deep Wave Crochet uses colored minimum prices and 16–22 inch options', () => {
  const product = byHandle('p6-27-deep-wave-crochet');
  assert.ok(product, 'new P6/27 product exists');
  assert.deepEqual(product.options[0].values, ['16','18','20','22']);
  const prices = {
    '16': [125.99,181.99,238.99], '18': [133.99,194.99,255.99],
    '20': [143.99,211.99,278.99], '22': [150.99,222.99,293.99],
  };
  for (const [length, values] of Object.entries(prices)) {
    for (const [i, grams] of ['100g','200g','300g'].entries()) {
      assert.equal(variant(product, [length, grams])?.price_eur, values[i], `${length}/${grams}`);
    }
  }
});

test('Pixie Curly Bundles uses natural curly bundle minimum prices and 12–28 lengths', () => {
  const product = byHandle('pixie-curly-bundles');
  assert.ok(product, 'new product exists');
  assert.deepEqual(product.options[0].values, ['12','14','16','18','20','22','24','26','28']);
  const prices = [152.99,163.99,176.99,189.99,202.99,215.99,231.99,252.99,265.99];
  for (const [i, length] of product.options[0].values.entries()) {
    assert.equal(variant(product, [length, '300g (3 pcs)'])?.price_eur, prices[i], `${length} inch`);
  }
});

test('wig descriptions no longer promise transparent lace or 10 to 32 inches', () => {
  for (const product of catalog.products.filter(item => item.category === 'wigs')) {
    assert.doesNotMatch(product.description, /transparent/i, product.handle);
    assert.doesNotMatch(product.description, /10\s*[–-]\s*32|10\s+to\s+32/i, product.handle);
  }
});
