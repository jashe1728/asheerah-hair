/* Asheerah Hair — CONFIG (keys & settings). Edit THIS file to configure the site.
 * Loaded BEFORE app.js. This file is public (it only holds publishable keys, never secrets). */
window.CONFIG = {
  // Base currency (authoritative — matches the pricing Excel)
  currency: 'EUR',

  // Approximate display rates for the currency switcher. UPDATE as needed.
  // All charges settle in EUR; this is display-only.
  rates: { EUR: 1, USD: 1.08, XOF: 660 },

  // Shipping is destination-based; the Worker provides the quote at checkout.
  shipping: null,
  shippingEta: '6–10 days',

  // Taxes rate (0 = none currently). Set to e.g. 0.23 (23% IVA) when applicable.
  taxRate: 0,

  // Separate public code per ambassador, each with a €7 display discount.
  // Personal codes offer a €15 discount.
  // The checkout Worker validates the code and enforces its value server-side.
  coupons: {
    ONIKA01: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    LILIAN01: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    TUCHA01: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    CASSIE01: { type: 'fixed', value: 7, minSubtotalEur: 0 },
    ONIKAAH: { type: 'fixed', value: 15, minSubtotalEur: 0 },
    LILIANAH: { type: 'fixed', value: 15, minSubtotalEur: 0 },
    TUCHAAH: { type: 'fixed', value: 15, minSubtotalEur: 0 },
    CASSIEAH: { type: 'fixed', value: 15, minSubtotalEur: 0 },
  },

  // ---- Payment methods ----
  // `configured:true` means a REAL processor integration is wired up and the
  // frontend can present it as functional. Leave false until actually integrated.
  // Listed Stripe methods depend on account enablement and customer eligibility.
  // Frontend payment methods.
  payment: {
    stripe: { configured: true, accepted: ['visa', 'mastercard', 'apple_pay', 'mbway', 'klarna'] },
    orange_money: { configured: false, manual: true },
  },

  // ---- Business contact ----
  whatsapp: '351914522508',
  email: 'asheerahhair@gmail.com',

  // ---- Google Apps Script backend (orders → Google Sheet) ----
  backendURL: '',
  subscribeURL: '/public/subscribe',
  chatLogURL: '/public/chat-log',

  // ---- Payment keys (PUBLISHABLE only — never put secret keys here) ----
  // Stripe: Dashboard → Developers → API keys → Publishable key (pk_live_...)
  stripeCheckoutURL: 'https://asheerahhair.com/create-checkout-session', // Live Worker endpoint; never put a secret here.
  stripePublishable: '',
  // Public Worker endpoint/site key only; server-side secrets stay in Worker config.
  reviewAPIURL: 'https://asheerahhair.com',
  orderRequestsEnabled: true, // Authenticated sender and server-side request validation are enabled.
  reviewTurnstileSiteKey: '0x4AAAAAAFhy5-cPqvF8zxS4',
};
