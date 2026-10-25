# Checkout checks every ten minutes

The existing Cloudflare Worker schedule remains `*/10 * * * *`. Its scheduled handler also runs `checkout-monitor.cjs`. No extra computer, browser login or scheduled task is needed for the server-side checks after deployment.

## What it checks

- Both configured accounting destinations accept the existing signed, non-writing `security_probe`, containing a fixed accented character, em dash and emoji. Duplicate destinations share a request.
- The existing Stripe credential can read its account using `GET /v1/account`.
- The configured catalogue responds with an EUR product catalogue, populated variant lists, and finite positive selling prices.
- Up to 200 archived business records are read for Stripe attempts that have remained unfinished without a session reference for between five minutes and 24 hours, or checkout-start failures recorded in the last 24 hours. Only counts are retained. A partial scan is explicitly unknown and cannot prove that no anomalies exist.

Each external check has a deadline that includes the response body. The normal deadline is eight seconds; `CHECKOUT_MONITOR_TIMEOUT_MS` permits a bounded test override from 10 to 15000 milliseconds. A missing configuration or rejected request is degraded. Incomplete coverage or inability to store a current result is unknown.

## Where the evidence lives

Private R2 bucket binding `REVIEW_MEDIA` contains:

- `monitoring/checkout/latest.json`: the latest successfully stored report.
- `monitoring/checkout/history/000.json` through `143.json`: a fixed ring of at most 144 reports, covering approximately one day of ten-minute checks.

Reports contain a timestamp, narrow check results, sanitized reason categories, timings, failure streak and coverage limits. They contain no customer details, order IDs, provider response bodies, secret values or endpoint URLs. No monitoring record is exposed as a public route. Cloudflare logs receive only a sanitized status line.

## Hermes and the specialist reviewer

Hermes or an authorized local reviewer can read the latest snapshot with the already configured Cloudflare identity:

```powershell
npx wrangler r2 object get 'asheerah-hair-review-media/monitoring/checkout/latest.json' --remote --file '<private-local-path>/checkout-monitor-latest.json'
```

Reject a snapshot older than 20 minutes as stale. Escalate two consecutive degraded reports, any stale monitor, or repeated unknown reports to the independent incident coordination issue `jashe1728/hermes-antigravity-bridge#29`. Include only check names, safe reason categories, timestamps, coverage and failure streak. Do not copy credentials or order data into a mailbox issue.

This module does not send external alerts, invoke an LLM, open issues or deploy repairs. A separate Hermes/local specialist schedule must be configured and verified before claiming automated agent escalation is active. The parent incident task owns that configuration and any notification destination.

## What these checks cannot prove

Reading the Stripe account does not prove the key can create a Checkout Session. A signed accounting probe does not prove sheet append permissions or quota. Catalogue shape does not prove every product can be purchased. No live checkout, payment, accounting row, receipt or customer email is created by the monitor. A staging checkout test and human review are still needed for end-to-end payment acceptance. Monitoring reduces detection delay; it cannot guarantee that outages never happen.

## Validation

`node --test tests/checkout-monitor.test.cjs` exercises real local signature verification with Unicode, rejection, a response-body hang, Stripe authentication failure, bad catalogue shape, private-data exclusion, bounded partial scans, storage failure and bounded history retention. The scheduled-handler integration leaves existing jobs and the schedule unchanged.
