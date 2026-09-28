const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'shop.html', 'product.html', 'cart.html', 'checkout.html', 'faq.html', ...fs.readdirSync(path.join(root, 'pages')).filter(file => file.endsWith('.html')).map(file => `pages/${file}`)];

test('language selector sits on the left side of every site header', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const row = html.match(/<div class="header-row">([\s\S]*?)<\/div>\s*<\/header>/)?.[1];
    assert.ok(row, `${page}: header row exists`);
    const brand = row.indexOf('class="brand"');
    const language = row.indexOf('id="langDropdown"');
    const nav = row.indexOf('class="header-nav"');
    const actions = row.indexOf('class="header-right"');
    assert.ok(brand >= 0 && language > brand && nav > language && actions > nav, `${page}: language selector follows the brand and precedes navigation/actions`);
    assert.equal((html.match(/id="langDropdown"/g) || []).length, 1, `${page}: exactly one language selector`);
  }
});

test('language dropdown opens toward the right from its new left-side position', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/styles.css'), 'utf8');
  assert.match(css, /#langDropdown\{[^}]*flex:none/);
  assert.match(css, /\.lang-menu\{[^}]*left:0/);
  assert.doesNotMatch(css, /\.lang-menu\{[^}]*right:0/);
});
