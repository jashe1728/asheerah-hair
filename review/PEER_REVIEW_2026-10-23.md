# Asheerah Hair security remediation peer review

Historical review of b280c69. The findings below were subsequently corrected and the owner-approved release was deployed; see [the final deployment record](../docs/SECURITY_RELEASE_2026-10-23.md). This original verdict is retained as review evidence for the submitted revision.

Date: 2026-10-23. Reviewer: Codex / Head 2.

**Verdict: changes requested. Do not merge or deploy b280c69 as submitted.** No production code, rules, credentials, orders, or emails were changed by this review.

## Evidence and version scope

- Reviewed b280c69bfe47048c28c92ae43b008d8269a66487, including all six changed files and the nine added regression tests.
- Its immediate parent is f76d02a, rather than the bd8b696 stated in the request. Current fetched main is fd81469, including ce4e00a session compatibility and fd81469 mobile/dashboard documentation and integration tests.
- Exact submitted revision: **164/164 tests passed**, after installing the locked backend test dependencies with npm ci --ignore-scripts --no-audit --no-fund.
- A temporary, conflict-free local merge with origin/main: **167/167 tests passed**. The merge was then aborted to leave the candidate unchanged. These results do not establish production deployment compatibility.
- Worker bundle: Wrangler 4.152.0 deploy --dry-run succeeded (590.79 KiB, gzip 355.77 KiB). No upload/deployment was performed. This dry run was against the submitted revision after the temporary merge was aborted.
- `node review/security-reproductions.cjs` confirmed five specific behaviors using the real frontend submit handler, real Worker handler and mocked Apps Script services. It makes no external calls and creates no production records. Its assertions confirm defects/contracts, not fixes.
- Read the supplied Brodie PDF, including Hermes's correction page. Findings below distinguish source behavior from unverified deployed Apps Script behavior.

## Findings requiring changes

### R1 — High: neither direct deployment order preserves Orange Money accounting

Locations: backend/Code.gs:54–63 and 320–333; backend/stripe-worker.cjs:469–478; prior Code.gs doPost and processStripeWorkerPayload_.

The strict new GAS rejects the existing Worker's unsigned Orange Money request. Conversely, the new Worker sends a signed wrapper with `type: order` inside the payload; the prior GAS recognizes the wrapper first and dispatches it into a Stripe-only handler, which rejects it as `Invalid worker action`. The top-level duplicate order fields do not provide compatibility because that branch is never reached.

Local reproductions confirmed both rejection paths and that matching new components record a mock order. The Worker can nevertheless return customer success and send a request email while marking private accountingStatus as needs_review. Thus a successful checkout/email is not proof of a Google Sheets accounting row.

Required: an explicit compatibility deployment or a separately deployed signed endpoint before switching the Worker. Do not deploy the strict Code.gs first against the current Worker. Both GAS deployment URLs in wrangler.toml must be mapped and checked; they are different URLs and may refer to different projects or versions. Script Property presence, matching bytes, deployed versions and permissions have **not** been verified in production during this review.

### R2 — Medium: newsletter always rejects a valid frontend submission but claims success

Locations: assets/js/app.js:575–589; backend/stripe-worker.cjs:427–429.

Frontend sends `{type:'subscribe',email}`; Worker accepts only `{email}` and returns HTTP 400. The frontend ignores response status/body and displays nl_ok, clears the input, and stores the email locally regardless. Reproduced with the actual frontend handler connected to the actual Worker handler, without forwarding anything to Google.

Required: send the supported body, verify HTTP and JSON acknowledgement before success, retain input and display a translated retry message on failure. Add an end-to-end contract regression for the frontend submission through the Worker to a fake GAS endpoint. Bump all affected app/config/chatbot asset references so cached old and new scripts are not assumed to update atomically. Test /pages/ newsletter forms too.

### R3 — Medium: AH-SEC-09 remains open; signing an unthrottled public relay does not stop flooding

Locations: backend/stripe-worker.cjs:430–441; backend/Code.gs:364–395.

The new public chat route validates shape and signs accepted requests but has no effective per-client rate control. Origin is spoofable by non-browser callers. An attacker can choose fresh valid session IDs and continue appending Sheets rows and triggering owner-mail attempts; the GAS mail cache is scoped to caller-controlled session IDs. Newsletter also remains an unthrottled public write relay.

Required before claiming AH-SEC-09 closed: enforced Worker/edge admission limits for chat and subscription, plus a bounded global mail/write budget or queue. The requested rate rules for checkout/shipping alone do not cover these routes. Add tests with changing session IDs, not just one repeated session. Rate limits should return a retryable failure to clients and avoid storing raw message bodies in security telemetry.

### R4 — Medium: CSP 204 endpoint is a sink, not observable report collection

Location: backend/stripe-worker.cjs:413–419; regression test only asserts status for an explicitly allowed Origin.

The endpoint returns 204 without parsing, storing, logging or aggregating reports, so it cannot support a decision to enforce CSP. A local missing-Origin POST returns 403 because it is behind the generic Origin gate. This establishes that case only; no claim is made that every browser omits Origin. Real browser reporting compatibility remains untested.

Required before calling CSP monitored: size/content-type limits, bounded sanitized telemetry with retention/access controls, abuse controls, and a real browser-generated violation visible to the operator. Keep full query strings, customer data, cookies and script samples out of logs. A third-party collector can substitute if explicitly configured. Report-Only does not itself prevent script execution or framing.

## Additional hardening / acceptance conditions

- Orange Money configuration guard (Worker:444) checks MANUAL_ORDER_GAS_URL but not WORKER_GAS_SECRET; its fallback to GAS_WEBHOOK_URL is unreachable when the manual URL is absent. Require a usable signing secret and target before accepting a request. Prefer one shared signing helper with an explicit target over duplicated normalization logic. GAS uses the stored secret bytes literally; Worker normalizes/lowercases its value. Verify both ends agree without publishing secrets.
- WhatsApp street minimization and product-description escaping are appropriate. If the Worker URL is absent/unreachable, the legacy WhatsApp fallback can still claim the complete address is recorded when no durable record exists. Make that statement conditional on an actual successful order acknowledgement.
- Header definitions/WAF changes are not in the submitted commit and were not applied by it. Removing a public GAS URL is not an authorization boundary; rejection at every deployed legacy endpoint matters.
- safeCell_ now protects the reviewed order/contact text cells against formula prefixes. HMAC authentication, sessionStorage draft migration and HTML escaping have useful regression coverage. Avoid using spreadsheet escaping to format owner email bodies; it strips line breaks and truncates text unnecessarily.
- Static SRI for Google Fonts dynamic CSS is correctly rejected as an automatic fix. Self-hosting remains an optional separate change.

## Customer-flow assessment

| Flow | Evidence | Outstanding acceptance gate |
|---|---|---|
| Stripe checkout/webhook | Existing server pricing, signature, mock integration and email tests passed; signed Stripe actions retained | Verify deployed GAS version/key, event acknowledgement and no duplicate receipt/accounting under retries |
| Orange Money | Matched new signed contract works in mock GAS; persisted-order behavior covered by existing tests | R1 staged deployment, secret guard, accounting acknowledgement and reconciliation of needs_review records |
| Reviews/media | Existing moderation, upload validation and Worker route tests passed; security patch does not replace the review implementation | Browser smoke test after edge headers/CSP and Worker deployment |
| Customer emails/PDF | Existing email/language/PDF tests passed; no changes to Resend credentials or templates | Verify a separately authorized safe test after the final deployment; successful email is not accounting proof |
| Contact page | Uses WhatsApp in pages/contact.html; no direct GAS form POST found there | Confirm browser handoff still works |
| Private dashboard | Current-main merge passed session and ingestion tests locally | Preserve ce4e00a and fd81469; verify session, order capture and existing enforced CSP live |
| Newsletter/chat | Shape mismatch and absence of abuse protection identified | R2/R3 |

## Live read-only observations

Public HTTPS HEAD requests on 2026-10-23 returned 200 for / and /checkout.html. Neither returned X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security, CSP or CSP-Report-Only. /gestao/ returned DENY, nosniff, same-origin referrer policy and its existing enforced restrictive CSP; it had no HSTS or CSP-Report-Only. Therefore public response-header remediation is not yet live, while the private dashboard policy must be preserved.

Apps Script deployment IDs/project ownership, Script Properties, current executable source and WAF plan/rules remain unverified. This is not a penetration-test certificate or a claim that all vulnerabilities are resolved.

## Acceptance decision

Do not merge or execute a production `wrangler deploy` yet. Resolve R1/R2/R3, make CSP collection observable if relying on its reports, preserve current main, and complete the staging/production verification in CLOUDFLARE_AND_DEPLOYMENT_RUNBOOK.md. The user's conditional authorization to deploy once satisfied has not been met.

Audit reference: C:/Users/PC/Desktop/Asheerah_Hair_Brodie_Security_Audit_2026-10-23.pdf, especially its independent correction page.
