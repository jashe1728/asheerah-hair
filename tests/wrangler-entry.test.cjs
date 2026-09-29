const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const toml=fs.readFileSync(require.resolve('../backend/wrangler.toml'),'utf8');

test('Cloudflare deploy entry is an ES module with a default fetch handler',()=>{
  const main=toml.match(/^main\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(main,'wrangler.toml must define a Worker entry point');
  assert.equal(path.extname(main),'.mjs');
  const entry=fs.readFileSync(path.join(__dirname,'../backend',main),'utf8');
  assert.match(entry,/export\s+default/);
});
