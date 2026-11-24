# Historical local preview

The standalone prototype has been superseded by the actual existing dashboard and Worker integration. Use [DASHBOARD_CUSTOMER_READINESS.md](DASHBOARD_CUSTOMER_READINESS.md) for the current implementation, reproduction steps, evidence and activation gates. Checkout and its automatic customer PDF remain unchanged.

The old synthetic preview is preserved only in this worktree under ignored `tmp/legacy-dashboard-preview/`; it is excluded from the publication patch and is not required by tests. To inspect it separately, run `node tmp/legacy-dashboard-preview/backend/local-dashboard-tracking.cjs` from the worktree root and open its loopback URL. It uses fictional records, memory-only state and a fake provider.

Current production-facing modules do not import that preview. Test fixtures live in `tests/helpers/dashboard-synthetic.cjs`, without an HTTP listener or demo authentication endpoint. The actual Worker local runtime harness is `tests/local-dashboard-worker.mjs`, used only by the isolated test configuration.
