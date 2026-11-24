# Integrated dashboard customer communications — readiness report

## Scope and base

Worktree: `C:\Users\PC\.t3\worktrees\asheerah-hair\t3-3041470b-305e32a8e925577a`, branch `t3/local-tracking-dashboard-pdf`.

HEAD and GitHub main are `6911e1c840765f0e87d95344d970a32aec530a09`. Read-only `git ls-remote origin refs/heads/main` checks matched the backed-up GitHub base requested by Shelton. No concurrent remote changes were observed. The final timestamp is in `output/dashboard-base-verification.json`. The stale dirty root checkout was not used as an implementation base or updated.

This now integrates the **actual existing dashboard and Worker**, modifying `gestao/index.html`, `gestao/dashboard.js`, `backend/business-dashboard.cjs` and `backend/worker.mjs`. It preserves the approved design and original logo. Automatic checkout email/PDF source, templates, translations, payment handler and live Wrangler configuration remain unchanged. Git regression checks cover that chain.

**Status: verified P1/P2 findings from Neon's position-147 integrated-snapshot review are fixed and regression tested; publication and live activation remain held for readiness review.** No commit, push, PR, deployment, real send, live queue read or live resource mutation was made. Neon reviewed the preceding snapshot, not these subsequent fixes; no independent re-review of the fixes is claimed. The final read-only remote check at 2026-11-24T10:21:42Z still matched HEAD.

## Position-147 review fixes

| Finding | Fix and regression evidence |
| --- | --- |
| UI enabled / sender disabled blocked legacy paid email | Legacy approval remains available for unclaimed orders regardless of the new UI flag. New receipt previews require the active sender gates plus explicit `DASHBOARD_CUSTOMER_RECEIPT_CUTOVER='1'`. Claiming a receipt writes sticky `receiptOwner` and an inert `paidEmail.status='dashboard_owned'` slot in one ETag CAS. The unchanged legacy queue skips that slot, and even the previous main API rejects a second legacy approval. Cancellation, replacing a draft with tracking, history archival and flag rollback do not release ownership. A race between old approval and new claim has one CAS winner. |
| Duplicate-risk fallback | Simply restoring legacy approval whenever the sender flag is off would reopen already-owned receipts and risk two customer emails. The fallback is therefore limited to orders never claimed by the new channel. Owned orders stay visible for reconciliation and reapproval in that channel. No automatic transfer or resend occurs. |
| Stale outer order version | Record, approval and reconciliation await the returned refreshed order, updating the outer order/version without resetting pagination or discarding unsaved notes. Actual browser-handler VM tests exercise asynchronous refresh and the root order-update helper. |
| Standalone prototype in publication set | Removed `backend/local-dashboard-tracking.cjs` and `gestao/tracking-local.*` from publishable paths. The old preview is preserved under ignored `tmp/legacy-dashboard-preview/`. Tests and the PDF preview use the pure fixture helper `tests/helpers/dashboard-synthetic.cjs`, which has no listener or bootstrap route. Production denies prototype assets and demo endpoints. |
| Invalid subtotal | Document generation requires explicit nonnegative safe integer subtotal, discount, shipping and total. Missing or invalid values block preview instead of substituting total or zero. Independent tracking recording still works when the paid order otherwise qualifies. |
| Silent scheduler errors / sensitive diagnostics | API and scheduler diagnostics contain only a fixed event/phase, hashed order tag and whitelisted error category. Tests inject customer/payload/secret text and verify none is logged. Top-level scheduler failures are covered too. |
| Stranded sending after final eligibility failure | After reserving, a failed final eligibility, payload, lease or snapshot check immediately moves the current claim to `needs_review` using the fresh ETag, preserving concurrent notes. Provider calls remain zero. Expired reservations remain operator-reviewable; automatic resend is prohibited. |
| Inventory page versus complete manifest | Each response declares its digest page-only. The offline builder validates every page digest and the complete cursor chain, rejects duplicates/incomplete chains, sorts entries canonically and creates a domain-separated full-manifest hash. Legacy pending/claimed/uncertain entries and expired-claim review indicators are included. Activation requires explicit full-manifest metadata, not a page digest. |
| Preview identifier normalization | Order and event identifiers are normalized consistently; uppercase preview identifiers return the same exact PDF bytes. |

Regression evidence: `tests/dashboard-neon-review.test.cjs` and `tests/customer-email-ui.test.cjs` add **13 passing cases**. The complete suite now has **420 passing tests**. Review tests also execute the prior main legacy approval code and queue reader against the inert ownership slot. These checks prove local state transitions and duplicate-prevention barriers; they do not promise exactly-once provider behavior.

## Connection map and fixes

| Finding | Current implementation |
| --- | --- |
| Standalone prototype | Existing order detail opens “Seguimento e email à cliente”. Real management API and actual Worker scheduled entry are wired. Older assets remain safe with flags off. |
| Wrong storage schema | `dashboard-customer-service.cjs` reads authoritative `business-orders/<id>.json` without writing it. Communication state is CAS-written inside `customerComms` in the existing `business-operations/<id>.json`. Notes, payment confirmation, fulfillment and legacy email state are preserved. Snapshot ETag/digest changes reject stale commits. |
| Approval/send coupling | Saving tracking sends nothing. Server preview generates exact recipient, subject, text, HTML and PDF. A separate authenticated acknowledgment/version/digest/key approval queues sealed bytes. A browser request never dispatches. |
| Wrong replies and references | Reply-To comes from the existing configured `asheerahhair@gmail.com`. Subjects, PDF and filenames use the established short `#XXXXXXXX` reference. |
| Localization/catalog glyphs | Separate dashboard copy covers `pt/en/es/fr/de/it`, with formal Portuguese and existing language normalization/EUR formatter. `″`, `′`, minus signs, decomposed accents and locale spacing are normalized. Word boundaries are respected; only oversized individual tokens split. Unsupported scripts block preview explicitly. |
| Logo/title | Exact original PNG is a sealed inline CID attachment. PDF image and mask are verified against the existing asset. Every PDF page repeats the full logo, italic editorial Asheerah Hair title and page number. Product/variant and tracking groups stay together when they fit a page. |
| Payload growth | Terminal accepted/failed payloads are pruned; digest, approval metadata, provider ID and audit remain. Drafts replace the previous draft. Limits: 1.5 MB operation, 100 messages, 1000 communication audit events. Admission stops at 750 audit events to reserve recovery room. |
| Permanently blocked orders | Authenticated CAS reconciliation records evidence, acknowledgment, actor and timestamp. Accepted reconciliation requires provider ID. Unattempted queued approvals can be cancelled; retryable/uncertain/review/expired reservations can be reconciled. New sends still require fresh preview and approval. |
| Provider/cron missing | Actual Resend HTTP adapter and default-off Worker scheduled hook exist. Durable cursor discovery and multiple inventory/authorization gates prevent automatic backlog drain. |

The only carriers and static URLs are DHL `https://www.dhl.com/pt-en/home/tracking.html`, 17TRACK `https://extcall.17track.net/pt/multiline`, FedEx `https://www.fedex.com/pt-pt/tracking.html`. Code is displayed separately; no query parameters are invented.

## Authorization and send safety

Every JSON, HTML and PDF route passes the existing allowlisted, hashed, expiring session verifier. Mutation routes enforce same origin, JSON type, body limits and durable shared rate counters. General order responses hide sealed communication payloads and provider/session internals. Browser preview HTML is a separate authenticated response with its own restrictive CSP and sandbox; the parent adds only same-origin frames and keeps its script/ancestor/object restrictions. No production demo-session route exists.

Tracking requires classified history, confirmed payment and courier handoff/delivered status. Pickup retains its own path. Stripe cannot use a manual payment confirmation. Manual-dashboard orders require immutable schema, full-amount confirmation and matching order digest. No new route changes payment or fulfillment. Receipt summaries are limited to dashboard-created orders; legacy receipt state prevents duplicates. Cached legacy approval calls are rejected when the new path owns the workflow. Automatic checkout customer PDFs remain deferred and unchanged.

Payload and approval HMACs use isolated key derivation and timing-safe comparisons. Approval expires after 15 minutes; version/snapshot changes invalidate it. Replaying the same key returns the prior durable outcome, including after terminal payload pruning.

The scheduler CAS-reserves `sending` before a provider request. Concurrent workers cannot reserve the same queued message. Final preflight failures immediately require review; otherwise, after five minutes, a stranded reservation becomes `needs_review` during recovery. It never automatically takes over a stranded reservation to resend. Reconciliation is an **operator attestation after checking the provider**, not an automated provider verification. Inventory flags expired reservations even before a recovery pass.

The HTTP adapter bounds request and body time to 20 seconds and success bodies to 4096 bytes. A 2xx response needs a valid provider ID to count as accepted. Explicit 429 responses retry identical bytes/key with bounded backoff. Permanent 4xx rejections stop. Timeout, malformed success, 408/409 and 5xx are ambiguous. This conservative 5xx policy intentionally avoids treating an uncertain outcome as proof of no send and matches the existing manual-paid safety approach. Retry stops at 23 hours, and malformed/backwards time requires review. The provider documents [24-hour idempotency retention](https://resend.com/changelog/idempotency-keys). **Acceptance is not delivery; there is no exactly-once promise.**

Shared counters limit UI activity and dispatch attempts (100/day). The cursor scans 10 operation records per scheduled pass. Large ledgers can delay discovery beyond one cron interval; no ten-minute delivery guarantee is claimed. Retention/archive procedure, alert ownership and capacity must be agreed before activation or approaching storage/history limits.

## Evidence

- `node --test tests/*.test.cjs`: **420 passed, 0 failed**. Log: `output/tracking-tests-integrated.txt`. Includes the position-147 regressions, actual management API/R2 schema, auth/CSRF, concurrent saves/approvals/schedulers, unrelated operation edits, changed snapshots, stale/expired approval, replay, exact attachments, corruption, pruning, rate/size limits, retries/backoff/window/backwards clock, provider status/timeout/body safety, cancellation/reconciliation, repeated corrections, six locales and checkout immutability.
- `tests/dashboard-worker-runtime.cjs` ran against the **actual Worker fetch path under workerd and persistent local R2**. It observed competing saves 200/409, authenticated exact PDF bytes, Italian copy, real catalog inch marks, explicit approval, replay and sender disabled. The queued approval survived process-tree termination/restart on the same absolute state directory. Evidence: `output/worker-runtime/result.json`, `customer-it.pdf`, and persistence log.
- The repeated local Worker persistence check also collected authenticated inventory pages and built a complete canonical manifest. Evidence: `output/worker-runtime/persistence-check.txt`, `inventory-pages.json` and `inventory-manifest.json`. The offline CLI reproduced the manifest at `output/dashboard-customer-inventory-manifest.json`; sending remained disabled.
- Actual production entry `backend/worker.mjs` passes Wrangler 4.167.0 `--dry-run` with an isolated no-live-resource configuration and both new flags off. Recorded size: **1161.64 KiB raw / 703.01 KiB gzip**. Log: `output/dashboard-bundle-check.txt`. This was a local bundle, not deployment.
- Browser review used the real `/gestao/`, actual order detail, authentication and API, not localStorage demo data. Desktop 1280px and phone 390px showed the original logo, exact HTML/PDF, separate save and approval, disabled approval before acknowledgment, queued/paused status and no horizontal overflow. Native PDF download also succeeded. Images: `output/dashboard-integrated-desktop.png`, `output/dashboard-integrated-mobile.png`.
- A browser approval during Wrangler hot reload reported uncertainty. Refresh showed the original draft, and same-key approval succeeded afterward. Initial Wrangler relative persistence unexpectedly resolved into a parent temporary folder and retained child locks. That obsolete synthetic state was backed up inside the worktree and removed; final verification used fresh explicit state inside the worktree and a full process-tree restart. No root project files or live data were involved.

## Brand, licensing and Unicode

The existing logo is reused as the user's established project asset; no new ownership claim is made. PDF title uses a Standard-14 Times-Italic reference alongside the original wordmark, and body text uses Helvetica. No font program was downloaded or embedded. The inspected metric tooling MIT notice is retained in `backend/dashboard-brand-LICENSE.txt`. HTML uses italic Georgia/Times/serif fallbacks without webfont requests. [Adobe's PDF specification](https://opensource.adobe.com/dc-acrobat-sdk-docs/standards/pdfstandards/pdf/PDF32000_2008.pdf) documents the standard fonts. Viewer substitution can differ; this is not PDF/A.

Six Latin-language copy sets and Portuguese accents are tested. Non-WinAnsi scripts require a separately reviewed embedded-font/shaping decision; names are never silently replaced with question marks. The original logo is present regardless of font substitution. The email PNG uses the [provider's CID attachment contract](https://resend.com/changelog/embed-images-using-cid); real email clients can suppress inline images, while the attached PDF embeds it. Plain-text fallback identifies the brand and cannot display a bitmap. Real email-client acceptance remains untested.

## Local reproduction

From this worktree in PowerShell:

```powershell
node backend/prepare-dashboard-local.cjs
npm.cmd install --prefix tmp/worker-tools --no-save --ignore-scripts --no-audit --no-fund wrangler@4.167.0
$env:WRANGLER_SEND_METRICS='false'
$dashboardStatePath=Join-Path (Get-Location).Path 'tmp/dashboard-worker-final-state'
node tmp/worker-tools/node_modules/wrangler/bin/wrangler.js dev --local --config tests/wrangler.dashboard-local.toml --port 8798 --ip 127.0.0.1 --persist-to $dashboardStatePath
```

In another terminal, set `$env:DASHBOARD_LOCAL_URL='http://127.0.0.1:8798'`. Run `node tests/dashboard-worker-runtime.cjs` against fresh local state; after restarting, run `node tests/dashboard-worker-runtime.cjs --verify-persistence`. The synthetic bootstrap exists only in `tests/local-dashboard-worker.mjs`. The production entry imports neither that file nor the older standalone harness. The old `tracking-local.*` URLs are denied by the production page proxy. Never use `--remote` or a production config for these tests. Generated `output/`, temporary tooling, R2 state and `.wrangler/` are ignored. The historical preview can still be run separately with `node tmp/legacy-dashboard-preview/backend/local-dashboard-tracking.cjs`; its files are deliberately excluded from the publication patch.

To assemble a manifest from saved inventory pages in cursor order, run `node backend/build-dashboard-inventory.cjs <saved-pages-array.json>`. This offline command cannot read R2, enable flags, write the activation marker or send. Its output declares `consistency: paginated-observation-not-atomic-snapshot`: collect during a controlled quiet window and restart collection after concurrent changes. A valid cursor chain cannot prove the ledger was unchanged throughout collection. Never use an individual `pageDigest` as an activation hash.

## Remaining publication and activation gates

1. **Readiness review of the fixes.** Neon's position-147 snapshot included the integration; the verified findings are now fixed with regression coverage. The revised diff and evidence are prepared, but no independent re-review of these fixes or publication approval is claimed. Native-language review can refine copy without touching checkout.
2. **Live queue inventory and explicit authorization.** Neither was performed here. Keep flags absent/`0`. Review every cursor page of `/management-api/customer-email-inventory`, including legacy, attempted and uncertain states; retain a complete manifest/hash. Obtain explicit user authorization before enabling anything. Verify sender account, From/Reply-To, credentials, limits and signing-secret provisioning separately.
3. **Activation requires all gates.** `DASHBOARD_CUSTOMER_EMAIL_UI_ENABLED='1'`, `DASHBOARD_CUSTOMER_EMAIL_SEND_ENABLED='1'`, existing provider credentials, `DASHBOARD_CUSTOMER_EMAIL_INVENTORY_HASH`, and private R2 `private/dashboard-customer-email-activation.json` with matching `inventoryHash`, `inventoryKind:'dashboard-customer-full-inventory'`, `inventorySchemaVersion:1`, positive integer `inventoryPageCount`, nonnegative integer `inventoryEntryCount`, allowlisted `approvedBy`, and ISO `authorizedAt`/`notBefore`. Page-only or pre-fix activation markers are rejected. New receipt ownership additionally requires `DASHBOARD_CUSTOMER_RECEIPT_CUTOVER='1'`; this flag is absent by default. Future authorization or a cutoff earlier than authorization is rejected. Do not backdate authorization. Older approvals are excluded; cancel/reconcile and freshly approve them rather than drain backlog. No HTTP endpoint creates this marker or enables sending. Creating it/changing flags requires separate explicit authorization.
4. **Shelton's operating decision.** Confirm cadence, queue volume, manual reconciliation ownership, alerting, retention/archive process and target-account CPU/subrequest capacity. The current scan is deliberately bounded. No live provider send, delivery webhook or accounting synchronization was verified or added.
5. **Root folder remains deferred.** Neon's earlier snapshot reported 12 dirty tracked root files and untracked photo drafts. Do not pull/reset or copy over them. After approved publication, separately inventory/back up those changes and drafts, reconcile against the approved commit, then update only with explicit authorization. No root update was attempted.

Future authorized sequence: independent review → prepare isolated commit → re-check remote main → publish backward-compatible API with flags off → publish versioned assets → authorized live negative/auth checks → inventory and separate activation authorization. Source publication alone must never enable sending.

Review artifacts: `output/local-dashboard-tracking.patch`, `output/tracking-manifest.json`, test/bundle logs, runtime results, PDFs and screenshots. No commit or remote write has been made.
