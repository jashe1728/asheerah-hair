# Newsletters in the private dashboard

Entry point: `/gestao/newsletter.html`, linked from the order dashboard. Uses the same private sign-in and allowlist as order management. There are no public administrative endpoints or campaign recipient lists.

## Daily use

1. Create a newsletter or reopen a saved draft.
2. Add the subject/title and message. Blank lines separate paragraphs; arbitrary HTML/scripts are escaped.
3. Upload up to three JPEG, PNG or WebP images, each at most 3 MiB. Add descriptions, remove images or move them up. SVG and mismatched file signatures are rejected.
4. Optionally add a button linking to the HTTPS Asheerah Hair site. The content-language selector does not translate the written title/message automatically.
5. Save and preview. The cream/brown email includes the logo, responsive images, text, optional store button and unsubscribe footer.
6. Send a test to the email of the currently signed-in operator. The API cannot redirect that test to an arbitrary submitted address. Tests are limited to ten per UTC day.
7. Choose Prepare send, review the current confirmed-recipient count and tick the explicit acknowledgement. The campaign becomes immutable while queued/sending.
8. Automatic delivery uses the existing ten-minute Worker cron. Refresh the page to see submitted, skipped and failed totals. Campaigns can be paused and resumed. A technically uncertain delivery pauses for operator review rather than risking a duplicate.

The downloadable HTML is a preview/template. Send through the platform to generate each recipient's personal unsubscribe link.

## Audience and consent

The storefront newsletter form now uses Worker `/public/subscribe`, with a correctly matched payload and acknowledged response. It no longer stores subscriber email lists in the customer's browser; the legacy browser list is purged.

New subscribers receive an opt-in confirmation in their selected storefront language (pt/en/es/fr/de/it). Opening the link alone changes nothing. Confirmation requires POST, preventing link scanners from opting somebody in. Confirmation links expire after 48 hours. Only confirmed active records can enter a campaign's audience. The campaign worker checks current subscription state again immediately before delivery and skips cancellations.

The private audience is held in R2 under `newsletter-subscribers/`, with an HMAC-derived address index under `newsletter-addresses/`. Existing Google Sheets newsletter rows, orders and customer emails are **not automatically imported as confirmed marketing recipients**. The current dashboard shows confirmed and pending counts, not a public address list.

Each campaign recipient receives a signed unsubscribe URL containing an opaque ID, not an email address. GET displays a confirmation form; POST unsubscribes, including the one-click provider body. Emails include List-Unsubscribe and List-Unsubscribe-Post headers. Actual delivered-header/provider behavior still requires a real authorized email test; source tests are not delivery proof.

## Sending and limits

- Existing Resend sending credential and `noreply@asheerahhair.com`; reply-to remains the store contact.
- `NEWSLETTER_ENABLED=1` enables opt-in and scheduled campaigns. No new credential scope or external account is required by this implementation.
- `NEWSLETTER_DAILY_LIMIT=20` is the conservative default campaign-email allowance per UTC day; the UI displays it. Check actual provider plan capacity before raising it. This counter is separate from the application’s order receipts, but all provider usage still shares the account's actual plan limits.
- Public signup/chat: per-IP HMAC-keyed shared counters, plus hourly and daily global ceilings. Client Origin headers are not treated as bot authentication.
- Campaign queue uses private R2 state, conditional writes and a processing lease. Queue-marker creation precedes the queued-state transition. Round-robin pagination prevents paused early queue entries from starving later campaigns.
- Delivery payloads are frozen before the first attempt. Retries use the exact same Resend idempotency key and payload. A network error does not mark an ambiguous delivery permanently failed. An uncertain attempted delivery older than 23 hours pauses for review because provider idempotency retention is 24 hours. Waiting for quota before any provider attempt does not start this uncertainty clock.
- Do not manually resend a paused uncertain job without checking provider history. The module deliberately has no automatic “forget delivery history and resend” action.

Resend primary references: [idempotent email delivery](https://resend.com/blog/engineering-idempotency-keys), [custom unsubscribe headers](https://www.resend.com/changelog/custom-email-headers).

## Storage and publication boundaries

Campaign text/drafts live under `newsletter-campaigns/`; private queue/delivery/lease namespaces are separate from orders and accounting. Uploaded email images are served only via signed opaque media URLs; anyone receiving such an image URL can view it. Upload only intended campaign content. Public media requests do not expose subscriber/campaign records.

The editor renders its in-page preview with safe DOM elements and textContent, without parsing campaign HTML or creating a frame. A separate link opens the exact authenticated email HTML, whose CSP disables scripts. Private routes retain their own response policies. Do not replace the private dashboard's enforced CSP with a generic public policy.

This feature does not modify product prices, shipping, order confirmation templates, Stripe financial state or supplier/courier workflow. The approved combined release is live as of 2026-10-23. Production draft persistence, authenticated access, exact email rendering and the in-page preview were checked. No campaign was sent during implementation; local delivery tests use simulated provider responses. A reusable starter draft is available in the private editor.
