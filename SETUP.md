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

## 2. Online payments (full integration)

The site offers **Card (Stripe), PayPal, MB Way**. All keys are PUBLISHABLE and
go into `config.js`. All charges settle in **EUR**.

### Stripe (cards + Apple/Google Pay)
1. https://stripe.com → sign up → complete business/KYC verification.
2. Dashboard → **Developers → API keys** → copy the **Publishable key** (`pk_live_...`).
3. Paste into `config.js` → `stripePublishable`.
4. MB Way on Stripe: Dashboard → **Settings → Payment methods** → enable **MB WAY**
   (requires a Stripe account in Portugal). If not available, use MONEI for MB Way.

### PayPal
1. https://www.paypal.com/business → create business account.
2. Developer dashboard → **Apps & Credentials** → **Client ID**.
3. Paste into `config.js` → `paypalClientId`.

### MB Way
Two options:
- **Stripe MB Way** (if enabled on the account): no extra key — Stripe handles it.
- **MONEI** (https://monei.com): €10 one-time setup, 1.4% + €0.28/tx. Create an
  account → get the API key → paste into `config.js` → `mbwayKey`.

---

## 3. Currency
- Base **EUR** (matches pricing Excel). Charges settle in EUR.
- Site shows EUR/USD/GBP via the switcher (display rates in `config.js` → `rates`).

---

## 4. Before-launch checklist
- [ ] `config.js` → `backendURL` set (Apps Script `/exec`)
- [ ] `config.js` → `stripePublishable` set
- [ ] `config.js` → `paypalClientId` set
- [ ] MB Way enabled (Stripe or MONEI)
- [ ] `buildReport()` run once → Monthly Report tab visible
- [ ] Domain pointed to GitHub Pages
- [ ] Test full order end-to-end (cart → checkout → Sheet → report → email)
