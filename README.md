# Asheerah Hair — Independent E-commerce Site

Shopify-free rebuild of asheerahhair.com for Asheerah Hair (luxury 100% virgin
human hair: wigs, bundles, crochet). Rebuilt from a full reverse-engineering of
the original site (see `docs/REBUILD_SPEC.md`) and the authoritative EUR pricing
engine (see `docs/price_engine.json`).

## Stack
- Static HTML/CSS/JS (GitHub Pages) — no platform lock-in
- `catalog.json` — full product catalog (17 products, 1,757 priced variants),
  built from the Excel pricing engine (EUR base)
- Google Sheets + Apps Script backend for orders (see `backend/Code.gs` and
  `SETUP.md`)
- Rule-based FAQ chatbot (FAQ first; AI upgrade planned)
- Multi-currency display (EUR base / USD / GBP), settled in EUR

## Pages
- `index.html` — homepage (hero, collections, textures, value props, reviews)
- `shop.html` — product grid (filter by `?cat=wigs|bundles|crochet`)
- `product.html` — product detail (`?h=<handle>`)
- `cart.html` — cart
- `checkout.html` — Stripe / PayPal / MB Way checkout
- `faq.html` — full FAQ + chatbot
- `pages/` — about, contact, shipping, returns, privacy, terms

## Project management
- GitHub: https://github.com/jashe1728/asheerah-hair
- Orca project: `asheerah-hair` (for worktrees / parallel agents)
- Planning: BUS-01 (Hermes planning store)

## Setup
See `SETUP.md` — Google Sheets backend and payment keys must be configured on
Asheerah's business accounts before going live.
