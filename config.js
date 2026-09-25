/* Asheerah Hair — CONFIG (keys & settings). Edit THIS file to configure the site.
 * Loaded BEFORE app.js. This file is public (it only holds publishable keys, never secrets). */
window.CONFIG = {
  // Base currency (authoritative — matches the pricing Excel)
  currency: 'EUR',

  // Approximate display rates for the currency switcher. UPDATE as needed.
  // All charges settle in EUR; this is display-only.
  rates: { EUR: 1, USD: 1.08, GBP: 0.85 },

  // Fixed shipping (EUR). Confirm the final shipping price before launch.
  shipping: 30,
  shippingEta: '6–10 days',

  // Taxes rate (0 = none currently). Set to e.g. 0.23 (23% IVA) when applicable.
  taxRate: 0,

  // Coupon codes are client-side in this static storefront; personal-use eligibility
  // cannot be enforced until the backend validates customer identity server-side.
  coupons: {
    ONIKA10: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    LILIAN10: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    TUCHA10: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    CASSIE10: { type: 'fixed', value: 7, minSubtotalEur: 0 },
  },

  // ---- Payment methods ----
  // `configured:true` means a REAL processor integration is wired up and the
  // frontend can present it as functional. Leave false until actually integrated.
  // `accepted` lists the card brands actually accepted by the Stripe account.
  // Frontend payment methods. Processor connections are intentionally disabled until Stripe is linked.
  payment: {
    stripe: { configured: false, accepted: ['visa', 'mastercard'] },
    paypal: { configured: false },
    mbway: { configured: false },
  },

  // ---- Business contact ----
  whatsapp: '351914522508',
  email: 'asheerahhair@gmail.com',

  // ---- Google Apps Script backend (orders → Google Sheet) ----
  backendURL: 'https://script.google.com/macros/s/AKfycbzKCanbiHbmlJkhhjy77g2LyTGef6jqcOBNp-2LmUsw21eOCJfSiATnLrw3i2lXlnMP/exec',

  // ---- Payment keys (PUBLISHABLE only — never put secret keys here) ----
  // Stripe: Dashboard → Developers → API keys → Publishable key (pk_live_...)
  stripePublishable: '',
  // PayPal: Developer → Apps & Credentials → Client ID
  paypalClientId: '',
  // MB Way: handled via Stripe (if enabled) or a MONEI key. Leave '' to use WhatsApp fallback.
  mbwayKey: '',
};
