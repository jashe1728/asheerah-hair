# Order confirmations — 23 October 2026

## Customer experience

Sender: `Asheerah Hair <noreply@asheerahhair.com>`. Replies go to `asheerahhair@gmail.com`.
Portuguese HTML and plain-text messages contain the actual brand logo, canonical catalog product photos/options, quantities, unit prices, coupon discount, shipping, total, fulfillment address and next steps. The attached PDF includes customer name/email/phone, order reference/date, item details, totals, payment status, address and notes. It is an order summary, not a fiscal invoice. There is no invented tracking/status URL.

Stripe emails require both a verified Stripe signature and the accounting backend's `paid` acknowledgement. Starting checkout, unpaid completion, failure, expiration and visiting a success URL cannot send a paid confirmation. Legacy orders without an item snapshot are skipped rather than reconstructed with current prices.

Orange Money requests use `/request-orange-money`, a single-use Turnstile challenge with `order_request` action and server-side catalog/variant/coupon/shipping validation. Only GW is eligible. Its email explicitly awaits payment and names Ciara Ly / +245 95 734 21 44. The owner receives a BCC copy. No transfer is automatically marked paid.

## Storage and delivery

The existing private R2 bucket stores separate `order-notifications/` and `order-email-payloads/` prefixes. Review/media routes cannot serve these prefixes. Order snapshots contain private customer data and are not public artifacts. Successful notification copies are removed after 30 days; accounting exceptions remain for operator review. Existing accounting remains in Apps Script; neither deployed Apps Script project was overwritten.

Orange Money is saved privately before accounting is attempted. `accountingStatus: needs_review` means reconcile the request into the existing Orders sheet using its UUID; do not blindly re-post an ambiguous accounting attempt. The customer/owner notification remains available independently. A request stuck in `recording_request` is recovered after two minutes by the scheduled runner.

Emails use persistent sent markers, conditional R2 writes, a stable Resend idempotency key and byte-identical prepared payloads. A ten-minute scheduled pass visits ten records per invocation and continues with a stored cursor. Ambiguous delivery attempts older than 23 hours require checking Resend before retrying, because provider idempotency expires after 24 hours. Provider acceptance is recorded separately from actual delivered status in Resend. Bounces are visible in Resend, not automatically resolved.

The PDF logo is pre-embedded at build time, without altering the source image. `order-pdf.cjs` writes the document with precomputed Helvetica metrics and compressed logo objects, avoiding per-request PNG decoding. The lightweight PDF uses WinAnsi text; unsupported glyphs are replaced with `?` in the PDF only (email retains Unicode). Rebuild `order-pdf-template.json` with `node backend/build-pdf-template.cjs` after an intentional logo change. `pdf-lib` is required for build-time template creation and PDF parsing tests, not the deployed runtime.

## Sender and activation

Resend sending domain `asheerahhair.com` verified in Ireland. DNS added: TXT `resend._domainkey`, DNS-only CNAME `rsend` to `rsend-euw1.forge.rmta.net`, DNS-only CNAME `send` to `send.forge.rmta.net`. Existing website DNS records were preserved. Receiving is disabled; replies use the existing Gmail address.

Sending-only Resend API key restricted to this domain, stored only in Worker secret `RESEND_API_KEY`. Never add keys to config.js, this file, Git or issue payloads. The one-use loopback setup script transfers a newly created key in memory, then closes; it never writes the key to disk.

Activation uses `ORDER_EMAIL_ENABLED = "1"` in the Worker and `orderRequestsEnabled: true` in config.js. Deploy the Worker first, then the storefront. To roll back, disable the frontend option and set the Worker flag to `0`, preserving private snapshots and provider records. Do not change or remove payment secrets.

## Verification

- Revised design approved for implementation on 23 October: brown and cream email panels, centred PDF logo, warm greeting and closing, two-column customer/delivery details, item table and highlighted total. `order-email-design.cjs` owns presentation; payment and queue logic remain separate. The user's local invoice reference informed table hierarchy only; no reference customer data or tax/invoice claims were copied.
- Live scheduled Worker fixture `f69d181e-e134-4530-bbf4-db86702fc69f` delivered to the same test inbox. Resend message `01a16707-bf22-78da-a459-933fcdd21837` reported **delivered**. One private fictional queue record was authorized; no charge, accounting order or schedule change. This test used the preceding template; revised HTML/PDF layout is separately rendered and checked locally.

- Branded HTML preview and two PDF states generated under ignored `output/order-email/`; all customer details in previews are fictional.
- PDF rendered and visually reviewed; mobile HTML checked at 390px without horizontal overflow.
- Automated checks cover signed paid triggers, unpaid/manual wording, country restriction, Turnstile action, forged prices, escaping, retry failures, deduplication, stable payloads and multi-page PDF output.
- Actual test sent to the user's chosen inbox `shelton.fenhane@gmail.com`, labelled `[TESTE — SEM COMPRA]`. Resend message `01a166f5-93cb-7f2b-a304-86101feecaff` reported **delivered**. No real purchase, charge or fulfillment was performed for this test. This proves sender delivery and attachment sending, not a real Stripe purchase.
- Shelton subsequently authorized publishing Chocolate/Ginger products with original photos. Expanded photo drafts remain local and are excluded from publication.

## Design and API references

- https://www.shopify.com/blog/order-confirmation
- https://www.bigcommerce.com/articles/ecommerce/best-order-confirmation-emails/
- https://resend.com/docs/dashboard/domains/introduction
- https://resend.com/changelog/idempotency-keys
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://developers.cloudflare.com/workers/platform/limits/
