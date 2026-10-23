# Cloudflare rules and safe deployment runbook

Prepared 2026-10-23 for b280c69 review. **Instructions, not evidence that any rule/deployment has been applied.** Resolve the peer-review blockers first. Rule thresholds below are initial engineering choices, not measured traffic baselines or complete abuse protection.

## Apps Script / Worker sequencing

Do not deploy the submitted strict GAS first. Neither direct GAS-first nor Worker-first ordering is compatible with the old counterpart.

Preferred staged compatibility sequence:

1. Inventory both wrangler.toml GAS URLs. In each owning Apps Script project, inspect Deploy → Manage deployments to identify the exact deployed version; Project Settings → Script Properties must contain WORKER_GAS_SECRET. Confirm matching signing semantics privately. Do not rotate the shared secret during this rollout. Presence alone does not prove the values match. Do not paste, print or commit secret values.
2. Prepare a transitional GAS release that includes the new signed action dispatcher and sanitization while retaining only the legacy handlers already needed by the existing clients. Its signature branch must fail closed for invalid signatures; it must never fall through to an unsigned handler. Test old/new request formats locally. This temporary release preserves an existing exposure and must be time-bounded; do not leave it deployed as the final fix.
3. Deploy that transitional release to each relevant existing deployment, keeping its URL. In Apps Script: Deploy → Manage deployments → select deployment → Edit → Version: New version → Deploy. Saving source alone does not update a versioned web app. Verify the active version for both URLs. See [Google's versioned deployment instructions](https://developers.google.com/apps-script/concepts/deployments).
4. Deploy the corrected Worker, including required-secret guards and abuse controls. Keep existing R2 bindings, email cron, domain routes, three-account dashboard allowlist and secrets. Prove signed manual and Stripe requests are acknowledged by their intended endpoints in an isolated test environment first.
5. Publish corrected frontend assets with new version references. Confirm the newsletter sends only the supported fields, acknowledges failures, and that chat logs arrive through Worker. Cached or open old clients may temporarily fail newsletter/chat after legacy handlers are retired; do not accept unauthenticated writes indefinitely to support stale clients.
6. Deploy the strict final Code.gs to every still-active relevant deployment; retire unused older public deployment IDs. Check a harmless unsigned unsupported request is rejected without creating a row or sending mail. Verify a signed, non-writing diagnostic in staging; add such a diagnostic before using it. Do not use a fake live order as an authorization probe.
7. Reconcile any real Orange Money business records with accountingStatus=needs_review against Sheets, using order IDs and a deduplicated repair procedure. Do not silently replay arbitrary orders: manual appendRow is not idempotent in this patch.
8. Record deployed Worker version, both GAS deployment versions, rule IDs, frontend commit and verification results without credentials or customer data. Smoke-test reviews, checkout, mobile, private login and dashboard order capture. Real payments or test emails require their own authorized safe test scope.

Alternative: deploy a separate strict signed GAS endpoint first and point the new Worker at it while retaining the existing endpoint for the old Worker. Validate both target URLs and bookkeeping destinations. Retire the old unsigned endpoints promptly after cutover. This avoids introducing a permissive transitional version, but still requires an explicit cutover and endpoint retirement.

Rollback is staged too: while transitional GAS is active, Worker rollback is compatible. After strict GAS is active, rolling back to the unsigned Worker would break manual accounting; use a signed-compatible rollback or first restore the transitional release under an incident plan. Preserve Stripe webhook delivery/retries throughout.

## Response headers: exact dashboard setup

Select the asheerahhair.com zone. DNS records serving the storefront must be proxied through Cloudflare. Open **Rules → Overview → Create rule → Response Header Transform Rule**. Use **Set static**, not Add static, to avoid duplicate headers. Later rules can overwrite earlier ones, so inspect existing Managed Transforms and response rules. [Cloudflare procedure](https://developers.cloudflare.com/rules/transform/response-header-modification/create-dashboard/), [ordering and replacement behavior](https://developers.cloudflare.com/rules/transform/response-header-modification/).

### Rule 1: AH common security response headers

Expression:

```text
http.host in {"asheerahhair.com" "www.asheerahhair.com"}
```

For each row select Set static:

| Header | Value |
|---|---|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Strict-Transport-Security | max-age=86400 |

Deploy and verify actual responses. HSTS starts at one day; extend only after confirming HTTPS for the intended scope. Do not add includeSubDomains or preload without checking every affected subdomain. Do not disable the payment feature in Permissions-Policy: preserve wallet functionality. Do not modify Set-Cookie or Cache-Control in this rule.

### Rule 2: AH public referrer and CSP observation

Expression:

```text
(http.host in {"asheerahhair.com" "www.asheerahhair.com"}
 and not starts_with(http.request.uri.path, "/gestao")
 and not starts_with(http.request.uri.path, "/management-api/"))
```

Set static Referrer-Policy to:

```text
strict-origin-when-cross-origin
```

Set static **Content-Security-Policy-Report-Only** to this single-line observation policy **after fixing/testing the collector**:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com; form-action 'self'; report-uri /public/csp-report
```

This is an intentionally permissive observation baseline for the current inline UI and external catalog imagery, not a strict final policy. Inventory reports, narrow image/media hosts and replace unsafe-inline with reviewed hashes/nonces or externalized scripts before proposing enforcement. A report-only frame-ancestors directive does not block framing; DENY provides that protection here. Preserve /gestao/'s existing enforced CSP and stricter same-origin referrer policy. Do not set or remove its Content-Security-Policy header using this public policy.

If collection is not ready, save the CSP change as a draft; the referrer and common security headers can be deployed separately. Never represent a collector that discards its input as monitored CSP. Browser-generated reports must be tested; the [CSP reporting specification](https://www.w3.org/TR/CSP3/#report-violation) describes delivery and reporting formats.

Use curl.exe -sSI (or browser Network) on /, /checkout.html, /pages/contact.html, /product.html and /gestao/. Ensure one expected value per header, correct MIME types with nosniff, retained dashboard CSP, and no lost session cookie. Check private/API/Worker responses directly: rule existence alone is not proof of effective headers on every response path. Browser-test fonts, Turnstile, reviews/uploads/videos, newsletter, checkout redirect and WhatsApp. Inspect www redirect behavior independently; Worker routes in the current config target the apex host.

## WAF rate limits: exact dashboard setup

Open the zone's **Security → Security rules → Create rule → Rate limiting rules**. Select the expression below, characteristic **IP**, the threshold/period, action **Block**, duration **10 seconds**, then Deploy. Avoid JavaScript challenges on JSON fetch endpoints. Use a JSON HTTP 429 custom response if the current plan exposes that option; otherwise the frontend must handle any non-2xx response without assuming JSON. [Cloudflare dashboard instructions](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/).

Check the zone plan before creating rules. Current documentation gives Free one rule, path-based expressions and ten-second periods; Pro two rules and host/path expressions; HTTP method is available in rate-limit expressions on Business and higher. Therefore do not paste a host-and-method expression into a Free rule. [Cloudflare plan availability](https://developers.cloudflare.com/waf/rate-limiting-rules/#availability).

### Free plan: one combined rule

Name: AH checkout and shipping rate limit. Expression:

```text
http.request.uri.path in {"/create-checkout-session" "/shipping-quote"}
```

Threshold **20 requests per 10 seconds per IP**, Block **10 seconds**. Both paths share the per-IP counter. On Free this necessarily includes all methods and hostnames in the zone; it does not match /webhook. Review shared-network false positives before tightening. Do not call this two independently tuned rules.

### Pro or higher: two separate rules

Name: AH checkout rate limit. Expression:

```text
(http.host eq "asheerahhair.com" and http.request.uri.path eq "/create-checkout-session")
```

Threshold **5 requests per 10 seconds per IP**, Block **10 seconds**.

Name: AH shipping quote rate limit. Expression:

```text
(http.host eq "asheerahhair.com" and http.request.uri.path eq "/shipping-quote")
```

Threshold **30 requests per 10 seconds per IP**, Block **10 seconds**.

Business or higher may append `and http.request.method eq "POST"` inside each expression. Do not apply either rule to /webhook, /management-api/, payment-provider callbacks or static assets. Validate thresholds against normal country/fulfillment changes, multiple tabs and shared-network customers. Tune from aggregate traffic and Security Events; do not flood the live checkout to test limits. Use an isolated hostname/Worker and fake provider calls for threshold verification.

### Additional protection required for AH-SEC-09

The two requested rules do not protect /public/chat-log or /public/subscribe. Add enforced Worker admission limits and a global bounded downstream mail/write budget; browser Origin checks are not bot authentication. If Free only has one available edge rule, a temporary broader combined path set can also include those two public paths, but all counters then share one threshold and this alone does not satisfy a durable global budget. Do not consume a nonexistent extra plan slot or claim the chat finding is closed by checkout rules.

## Final acceptance and production command gate

1. Fix the reported defects; add real contract, abuse and compatibility regression tests.
2. Integrate the corrected security branch with latest main and rerun `node --test tests/*.test.cjs`; preserve the dashboard session-compatibility and mobile changes.
3. Complete the staged GAS checks and record the active deployed versions and signing compatibility, without disclosing secrets.
4. Run `npx.cmd wrangler deploy --dry-run` from backend; inspect the intended name/routes/bindings and preserve cron/secrets.
5. Only after those gates pass: merge the reviewed final commit into main and run `npx.cmd wrangler deploy` from the final integrated backend. Wait for GitHub Pages publication separately; Worker deployment does not publish frontend files.
6. Recheck live headers/rules, non-writing auth rejections, permitted customer flows, accounting acknowledgements, private dashboard ingestion and authorized email delivery. Record failures honestly and reconcile retained needs_review records.

The current review authorizes none of these checks as already completed in production. The only completed deployment-related build check is the local Wrangler dry run described in the peer review.
