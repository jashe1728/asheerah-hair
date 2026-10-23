# Security and newsletter release — 2026-10-23

Implemented/reviewed by Codex; bounded newsletter peer review by Brodie. Original remediation b280c69 by Antigravity. Owner explicitly approved the production cutover.

| Component | Verified result |
|---|---|
| Frontend source | d1a9bba, after preserving concurrent Antigravity price commit 176dbeb; GitHub Pages deployment succeeded |
| Worker | fada0937-00b1-420e-81c8-b64434ef6025; same production name/routes/R2 binding; ten-minute cron retained |
| Apps Script | Version 20, new signed-only endpoint prepared before Worker switch; both prior accounting endpoints also updated to strict version 20 |
| Key/configuration | Presence checked without disclosure; live authenticated Stripe/manual HMAC probes both compatible=true |
| Unsigned accounting access | All three endpoints reject a harmless unsigned diagnostic with ok=false/Unauthorized request |
| Public headers | Rule c3092f96f2e74c26be0049070a1c41bc active, public-only scope; private CSP/referrer policies preserved |
| WAF rate limit | Rule 2a0f59596c7c49998eddfcb6e294cbb2 active: 20 requests/10 seconds/IP, 10-second Block, only checkout-session and shipping-quote paths |
| CSP collection | A real browser-generated harmless violation reached sanitized private R2 telemetry; CSP remains Report-Only |
| Public abuse controls | Shared R2 conditional-write counters; per-client and global ceilings, plus bounded chat-owner mail |
| Newsletter editor | https://asheerahhair.com/gestao/newsletter.html; same account allowlist/session; draft save, logo, text/image controls, in-page and exact email previews verified |
| Campaigns | Double opt-in, cancellation, immutable audience snapshot and rechecked consent; resumable bounded queue on existing cron; default 20 campaign messages/day |
| Local tests | 185 passed, 0 failed, including retry/queue/consent/escaping/media/signature/security regressions |

Live mobile measurement at 390px: document width 375px, editor width 343px, with no horizontal overflow. The live preview uses a DIV rather than a frame, loads the logo, and contains no scripts. The owner-facing exact-email link remains authenticated.

Live smoke checks preserved the EUR 7.99 Portugal quote, public product-review retrieval and unsigned-webhook rejection. The private newsletter API rejects anonymous requests. A legitimate reusable marketing draft was saved; no campaign was queued/sent and no fictional accounting record or charge was created.

Email-provider delivery and a real paid order were not exercised by these non-financial production checks. Existing order email/PDF/language regression tests passed; newsletter delivery tests used simulated provider responses. Use the private editor's test button to send a draft to the currently signed-in operator when a real message is desired.

No credentials, session cookies, private recipient addresses or customer screenshots belong in this record. Runtime subscriber lists, delivery payloads and owner audit events remain private in R2. Previously collected orders or legacy newsletter rows are not silently treated as confirmed marketing recipients.
