# Security hardening deployment gate

This document describes local changes, not a deployed or approved production release.

## Changes prepared

- Unsigned `type: order` requests are rejected without ledger writes or email. The signed Stripe pending/session/event path and paid-order mirror remain.
- Manual storefront requests go to WhatsApp without a direct ledger write, saved-order claim or automatic cart clearing. English status text currently needs localization review.
- Apps Script opens only `ASH_SS_ID` and checks its ID and exact title against `ASH_SS_EXPECTED_NAME`. Missing configuration, inaccessible ledgers and mismatches fail closed. No active-spreadsheet or spreadsheet-creation fallback remains.
- HMAC accepts only `WORKER_GAS_SECRET`, canonicalized exactly like the current Worker. `WORKER_GAS_SECRET_LIVE` is no longer accepted by this source. Test and production must have independent projects/destinations/credentials; do not share a project to obtain isolation.
- Public contact submissions are length-bounded, email-validated and escaped against spreadsheet-formula interpretation; subscriber addresses are bounded and escaped before storage. Public Apps Script exception responses are generic and no longer echo provider diagnostics.

## Required before applying remotely

1. Read back the currently deployed Worker and Apps Script versions and compare with local source. Current working-tree changes include owner edits; do not blindly deploy all of them.
2. Verify the intended production ledger privately by ID and exact name, without reading customer rows. A title is only an additional check, not proof of unique identity or test isolation.
3. Explicitly approve setting `ASH_SS_ID` and new `ASH_SS_EXPECTED_NAME` on the intended project through the secure provider interface. Do not paste identifiers or secrets into chat. Do not change production until this action is approved.
4. Privately configure a fresh matching `WORKER_GAS_SECRET` in the intended Worker and Apps Script. Retire all exposed credentials, including any other consumers and compatibility properties. Adding a new key alone does not prove old keys were retired. No secret values may be logged or exported.
5. Explicitly approve deployment of the reviewed Apps Script code and storefront change. Coordinate a maintenance window because mismatched shared keys interrupt checkout/webhooks; pause checkout by an approved method if required. Keep the unsigned order route unavailable throughout the release. Do not roll back to an exposed credential or re-enable unsafe fallbacks.
6. Read back the deployed versions and nonsecret settings. Verify the intended ledger destination and authentication using a separately approved isolated test. No real transactions are authorized by this document.

## Verification still required

- Current deployed-code identity, Stripe key privileges, MFA/member access, webhook endpoints/events and delivery evidence, Cloudflare abuse controls, security headers, and exposed-key retirement.
- Fully isolated test-mode integration; concurrent duplicate events, retry/partial-write faults and live payment readiness are not proven by sequential mocked tests.
- Public contact/subscription/chat handlers remain directly callable and have no dependable abuse-rate control. Contact and subscription storage now receive formula-safe bounded fields, but chat collection still needs privacy/retention review and abuse controls before final security sign-off.
- HMAC key normalization is kept for current Worker compatibility. Use a fresh high-entropy provider-entered key; normalization is not a substitute for strong keys or secrecy. Any migration to byte-exact key handling must be coordinated at both ends.

## Local test result

2026-10-10, Europe/Lisbon: `node --test tests/stripe-worker.test.cjs tests/stripe-gas.test.cjs tests/stripe-checkout-client.test.cjs` — 30 passed, 0 failed, 0 skipped; exit 0. Worker fetches and Apps Script services were mocked. No provider transaction or deployment occurred. `git diff --check`, `node --check backend/stripe-worker.cjs` and `node --check assets/js/app.js` also exited 0.

Status: LOCAL HARDENING PREPARED; PRODUCTION RELEASE BLOCKED pending gates. Complete security cannot be guaranteed.

Fresh read-only public GET observations on 2026-10-10: homepage, www (redirecting to main hostname), and checkout returned 200. Final responses lacked CSP, HSTS, nosniff, X-Frame-Options, Referrer-Policy and Permissions-Policy headers. Hosting/CDN header configuration requires separate approval and compatibility checks, especially CSP and HSTS. Do not assume these headers can be configured by repository files on the current host.
