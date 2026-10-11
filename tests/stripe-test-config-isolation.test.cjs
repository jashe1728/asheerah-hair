const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const config = fs.readFileSync(path.join(__dirname, '..', 'backend', 'wrangler.stripe-test.toml'), 'utf8');

function configuredString(name) {
  const match = config.match(new RegExp(`^${name}\\s*=\\s*\"([^\"]*)\"\\s*$`, 'm'));
  return match ? match[1] : undefined;
}

test('test Worker config is distinctly named and cannot target production integrations', () => {
  assert.equal(configuredString('name'), 'asheerah-stripe-checkout-test');
  assert.equal(configuredString('ENVIRONMENT'), 'test');

  for (const name of ['SITE_ORIGIN', 'SITE_ORIGINS', 'SITE_BASE_URL', 'CATALOG_URL', 'GAS_WEBHOOK_URL']) {
    assert.equal(configuredString(name), '', `${name} must stay empty until its test-only target is provisioned`);
  }
});
