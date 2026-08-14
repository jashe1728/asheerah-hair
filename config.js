/* Asheerah Hair — CONFIG (keys & settings). Edit THIS file to configure the site.
 * Loaded BEFORE app.js. This file is public (it only holds publishable keys, never secrets). */
window.CONFIG = {
  // Base currency (authoritative — matches the pricing Excel)
  currency: 'EUR',

  // Approximate display rates for the currency switcher. UPDATE as needed.
  // All charges settle in EUR; this is display-only.
  rates: { EUR: 1, USD: 1.08, GBP: 0.85 },

  // Fixed shipping (EUR) and payment fee assumption (EUR) — from Excel Settings
  shipping: 30,

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
