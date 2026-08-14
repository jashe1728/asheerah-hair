# Asheerah Hair — Website Reverse-Engineering & Rebuild Specification

Source: https://asheerahhair.com (Shopify store, "Asheerah Hair")
Goal: rebuild as an independent, Shopify-free website with same features + FAQ chatbot.
Status: reverse-engineering complete (data current as of 2026-08-14).

---

## 1. BUSINESS & BRAND

- Brand: **Asheerah Hair** — "Luxury Hair. Made for You."
- Tagline: 100% Virgin Human Hair — "Luxury In Every Strand"
- Contact: email asheerahhair@gmail.com · WhatsApp +351 914 522 508 · Instagram @asheerah_hair · TikTok @asheerahhair
- Business model: dropshipping. All sales final; replacements only for damaged/defective/incorrect items.
- Language: English (site also has /fr and /pt locale variants).

## 2. SITE ARCHITECTURE (all pages)

### Collections (3 + all)
| Handle | Title | Items | Blurb |
|---|---|---|---|
| /collections/luxury-wigs | Luxury Wigs | 7 | 100% Virgin Human Hair Wigs, Straight/Body Wave/Loose Wave/Water Wave/Deep Wave/Burmese Curly, 10–32", HD/Transparent lace, 180/200/250% density |
| /collections/luxury-bundles | Luxury Bundles | 6 | Virgin Hair Bundles, Straight/Body Wave/Burmese Curly/Deep Wave/4B/4C, 10–28", 300g sets (3 bundles) |
| /collections/crochet-human-hair | Crochet Human Hair | 5 | Water Curly/Burmese Curly/Water Wave/Pixie Curly/Colored, 16–26", 100/200/300g |

### Static pages
- /pages/about-us — brand story + "Why Choose Asheerah Hair" checklist
- /pages/faq — 10-question FAQ (see §7)
- /pages/contact-us — email/WhatsApp/Instagram/TikTok + contact form (Name, Email, Phone, Comment)
- /pages/shipping-policy — regions, delivery times, countries list, cancellations, customs
- /pages/return-refund-policy — all sales final, replacement rules
- /pages/privacy-policy
- /pages/terms-of-service
- /pages/data-sharing-opt-out

### Homepage sections (in order)
1. Hero — "Luxury Hair." / "Made for You." / "100% Virgin Human Hair" / "Luxury In Every Strand" + [Shop Now]
2. Shop by Collection (3 cards: Luxury Wigs, Luxury Bundles, Crochet Human Hair)
3. Shop by Texture (6 links: Straight, Body Wave, Deep Wave, Loose Wave, Water Wave, Burmese Curly)
4. Value props strip: 🌿 100% VIRGIN HUMAN HAIR · 🛡️ PREMIUM QUALITY · 💎 LONG LASTING & DURABLE · 🚚 FAST & SECURE SHIPPING · 🎧 EXCELLENT CUSTOMER SERVICE
5. Instagram feed (@asheerah_hair) + "VIEW MORE ON INSTAGRAM" CTA
6. Trust features: Premium Human Hair · Worldwide Shipping · Secure Payments · Made for Your Style
7. Customer reviews (5.00 ★, 9 reviews) — Judge.me
8. WhatsApp floating button + "Need a Custom Color? Send your inspiration photo on WhatsApp" banner

## 3. PRODUCT CATALOG (17 products)

### Wigs (7) — price range $171–$495 (was $236–$546)
| Product | Handle | Variants | Price range |
|---|---|---|---|
| Body Wave Wig | body-wave-wig | 250 | 171–495 / 236–546 |
| Straight Wig | straight-wig | 250 | 171–495 / 236–546 |
| Deep Wave Wig | deep-wave | 250 | 171–495 / 236–546 |
| Water Wave Wig | water-wave-wig | 250 | 171–495 / 236–546 |
| Loose Wave Wig | loose-wave-wig | 250 | 171–495 / 236–546 |
| Burmese Curly Wig | burmese-curly-wig | 250 | 171–495 / 236–546 |
| Custom Hair Color (Wigs & Bundles) | custom-hair-color-wigs-bundles | 25 | 15 (color code service) |

### Bundles (5) — $169–$356 (was $239–$426)
| Product | Handle | Variants | Price range |
|---|---|---|---|
| Straight Bundles | straight-bundles | 9 | 169–347 / 239–417 |
| Body Wave Bundles | body-wave-bundles | 9 | 184–356 / 254–426 |
| Burmese Curly Bundles | burmese-curly-bundles | 9 | 184–356 / 254–426 |
| Deep Wave bundles | deep-wave-bundles | 8 | 184–325 / 254–395 |
| 4B/4C bundles | 4b-4c-bundles | 8 | 184–325 / 254–395 |

### Crochet (5) — $137–$421 (was $182–$466)
| Product | Handle | Variants | Price range |
|---|---|---|---|
| Pixie Curly Crochet human hair | pixie-curly-crochet-human-hair | 18 | 137–421 / 182–466 |
| Water wave Crochet human hair | water-wave-crochet-human-hair | 18 | 137–421 / 182–466 |
| Water Curly Crochet Human hair | water-curly-crochet-human-hair | 18 | 137–421 / 182–466 |
| Burmese Curly Crochet Human hair | burmese-curly-crochet-human-hair | 18 | 137–421 / 182–466 |
| Colored crochet Human hair | colored-crochet-human-hair | 117 | 10 (color option service) |

## 4. PRODUCT OPTION STRUCTURE

### Wigs — 3 option groups (→ 250 variants: 12 lengths × 8 laces × 3 densities, minus gaps)
- **Hair Length:** 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32 (inches)
- **Lace:** 6x6 HD, 6X6 Transparent, 7X7 HD, 7X7 Transparent, 13X4 HD, 13X4 Transparent, 13X6 HD, 13X6 Transparent
- **Hair Density:** 180%, 200%, 250%
- Note: 13x4 and 13x6 laces are capped at 30" (no 32"); 7X7 Transparent also caps at 30".

### Bundles — 2 option groups
- **Hair Length:** 12–28" (Straight/Body Wave/Burmese) or 12–26" (Deep Wave/4B/4C)
- **Bundle Weight:** 300g (3 pcs) — single option, all bundles are 3-piece 300g sets

### Crochet — 2 option groups (→ 18 variants)
- **Hair Length:** 16, 18, 20, 22, 24, 26
- **Weight:** 100g, 200g, 300g

### Custom Hair Color (Wigs & Bundles) — 1 option
- **Color Code:** 1, 1B, 2, 3, 4, 6, 10, 12, 16, 18, 27, 28, 99J, 22, 30, 35, 135, 613, 144, Vermelho, Azul, Violeta, Pucsia, Rosa, Verde ($15 add-on service)

### Colored crochet — 2 option groups
- **One Color:** 1, 1B, 2, NC, 4, 6, 8, 16, 18, 24, 27, 70, 613
- **Mixed Colors:** 1000, P18/613, Grey, 2/8/24, 2/8/2, P8/16, P8/70, 26/13/2, T2/70

## 5. PRICING MODEL (reconstructed)

### Wig pricing — function of (length, lace, density)
Base structure observed from Straight Wig (matrix fully extracted, saved to
`catalog_summary.json` and `products_all.json`). Rules:
- **Density:** 180% < 200% < 250% (higher density = higher price).
- **Lace size:** larger lace (7x7 > 13x6 > 6x6 > 13x4) generally higher; HD ≥ Transparent of same size (HD slightly higher than Transparent for the same dimension; e.g. 13X4 HD 187 vs 13X4 Transparent 171 at 10"/180%).
- **Length:** monotonically increasing with length (10"→30").
- **Compare-at (was) price:** approximately sale price + a fixed margin varying by variant (roughly 12–15% of sale). Exact values per variant in the JSON dump.

### Bundle pricing — function of (length)
- 12": $218 → 14": $234 → 16": $249 → 18": $274 → 20": $297 → 22": $323 → 24": $349 → 26": $384 → 28": $420 (Straight/Body/Burmese); Deep Wave & 4B/4C stop at 26".
- Straight Bundles slightly cheaper: 12": $169 (see full matrix in JSON).

### Crochet pricing — function of (length, weight)
- Base per texture; increases with length and weight (100g < 200g < 300g). Full matrix in JSON.

> NOTE: The user will provide an Excel file with the authoritative hair pricing. The above is reconstructed from Shopify data and should be reconciled against that Excel before finalizing the catalog.

## 6. KEY METADATA & INTEGRATIONS TO REPLACE

| Shopify dependency | Independent replacement |
|---|---|
| Shopify checkout/payments | Own cart + order flow (email/WhatsApp confirmation) — decision pending |
| Judge.me reviews | Static testimonials section (9 reviews captured) or custom review store |
| Tapwa WhatsApp button | Native floating WhatsApp button |
| Shopify /cart / search /customer | Own cart drawer, search overlay, no customer accounts needed for v1 |
| Instagram embed | Link + image grid to @asheerah_hair |
| shop.app (Shop Pay) | None |

## 7. FAQ CONTENT (10 questions — seed for chatbot)
1. What type of hair? — wigs, bundles, crochet human hair in various textures/lengths.
2. Is it 100% human hair? — Yes.
3. Can it be dyed/heat-styled? — Yes; use heat protectants & proper care.
4. How long does shipping take? — Varies by location; tracking emailed once shipped.
5. Do you ship internationally? — Yes, worldwide to many countries.
6. Can I change/cancel my order? — Only before processing/shipping; after processing, no.
7. Returns/refunds? — All sales final (dropshipping); replacements only for damaged/defective/incorrect.
8. Damaged/incorrect item? — Contact within 7 days (FAQ) / 48 hours (shipping policy) with order # + photos.
9. How to choose texture? — Straight, Body Wave, Deep Wave, Water Wave, Loose Wave, Burmese Curly; use Shop by Texture.
10. How to contact? — asheerahhair@gmail.com, www.asheerahhair.com.

## 8. SHIPPING POLICY (chatbot + policy page data)
- Ships to: Europe, North America, South America, Africa.
- Delivery: Europe 3–7 business days · America 5–10 · Africa 5–12. Average 4–15 business days.
- Countries: Portugal, Spain, France, Belgium, Germany, Netherlands, Luxembourg, Italy, UK, Switzerland, US, Canada, Angola, Mozambique, Cape Verde, Guinea-Bissau, São Tomé & Príncipe, Brazil, Senegal, Ivory Coast, South Africa.
- Cancellations: only before processed/shipped.
- Replacements: wrong item / damaged / defective — contact within 48h with photos.
- Customs/import taxes: customer's responsibility.

## 9. RETURN & REFUND POLICY (chatbot + policy page data)
- All sales final (dropshipping). No refunds; replacements only for damaged/defective/incorrect.
- Contact within 7 days (policy page) with order number, clear photos, description.
- Non-returnable: change of mind, wrong order placed by customer, opened/used/washed items, color variation across screens, customs/carrier delays.
- Cancellations only before processing/shipping.

---

## APPENDIX A — REVIEWS (9 captured, for testimonials section)
- Ciaraly — 5★ "Easy to buy" (verified)
- Ciara Ly — "Amei tudo! Excelente qualidade 🥰"
- Tjdigitalagency — "Great product" (×2)
- Anonymous (Deep Wave Wig) — video, "Ameiii o cabelo é lindo"
- Anonymous (Body Wave Wig) — video, boho braids, reusable, not tangled
- Ciara Ly (Burmese Curly Crochet) — "Amei demais, alta qualidade super suave e brilhoso melhor cabelo da minha vida!!"
- Deivaforbs (Burmese Curly Bundles) — "The hair is smooth with great quality."
- Ciaraly (Straight Bundles) — "Amazinggg, love it!!😍😍😍"

## APPENDIX B — RAW DATA FILES (in Hermes/02_Thesis/07_Literature/_extract/asheerah/)
- products_all.json — full Shopify product export (17 products, all variants/images/descriptions)
- catalog_summary.json — parsed, cleaned catalog with options, price ranges, descriptions
- sitemap_pages.xml / sitemap_collections.xml — full page & collection inventory
