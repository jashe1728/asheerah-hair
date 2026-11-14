'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('scheduled manual paid bridge is strictly gated and passes a working send callback', async () => {
  const backend = path.resolve(__dirname, '../backend');
  const calls = [];
  const mocks = {
    'stripe-worker.cjs': { fetch() {} },
    'order-email.cjs': { retryPending: async () => {} },
    'management-auth.cjs': { cleanup: async () => {} },
    'business-dashboard.cjs': { backfill: async () => {} },
    'public-security.cjs': { cleanup: async () => {} },
    'newsletter.cjs': { processQueue: async () => {} },
    'checkout-monitor.cjs': { run: async () => {} },
    'manual-paid-email.cjs': { async runScheduledPaidEmail(env, options) {
      calls.push({ env, options });
      await options.fetch('https://example.invalid/test', { method: 'POST' });
    } },
  };
  for (const [name, exports] of Object.entries(mocks)) {
    const filename = require.resolve(path.join(backend, name));
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  }
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (...args) => { fetchCalls.push(args); return { ok: true }; };
  try {
    const worker = (await import(pathToFileURL(path.join(backend, 'worker.mjs')).href)).default;
    for (const flag of [undefined, '', '0', 'true', 1]) {
      const promises = [];
      worker.scheduled({}, { MANUAL_PAID_SCHEDULER_ENABLED: flag, ORDER_EMAIL_ENABLED: '1' }, { waitUntil: p => promises.push(p) });
      await Promise.all(promises);
    }
    assert.equal(calls.length, 0);
    assert.equal(fetchCalls.length, 0);
    const env = { MANUAL_PAID_SCHEDULER_ENABLED: '1', ORDER_EMAIL_ENABLED: '1' };
    const promises = [];
    worker.scheduled({}, env, { waitUntil: p => promises.push(p) });
    await Promise.all(promises);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].env, env);
    assert.deepEqual(fetchCalls, [['https://example.invalid/test', { method: 'POST' }]]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(mocks)) delete require.cache[require.resolve(path.join(backend, name))];
  }
});
