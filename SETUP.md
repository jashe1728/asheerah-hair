# Asheerah Hair — Account Setup Guide

Configured while signed into **Asheerah's** Google account. Keys are PUBLISHABLE
only (safe to be public). Never put secret/private keys in the site.

---

## 1. Google Sheets + Apps Script backend (orders + monthly report)

Orders land in a Google Sheet with structured columns and a computed **Profit**
per order. `buildReport()` creates a **Monthly Report** tab with revenue / COGS /
fees / profit by month + charts.

### Step 1 — Create the spreadsheet + script (once)
1. https://sheets.new (Asheerah's account) → rename "Asheerah Hair Orders".
2. Extensions → Apps Script.
3. Paste the contents of `backend/Code.gs` into `Código.gs` (save).
4. Check `OWNER_EMAIL` at the top if it should be a different inbox.

### Step 2 — Authorize MailApp
Select `authMail` in the function dropdown → **Run** → Review permissions → Allow.

### Step 3 — Deploy
Deploy → New deployment → Web app:
- Execute as: **Me** · Who has access: **Anyone**
- Copy the `/exec` URL → paste into `config.js` → `backendURL`.

### Step 4 — Generate the monthly report (after orders exist)
In the editor, select **`buildReport`** → **Run**. It creates/refreshes the
**Monthly Report** tab with a summary table + charts. Re-run any time.

> The report computes COGS from the supplier cost model embedded in `Code.gs`
> (editable if supplier prices change), fees per payment method, and profit.

---

## 2. Online payments

The storefront remains in preview mode until a server endpoint and Stripe webhook are deployed and tested. A Stripe publishable key alone does not connect payments. Never put a Stripe secret key in `config.js`, GitHub, or browser JavaScript.

### Stripe card checkout (prepared, not yet active)

The integration uses a Cloudflare Worker as the server-side Stripe Checkout endpoint and webhook signature verifier. The Worker resolves current EUR variant prices from the published `catalog.json`; it ignores browser-provided amounts. The existing Google Apps Script backend stores payment events only after the Worker validates Stripe's signature and signs the forwarded message.

Owner setup steps, after the code is reviewed and approved for deployment:

1. The supplied shipping rules are implemented server-side: EU (currently listed EU destinations) is free, currently listed African destinations cost €20, and the United States costs €15. Shipping rates for the other listed destinations (Brazil, Canada, United Kingdom and Switzerland) were not supplied; Stripe checkout will reject those destinations until a rate is confirmed. Confirm whether to add other EU/African countries. Confirm tax/VAT obligation and customer return/refund policy. Taxes are not currently calculated; if tax is due, do not activate payments until implemented and tested.
2. In the Google Apps Script project, add Script Property `WORKER_GAS_SECRET` with a strong random value. Use the same value as a Cloudflare Worker secret; do not send it in chat or commit it.
3. Deploy the updated Apps Script as a Web App (execute as owner, access anyone) and retain its `/exec` URL. The endpoint accepts payment records only with a valid Worker HMAC.
4. In Cloudflare, deploy `backend/stripe-worker.cjs` using `backend/wrangler.toml`. Set `GAS_WEBHOOK_URL` to the Apps Script `/exec` URL. The Worker calculates destination shipping; no `SHIPPING_CENTS` setting is used. It restricts Stripe's collected shipping country to the rate group that matched the address entered on the site. Configure `SITE_ORIGIN` as a bare origin (no path) and `SITE_BASE_URL` as the site's full base URL (including `/asheerah-hair` for project Pages).
5. In Stripe, complete account verification yourself. Use test mode first. Add Cloudflare secrets `STRIPE_SECRET_KEY` (test secret), `STRIPE_WEBHOOK_SECRET` (created after the Worker deploy), and `WORKER_GAS_SECRET` (same value as Apps Script property).
6. In Stripe Dashboard → Developers → Webhooks, create an endpoint at `https://<your-worker-host>/webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. Copy its signing secret directly into Cloudflare as `STRIPE_WEBHOOK_SECRET`.
7. Set `config.js` → `stripeCheckoutURL` to `https://<your-worker-host>/create-checkout-session`; keep `payment.stripe.configured` false until the test-mode path passes. Test a successful test-card payment, a decline, cancel/back, tampered/invalid cart prices, webhook retry, duplicate event, final EUR amount, EU/Africa/US shipping rates, unsupported destinations and the Google Sheet row. Only enable production after tax treatment and the supported-country list are confirmed. Live keys and website deployment require separate approval.

The existing checkout form currently asks for address details and Stripe Checkout also collects shipping/billing address. Review that duplicate entry before production; do not omit the shipping address collection because it is needed for fulfillment.

### PayPal / MB Way

PayPal and MB Way are not connected by this Stripe work. Keep those methods disabled until each has a real server-side integration and its own verification.

---

## 3. Currency
- Base **EUR** (matches pricing Excel). Charges settle in EUR.
- Site shows EUR/USD/GBP via the switcher (display rates in `config.js` → `rates`).

---

## 4. Before-launch checklist
- [ ] `config.js` → `backendURL` set (Apps Script `/exec`)
- [ ] Worker deployed and `config.js` → `stripeCheckoutURL` set
- [ ] Stripe test secret and webhook signing secret stored only as Worker secrets
- [ ] `WORKER_GAS_SECRET` matches in Worker secrets and Apps Script Script Properties
- [ ] Server-side EU/Africa/US shipping rates verified; other destination rates confirmed or destinations kept unavailable
- [ ] Tax policy confirmed; implement tax calculation if tax is due
- [ ] Stripe test checkout and signed webhook verified end-to-end before live mode
- [ ] `config.js` → `paypalClientId` set only if PayPal is independently integrated
- [ ] MB Way enabled only after a real provider integration is implemented
- [ ] `buildReport()` run once → Monthly Report tab visible
- [ ] Domain pointed to GitHub Pages and customer-facing domain verified
