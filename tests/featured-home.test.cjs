const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const block = source.match(/function renderFeatured\(\)\{[\s\S]*?\n\}/)?.[0];

test('homepage featured hair renders exactly four static product cards', () => {
  const products = [
    ['chocolate-caramel-highlight-wig','wigs'], ['x-onika-ginger-bombshell','wigs'], ['wig-3','wigs'],
    ['bundle-1','bundles'], ['bundle-2','bundles'],
    ['crochet-1','crochet'], ['crochet-2','crochet'],
  ].map(([handle,category]) => ({handle,category,title:handle,images:['photo.jpg']}));
  const grid = { innerHTML:'' };
  const context = {
    CATALOG:{products},
    document:{getElementById:id => id==='featuredGrid' ? grid : null},
    curCode:()=> 'EUR', defaultOpts:()=>({}),
    variantPricing:()=>({priceEur:12,hasPromo:false}), priceHTML:()=> '€12',
    escapeHTML:value=>String(value), uiTxt:key=>key,
    encodeURIComponent,
  };
  vm.runInNewContext(block, context);
  context.renderFeatured();
  assert.equal((grid.innerHTML.match(/class="product-card featured-card"/g)||[]).length,4);
  assert.equal(grid.innerHTML.includes('carousel'),false);
  const handles = [...grid.innerHTML.matchAll(/href="product.html\?h=([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(handles, ['x-onika-ginger-bombshell','chocolate-caramel-highlight-wig','bundle-1','crochet-1']);
});
