Pipeline smoke healthy at 2026-07-16T00:19:30Z.

Apply E2E live DB check (mission `vygo-apply-e2e-live-db-check`): valid form submit persists to Railway Postgres `applications`; invalid email is rejected with inline validation and creates zero rows. Evidence: `docs/apply-e2e-live-db-check.md` and non-secret query metadata at `/api/railway-db-query-method.json`. Test rows left in place (`Ratchet E2E Test` / `e2e-test+…@vygo.ai`). Vault Provisioner consumer is the only credential path.
