# Asheerah Hair — Account Setup Guide

This file is for whoever configures the business accounts. It must be done while
signed into **Asheerah's** Google account (not Shelton's). Parts of it (payment
keys) are done on the payment providers' sites.

---

## 1. Google Sheets + Apps Script backend (orders)

Goal: orders placed on the site land in a Google Sheet Asheerah can open, and an
order email goes to asheerahhair@gmail.com.

### Step 1 — Create the sheet + script (manual, once)
1. Go to https://sheets.new signed into Asheerah's Google account. Rename it
   "Asheerah Hair Orders". This becomes the order store.
2. Go to https://script.google.com → **New project**.
3. Replace the default `Code.gs` with the contents of `backend/Code.gs`.
4. Change `OWNER_EMAIL` at the top if it should be a different inbox.
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me (asheerahhair@gmail.com)**
   - Who has access: **Anyone**
   - Click Deploy, authorize when prompted, copy the **/exec** URL.
6. Paste that URL into the site's `assets/js/app.js` → `CONFIG.backendURL = 'https://script.google.com/macros/s/.../exec'`.

### Step 2 — Trigger authorization
In the Apps Script editor, select `authMail` in the function dropdown and click
**Run**. Approve the permission popup. This authorises MailApp so order emails
send. (First automated emails may go to Spam — mark "Not spam" once.)

### Verify
Place a test order on the site → a row appears in the Sheet and an email arrives.

> If the backend is not yet deployed, the site automatically falls back to
> opening a pre-filled WhatsApp message to +351 914 522 508 — orders are never lost.

---

## 2. Online payments (full integration)

The site is wired to offer **Card (Stripe), PayPal, and MB Way**. Each needs an
account owned by the business (Asheerah, or whoever legally owns the business).

### Stripe (cards + Apple/Google Pay)
1. https://stripe.com → sign up (business verification / KYC required).
2. Dashboard → **Developers → API keys** → copy the **Publishable key** (pk_live_...).
3. Paste into `assets/js/app.js` → `CONFIG.stripePublishable`.
4. For MB Way on Stripe: enable it under Payment methods (needs a Stripe account
   with Portugal; if not available yet, use MONEI for MB Way — see below).

### PayPal
1. https://www.paypal.com/business → create a business account.
2. Developer dashboard → Apps & Credentials → **Client ID**.
3. Paste into `assets/js/app.js` → `CONFIG.paypalClientId`.

### MB Way
Two options:
- **Stripe MB Way** (if available on the account): no extra setup beyond Stripe.
- **MONEI** (https://monei.com, €10 one-time setup, 1.4% + €0.28/tx): create an
  account, get the API key, and wire the MB Way checkout to it.

---

## 3. Currency

- Base currency is **EUR** (matches the pricing Excel).
- The site offers EUR / USD / GBP display via the currency switcher (approximate
  display rates in `CONFIG.rates`). Update these rates in `app.js` as needed.
- **All charges are settled in EUR** by the payment provider; the switcher is
  display-only.

---

## 4. Before launch checklist
- [ ] `CONFIG.backendURL` set (Apps Script /exec)
- [ ] `CONFIG.stripePublishable` set
- [ ] `CONFIG.paypalClientId` set
- [ ] MB Way method enabled (Stripe or MONEI)
- [ ] Domain pointed to GitHub Pages (custom domain asheerahhair.com)
- [ ] WhatsApp number confirmed in `CONFIG.whatsapp` and footer
- [ ] Test order end-to-end (cart → checkout → sheet → email)
