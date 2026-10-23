# Dashboard inactivity logout

The private orders dashboard and newsletter editor default to a 15-minute idle timeout. The security panel at the bottom of either page offers 5, 15 or 30 minutes for the current login session. It cannot disable expiry. A modal warns in the last minute with Continue session / Sign out now. Existing eight-hour absolute expiry still applies.

`management-auth.cjs` checks the idle deadline on every private API authorization. `/management-api/auth/session` accepts same-origin JSON POST only. Passive checks and orders/newsletter refreshes do not extend it; an explicit activity heartbeat does. The server refuses to revive expired sessions. Session updates use conditional writes; revocation prevents in-flight updates from recreating a deleted session. Older sessions inherit the default from their original creation time, so unattended sessions may require a new login on rollout.

`gestao/session.js` tracks pointer, keyboard, wheel and touch interaction, batches heartbeats, and shares timeout/settings/logout across same-origin tabs with BroadcastChannel where supported. Background tabs and browser sleep use elapsed wall time. The interface clears private content at expiry even if logout cannot reach the network; server idle expiry independently blocks further API access. This does not cancel orders, campaigns already queued, or background business processing. No customer data or session tokens are saved in browser storage.

Unsaved edits are not automatically saved at logout. Choose Continue session in the warning, then save the work. The newsletter editor clears its fields and returns to sign-in on expiry.

Validation: server authentication/idle/absolute-expiry tests, browser-controller tests for passive polling, warning, continue, offline expiry and another-tab logout, plus the complete checkout/order/newsletter regression suite. UI previews use a loopback-only synthetic server and no real customer records or messages.

Release sequencing: deploy the Worker session endpoint and idle checks, then publish both static session assets and page references immediately. An already-open page needs reloading to receive the new warning UI; the server still enforces its deadline after Worker rollout. Sessions already idle for 15 minutes may need a fresh login.

## Release status on 23 October 2026

Implementation commit: `9f5961a`. All 192 tests passed; Wrangler build passed. Worker version `e6d052cf-d35b-4198-a765-b32d5df1d6de` briefly deployed; unsigned session/orders requests both returned 401. Automatic approval review rejected the production frontend push because it requires explicit publication approval. The immediately preceding complete Worker version, `fada0937-00b1-420e-81c8-b64434ef6025`, was restored successfully to avoid expiring actively used old pages without activity heartbeats. The feature is not currently active in production. Frontend publication and reactivation of the new Worker await the user's specific approval.

Visual verification was attempted with a loopback-only synthetic preview. Brave returned `ERR_BLOCKED_BY_CLIENT`; its protection was not disabled. Browser-controller and server regression tests passed, but responsive visual acceptance is still outstanding.

The user subsequently explicitly approved production publication. Frontend commit `11edf57` was published and built successfully; Worker `7be82885-4de2-4705-b75d-040b1e8e5490` was deployed. Live unsigned/forged session requests returned 401 and cross-origin requests returned 403. Pre-publication probes cached 404s for the initial session asset keys; fresh `20261023-idle-live2` URLs returned 200 and the page references were updated accordingly. Session enforcement and frontend are now released; the earlier pending/rollback status above records the initial attempt only.
