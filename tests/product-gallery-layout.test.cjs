const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/styles.css'), 'utf8');

test('product gallery uses keyboard-accessible thumbnail buttons', () => {
  assert.match(app, /class="thumbs"[\s\S]*?\.map\(\(im,i\)=>`<button type="button"/);
  assert.match(app, /aria-pressed="\$\{i===0\?'true':'false'\}"/);
  assert.match(app, /querySelectorAll\('\.thumbs button'\)/);
});

test('product gallery frames full images and presents a compact mobile thumbnail grid', () => {
  assert.match(css, /\.pd \.main-img\{[^}]*aspect-ratio:1\/1/);
  assert.match(css, /\.pd \.main-img img\{[^}]*object-fit:contain/);
  assert.match(css, /\.pd \.thumbs\{[^}]*grid-template-columns:repeat\(6/);
  const mobile = css.match(/@media\(max-width:640px\)\{([\s\S]*?)\n\}/g) || [];
  assert.ok(mobile.some(block => /\.pd \.thumbs\{[^}]*grid-template-columns:repeat\(5/.test(block)));
});
