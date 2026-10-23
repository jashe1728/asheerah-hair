# Security remediation implementation follow-up — 2026-10-23

This follows the historical review of b280c69 in `review/PEER_REVIEW_2026-10-23.md`. The old review and reproduction script describe the pre-fix revision; use the current tests for the corrected implementation.

## Corrected locally

- Matched newsletter frontend/Worker payloads. Success requires HTTP and JSON acknowledgement. Failure preserves the email input and displays translated retry feedback; duplicate submits are guarded.
- Public subscriptions now feed the confirmed private newsletter audience via double opt-in, rather than silently treating an unverified Google Sheet row as a marketing recipient. Supported signup languages are preserved.
- Shared R2 CAS admission counters cap chat/signup writes across Worker instances. Rotating session IDs cannot bypass the IP limit. Independent global hourly/daily write ceilings and a five-per-hour/twenty-per-day owner-chat-mail budget cap downstream effects.
- Added bounded CSP collection for legacy and Reporting API formats. Missing Origin is allowed for reports, and stored telemetry strips query strings, script samples, referrers and identifying request headers. Only sanitized path/directive/blocked origin and timestamp are stored. Seven-day date-prefix cleanup is bounded and does not scan/delete orders.
- Orange Money requires a configured signing key before accepting requests, shares the signed forwarder with Stripe, and permits the documented accounting-target fallback.
- Apps Script now canonicalizes its single configured key exactly as the inspected live signing helper does. A signed, non-writing security_probe verifies executable compatibility without orders or emails. The private management security-status endpoint probes only configured accounting targets; it never exposes keys or accounting URLs.
- Manual accounting uses the immutable order ID and a script lock to make signed retries idempotent. Owner-email formatting retains its line breaks. WhatsApp handoff does not claim a complete address was durably recorded when only a fallback opened.
- Preserved current main's private-session compatibility, mobile dashboard and order-ingestion tests. Updated storefront script/cache references throughout tracked HTML files.

## Safe deployment plan selected

Use the **separate signed endpoint** option in the review runbook:

1. Save the reviewed Code.gs in the existing Asheerah Hair Orders project, without updating either active deployment yet. Both current accounting URLs were mapped to this same project: manual version 19 and Stripe version 18.
2. Run only verifySecurityConfiguration (non-writing, logs property presence only), then create a new signed-only versioned deployment. Existing callers keep their original URLs during preparation.
3. Set both Worker accounting targets to the new endpoint and deploy the integrated Worker. Probe `/management-api/security-status` through an existing authorized session; require compatible=true for both targets. On failure, roll back Worker while original endpoints remain active.
4. Publish/wait for the cache-versioned GitHub Pages frontend, verify private newsletter access and public rejection/report paths, then update the old active deployments to the strict version so those URLs no longer accept unsigned writes. Do not archive original endpoints until in-flight/retry behavior has been accounted for.
5. Verify accounting acknowledgements and any retained needs_review reconciliation separately from email delivery. No customer charge or fictional live accounting write is required for the configuration/signing probes.

## Current production gate

Automatic approval review rejected a full-source save to the live private Apps Script project: the generic instruction “fix these” was not considered specific approval for replacing production accounting source. That mutation was not performed. The live Apps Script cutover, Worker deployment and frontend publication for this combined release remain pending explicit approval of that concrete action. Do not claim local tests as production verification.

It also rejected saving the prepared Cloudflare security-header rule pending specific approval of production settings. Its form has been prepared to exclude private routes, use DENY, start HSTS at one day, and omit CSP Report-Only until the collector is deployed. No rule save/activation occurred during preparation. The dashboard confirms the zone is on the Free plan.

## Review evidence

Brodie independently inspected the new newsletter implementation read-only. Three queue/delivery blockers were fixed (pagination starvation, stranded queue marker, ambiguous network delivery). Brodie then independently reran all eight newsletter tests available at that point: 8 passed, 0 failed, with no remaining concrete blocker in that bounded re-review. Later tests add image-size/media checks and missing-key rejection. Provider and live deployment behavior remain distinct acceptance checks.

Final local evidence: **183/183 tests passed**; Wrangler 4.152.0 build-only dry run passed (627.80 KiB / gzip 364.54 KiB); desktop and 390px phone browser inspection completed with no horizontal overflow. The isolated local preview binds only 127.0.0.1:8769, uses fictional subscribers and simulated provider responses, and sends no real emails. No real campaign or test message was sent by this implementation task.
