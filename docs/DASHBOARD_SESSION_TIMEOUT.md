# Dashboard inactivity logout

The private orders dashboard and newsletter editor default to a 15-minute idle timeout. The security panel at the bottom of either page offers 5, 15 or 30 minutes for the current login session. It cannot disable expiry. A modal warns in the last minute with Continue session / Sign out now. Existing eight-hour absolute expiry still applies.

`management-auth.cjs` checks the idle deadline on every private API authorization. `/management-api/auth/session` accepts same-origin JSON POST only. Passive checks and orders/newsletter refreshes do not extend it; an explicit activity heartbeat does. The server refuses to revive expired sessions. Session updates use conditional writes; revocation prevents in-flight updates from recreating a deleted session. Older sessions inherit the default from their original creation time, so unattended sessions may require a new login on rollout.

`gestao/session.js` tracks pointer, keyboard, wheel and touch interaction, batches heartbeats, and shares timeout/settings/logout across same-origin tabs with BroadcastChannel where supported. Background tabs and browser sleep use elapsed wall time. The interface clears private content at expiry even if logout cannot reach the network; server idle expiry independently blocks further API access. This does not cancel orders, campaigns already queued, or background business processing. No customer data or session tokens are saved in browser storage.

Unsaved edits are not automatically saved at logout. Choose Continue session in the warning, then save the work. The newsletter editor clears its fields and returns to sign-in on expiry.

Validation: server authentication/idle/absolute-expiry tests, browser-controller tests for passive polling, warning, continue, offline expiry and another-tab logout, plus the complete checkout/order/newsletter regression suite. UI previews use a loopback-only synthetic server and no real customer records or messages.

Release sequencing: deploy the Worker session endpoint and idle checks, then publish both static session assets and page references immediately. An already-open page needs reloading to receive the new warning UI; the server still enforces its deadline after Worker rollout. Sessions already idle for 15 minutes may need a fresh login.
