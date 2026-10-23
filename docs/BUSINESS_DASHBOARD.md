# Asheerah Hair — daily business dashboard

## Interface and agreed workflow

- Live path: https://asheerahhair.com/gestao/
- Local interactive preview: http://127.0.0.1:8767/gestao/?demo=1
- Four Portuguese views: daily actions, orders, payments, supplier/shipping.
- Owner chose access for owner and client, manual copy/download of supplier summaries, orders needing action first, and two separate confirmations: supplier accepted, then parcel handed to courier.
- Authorized email addresses were supplied in the conversation and are stored only in the Worker's private MANAGEMENT_ALLOWED_EMAILS configuration. Do not publish the access list in this repository.

The interface includes product photos, options/quantities, customer/delivery information, status/date filters, search, CSV export, private notes, supplier summary download/copy, tracking reference and an attributed activity history. Brown/cream styling and the existing logo follow the storefront. Phone navigation and order cards are responsive.

## Payment and fulfillment rules

Online payments are read from the existing signed, amount-checked webhook. There is no button to mark a Stripe order paid manually. Pending online payment, failed/expired checkout and confirmed payment remain distinguishable.

Orange Money receipt confirmation requires a reference, explicit acknowledgement and the full order amount. It is recorded as an operator-attributed operations record. It does not currently update Apps Script accounting or send a second paid customer email. Do not treat this record as a complete accounting reconciliation.

Only paid orders can progress: new → sent to supplier → supplier accepted → courier received → delivered. Pickup instead uses ready for collection → collected after supplier acceptance. The operator sends the supplier summary manually, then registers that it was sent. No message is automatically sent to the supplier, courier or customer by these workflow buttons.

Orders before the configured MANAGEMENT_HISTORY_CUTOFF have an unknown initial fulfillment state. They require an operator to confirm the prior state against their records, with an observation, before supplier export/progression is offered. They are not silently treated as new unfulfilled orders. Existing explicitly saved operations remain authoritative.

The supplier summary contains the order reference, items/options, destination name, phone and delivery address. It omits retail prices and customer email. CSV cells escape quotes and neutralize formula prefixes. Downloads contain personal data and should only be shared with the responsible recipient.

Confirmations require acknowledgement. Concurrent edits require refresh rather than silently overwriting another operator. There is no delete, refund, financial reversal or fulfillment rollback in v1; the owner can request a correction workflow next.

Financial cards show gross order amounts, not processor balances, payouts or profit. Fees, refunds and supplier costs are not reconciled. Lists paginate in batches of 100; a visible partial-summary warning remains while more pages exist. Search and totals apply to loaded records. The daily view prioritizes paid orders ready for the supplier, unpaid requests, supplier/courier work, then completed/incomplete checkouts.

## Private email sign-in

Cloudflare Zero Trust was not provisioned on the account. To avoid a separate service setup, authentication is built into the app using the existing verified noreply sender and Resend credential.

- Only the exact private email allowlist can receive a code or create a session. The public start response does not reveal whether an account is listed.
- Cryptographically random six-digit codes expire after ten minutes. Codes are stored as salted hashes and can be used once, with conditional writes preventing concurrent replay.
- Five attempts per code; 30 verification requests per IP per 15 minutes; 20 start requests per IP per 15 minutes; three emails per account per 15 minutes; 30 login emails per day across the application.
- Random 256-bit session tokens are stored as hashes. The __Host-ah_management cookie is HttpOnly, Secure, SameSite=Strict, host-only and expires after eight hours. Tokens are never returned in JSON or saved in browser storage.
- Removing an account from the allowlist invalidates its sessions on their next request. Sign-out deletes the session and clears displayed order information. A scheduled sweep deletes expired auth records.
- Same-origin JSON is required for login, logout and every mutation. Sensitive JSON is private/no-store and has no cross-origin permission. The dashboard page proxy adds CSP, frame denial and no-store headers; it does not forward cookies or identity headers to static hosting.
- Production customer records remain only in browser memory. Demo mode is available only on localhost/127.0.0.1 with ?demo=1, uses a separate localStorage key and synthetic data, and never falls back from an unauthenticated production request.

This login relies on the security of the two authorized mailboxes. A stronger identity provider or passkeys can be introduced later if the owner wants them.

## Server and order history

- backend/management-auth.cjs: one-time codes, sessions, rate limits, expired-record cleanup.
- backend/business-dashboard.cjs: private order listing, workflow mutations, private static-page proxy, durable snapshots and recent-history backfill.
- business-orders/<id>.json: private immutable checkout details plus authoritative payment-state updates. Paid status cannot be downgraded by an older snapshot.
- business-operations/<id>.json: manual receipt confirmation, fulfillment stage, notes, tracking and audit entries. R2 conditional writes enforce the current operations version.
- management-auth/: expiring login and session records. Never include these records or their values in source control or issue payloads.

MANAGEMENT_CAPTURE_ENABLED=1 enables archival writes when checkout snapshots are created/updated. Existing email copies have a 30-day cleanup policy, so business history uses a separate namespace. A scheduled backfill copies existing recent notification snapshots in batches of 50, marking completion only after its full sweep. Fictional isTest records are excluded. A visible loading notice remains until the initial import completes.

New orders are captured immediately; the existing ten-minute scheduled trigger performs backfill and auth cleanup without a schedule change. Business history itself has no automatic deletion policy in v1. Agree longer-term retention, deletion/correction and exports with the owner. Orders already removed from the notification spool require a separate authenticated accounting import; they cannot be reconstructed from the catalogue.

Routes: /gestao* and /management-api/* on the existing Worker. No payment secrets, new provider keys, mailbox passwords or access lists are shipped in frontend assets. The client uses the app, not provider consoles.

## Verification and remaining acceptance

155 Node tests pass, including existing checkout/email regressions and new auth, replay/concurrency, expiry, allowlist, CSRF, workflow/payment gating, historical classification, pickup, archival retention, test exclusion, export privacy, CSV formula handling and page-header checks. Wrangler dry-run bundles successfully.

The local synthetic preview was exercised through receipt confirmation, supplier handoff, supplier acceptance, courier tracking, note persistence, search, summary copy/download button behavior, and desktop/phone layout. The supplier summary's contents are tested directly; a browser automation download-event wait was unavailable, so a saved downloaded artifact was not independently inspected.

The dashboard was published and the live API rejected missing/forged sessions, unlisted-account verification and cross-origin sign-in. The live page returned CSP/frame-denial/no-store headers and had no browser console errors. Shelton confirmed successful live sign-in using his inbox code on 23 October 2026. No real order was modified for testing. Older accounting history, refunds/fees/profit, correction controls and Orange Money accounting synchronization remain follow-up work.

Authentication design reference: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (random, expiring, single-use codes and request/attempt limits).
