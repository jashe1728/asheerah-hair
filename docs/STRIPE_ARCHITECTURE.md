# Asheerah Hair — Stripe Checkout Architecture

Status: architecture prepared; Stripe is NOT connected and no payment can be taken yet.

## Scope and deployment shape

The storefront is a static GitHub Pages site. Stripe's secret key must never be placed in `config.js`, frontend JavaScript, GitHub Pages files, or a customer-visible request. A Cloudflare Worker creates Stripe Checkout Sessions, applies server-side shipping rates, verifies Stripe webhooks, and forwards authenticated payment records to the existing Google Apps Script (GAS) spreadsheet backend.

```text
Customer browser (GitHub Pages)
  ├─ reads catalog.json and builds cart / checkout form
  ├─ POSTs country to Worker /shipping-quote for a destination rate
  ├─ POSTs product handles/options/quantities and customer details to Worker
  ├─ receives only Stripe's hosted Checkout URL + opaque order reference
  └─ redirects customer to Stripe-hosted Checkout

Cloudflare Worker
  ├─ validates catalog variants and server-calculates shipping
  ├─ creates Stripe Checkout Session
  └─ verifies signed webhook, then HMAC-forwards verified payment events to GAS

Stripe Checkout
  ├─ collects payment and redirects to success/cancel URL
  └─ sends signed webhook event to the Worker /webhook URL

Google Sheet: pending orders and verified payment state (pending → paid / failed / expired / refunded)
```

## Responsibilities and trust boundaries

### Browser

- Collect customer name, email and phone. Stripe Checkout collects the final shipping address; the form's locally entered address is included only in the signed pending order record for preliminary fulfillment details.
- Never decide the authoritative price, discount, shipping amount, tax, or paid status.
- Never receive or store the Stripe secret key.
- Redirect only to the Checkout URL returned by the Worker. Do not treat a success-page visit as proof of payment.

### Cloudflare Worker and Apps Script server

- Keep `doPost` order-request handling separate from payment creation and webhook handling.
- Allowlist request actions and validate required fields, lengths, email, product identifiers, option values, integer quantities and maximum quantity.
- Re-read the canonical published catalog from a fixed, trusted URL (the Asheerah GitHub Pages `catalog.json` URL), match product handle + exact variant options, and compute line prices server-side. Reject unknown/unavailable variants and do not trust browser-supplied prices or totals.
- Coupons are not implemented on the Stripe path; the browser rejects checkout when a coupon is applied rather than honoring an untrusted client-side discount.
- Derive shipping from the destination entered on the site: free for the currently listed EU countries, €20 for the currently listed African countries, and €15 for the United States. Other previously listed destinations (Brazil, Canada, United Kingdom and Switzerland) have no confirmed rate and are rejected by Stripe checkout until priced. Stripe's shipping address collection is restricted to countries in the same rate group as the quote.
- Compute EUR item subtotal and shipping in integer cents from the canonical catalog and shipping rules. The scaffold does not calculate VAT/tax; confirm the legal tax treatment and add the appropriate Stripe tax configuration before accepting live payments.
- Create a Stripe Checkout Session using Stripe's HTTPS API with server-side `STRIPE_SECRET_KEY` held as a Cloudflare Worker secret. Send only necessary customer/shipping details and line items; use EUR and fixed success/cancel URLs derived from configured site URLs.
- Set `client_reference_id` and metadata to an opaque order ID plus server-computed expected total/currency. Do not put private customer data into Stripe metadata.
- Use a Stripe idempotency key for Session creation and do not let the browser submit a client-chosen URL.
- On checkout start, Worker creates a pending order in the separate `Stripe Payments` sheet through a signed GAS action, creates the Checkout Session, and stores its Session ID before returning the URL. On webhooks, Worker verifies the raw Stripe signature/timestamp, then HMAC-signs the event for GAS. GAS validates the amount/currency/order/session against the pending row, deduplicates event IDs, and updates status. The success page remains neutral; it does not query a status API.

### Stripe Dashboard / owner setup

- Complete account, identity and business verification directly in Stripe.
- Create a restricted API key only if Stripe's permissions support the required Checkout Session operations; otherwise use a standard test-mode secret key, stored only as a Cloudflare Worker secret.
- Configure Stripe webhook at the Worker `/webhook` URL. Copy its signing secret directly to Cloudflare Worker secrets; never store the Stripe signing secret in Apps Script.
- Confirm enabled payment methods and settlement currency EUR in the Stripe Dashboard.

## Proposed request/response contract

### Create session

`POST` to the Cloudflare Worker `/create-checkout-session` endpoint. The browser sends product handles/options/quantities and contact details only. The Worker gets the canonical catalog, computes all prices and returns `{checkoutUrl,orderId}`. No browser price, amount, coupon, or secret is accepted.

```json
{
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "+351...",
    "address": "...",
    "city": "...",
    "postalCode": "...",
    "country": "Portugal"
  },
  "items": [
    { "handle": "canonical-product-handle", "options": { "opt1": "exact value", "opt2": "exact value" }, "quantity": 1 }
  ]
}
```

The browser must omit `price`, `subtotal`, `shipping`, `discount`, `total`, `paid`, and any Stripe session identifiers. The server returns a generic validation error for invalid cart/customer data and creates no session.

```json
{ "checkoutUrl": "https://checkout.stripe.com/...", "orderId": "opaque-order-reference" }
```

### Shipping quote

`POST` to Worker `/shipping-quote` with `{ "country": "Portugal" }`. The Worker normalizes the destination against its supported country/rate groups and returns `{ "currency": "EUR", "region": "EU", "shippingCents": 0 }` (Africa returns `2000`; United States returns `1500`). Unpriced/unsupported destinations receive HTTP 422 and must not proceed to Checkout. The quote endpoint is display-only; the session-creation request independently recalculates the rate. The address countries allowed inside Stripe Checkout are restricted to that same price group.

### Webhook

Stripe sends signed events to the Worker `/webhook` URL. The Worker verifies `Stripe-Signature` against the exact raw body and timestamp, then forwards a compact event in a Worker-HMAC-signed wrapper to GAS. GAS does not attempt to read Stripe headers. It validates the Worker HMAC and writes the event to the `Stripe Payments` sheet.

## Order sheet additions

The Worker creates a separate `Stripe Payments` sheet record before session creation (pending), then attaches the Checkout Session ID. Signed webhook events update that same row and set `paid` only when Stripe reports `payment_status=paid` and the amount, currency, order and session match. Event IDs are deduplicated. Stored fields include customer email/phone, shipping name/address, item summary, expected amount and status. No card numbers or security codes are stored. The browser return page intentionally does not yet poll or display backend payment status.

## Customer-facing flow

1. Customer reviews cart, prices, delivery and final amount.
2. Checkout form validates required contact and delivery fields.
3. Browser requests a shipping quote from Worker `/shipping-quote`; the Worker derives the amount from its own destination rules. The displayed total remains pending until a supported destination is quoted.
4. Browser sends product handles/options/quantities and customer details to Worker.
5. Worker revalidates catalog prices and destination shipping, creates a Stripe Checkout Session with allowed countries limited to the quoted rate group, and returns the hosted Checkout URL.
6. Browser redirects to Stripe-hosted checkout, which collects shipping and billing details.
7. Stripe returns to a neutral “Payment submitted / verifying” page. The page does not claim success from the return URL and does not yet query the payment status API.
8. Verified webhook validates amount and currency, records the event in the separate sheet, and emails the owner if paid. The owner verifies fulfillment from Stripe and the sheet; no customer-paid success receipt is sent yet.
9. Cancel/back returns to the checkout form with the cart intact. Coupon codes are rejected on the Stripe path until server-side coupon support is implemented.

## Security and operational requirements

- Stripe secret key and webhook signing secret: Cloudflare Worker secrets only. `WORKER_GAS_SECRET` is duplicated as a Cloudflare secret and Google Apps Script Script Property for authenticated forwarding. Never commit any secret.
- Publishable key is not a substitute for a backend and does not authorize creating a charge.
- Require HTTPS; validate allowed return URLs in server code rather than accepting arbitrary URLs from the browser.
- Add request size limits, input validation, rate limiting where practical, duplicate-submission protection, structured error handling and owner alerts without exposing internal errors to customers.
- Verify paid state from Stripe API/webhook; reconcile pending sessions and refunds in the Stripe Dashboard.
- Keep Stripe test mode and test keys until the full end-to-end test passes. Do not enable live payments until business verification, shipping/tax policy, refund/cancellation copy, order notifications, webhook delivery, and accounting fields are confirmed.
- Existing client-side order handling can currently record an order request and open WhatsApp. Stripe must be an explicit separate branch; do not silently present that request flow as a successful charge.

## Owner actions required before implementation can go live

1. Confirm the existing Apps Script deployment belongs to the Asheerah account and you can edit/redeploy it.
2. In Stripe, complete account/business verification yourself and confirm the account can accept EUR payments.
3. The supplied rates are implemented: free for the currently listed EU countries, €20 for the currently listed African countries, and €15 for the United States. Confirm whether to add rates/countries beyond that list; Brazil, Canada, United Kingdom and Switzerland remain unavailable through Stripe checkout until rates are set. Confirm tax treatment, coupon rules and refund/cancellation wording.
4. Use Stripe test mode and store its secret key only as a Cloudflare Worker secret.
5. Confirm shipping-address collection, coverage of unpriced destinations and VAT/tax policy; Stripe currently collects address a second time and no tax/coupon integration is enabled.
6. Deploy Apps Script updates and Worker, set the matching Worker HMAC secret in both services, configure Stripe webhook signing secret, then test valid/declined/cancelled payments, invalid prices, webhook retry/duplicate, shipping and the Sheet record. Do not switch to live mode until all checks pass.
7. Only after separate explicit approval, publish website changes to `main`/GitHub Pages and verify the exact customer-facing domain. The custom domain previously returned HTTP 403, so verify it independently from GitHub Pages.

## Implementation gates

- Gate A — owner confirms Apps Script access and unresolved business rules.
- Gate B — implement/test server-authoritative cart validation and Stripe test-mode session creation; secrets remain unset.
- Gate C — verify webhook signature handling. If GAS cannot expose the required headers/raw body, implement the Worker verifier rather than accepting unsigned events.
- Gate D — owner adds credentials privately, redeploys backend, and completes Stripe account setup.
- Gate E — run end-to-end test-mode verification and correct the payment-state UX.
- Gate F — owner approves production publish; verify live domain and paid order/webhook state before claiming launch.

## Current verified status

- GitHub Pages is the current site host; there is no server runtime on GitHub Pages.
- The local repository now contains an unpublished Worker checkout scaffold, an Apps Script webhook-event recorder, and a frontend Stripe redirect branch. These pieces have not been deployed or tested against Stripe or the live Apps Script account.
- `config.js` leaves `stripeCheckoutURL` empty and Stripe marked not configured, so the checkout is not active.
- The Apps Script backend records signed Stripe webhook events, but there are no pending-order/session rows or customer status endpoint yet.
- No Stripe credentials have been added. No live payment can be taken from the current deployed site.
