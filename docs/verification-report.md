# Verification report — owner hosting readiness

**Mission:** `vygo-owner-hosting-readiness`  
**Date (UTC):** 2026-07-12  
**Repository:** `southu/vygo`  
**Branch:** `main`  
**Scope:** Documentation, CI test step, Prettier normalization for format-check; no live Vercel/Railway production configuration or claims.

**Host note:** Local verification used Node from the environment; package engines declare `24.x` (see `.nvmrc`). Where noted, readiness generation was confirmed under Node **24.18.0** so `ready=true` (runtime must match active LTS). CI uses Node 24 via `actions/setup-node` + `.nvmrc`.

---

## Command results

| #   | Command                                                                   | Purpose                                                                 | Final exit result                                                                                                                      |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install --frozen-lockfile`                                          | Clean install from committed lockfile                                   | **0 (pass)**                                                                                                                           |
| 2   | `pnpm secret-scan`                                                        | Block obvious committed secrets                                         | **0 (pass)** — `secret-scan: passed (no repository secrets detected)`                                                                  |
| 3   | `pnpm lint`                                                               | ESLint across monorepo                                                  | **0 (pass)**                                                                                                                           |
| 4   | `pnpm format` then `pnpm format:check`                                    | Prettier write + check                                                  | **0 (pass)** after formatting docs and pre-existing style drift in a few app/test files                                                |
| 5   | `pnpm typecheck`                                                          | TypeScript project references                                           | **0 (pass)** — all workspace packages/apps with `typecheck`                                                                            |
| 6   | `pnpm test:email`                                                         | Email package unit/render tests                                         | **0 (pass)** — 4 tests passed                                                                                                          |
| 7   | `pnpm test`                                                               | Email + API suites                                                      | **0 (pass)** — email 4/4; API integration **46/46** passed (local Postgres available)                                                  |
| 8   | `pnpm readiness -- --assume-passed`                                       | Machine readiness JSON (with CI-like assume flags)                      | **0 (pass)**; under Node 24.18.0: **`ready=true`**. Under Node 25.x runtime: exit 0 but `ready=false` (runtime LTS mismatch by design) |
| 9   | `pnpm build`                                                              | Production builds (`@vygo/web` export + api/worker `tsc`)               | **0 (pass)**                                                                                                                           |
| 10  | `DATABASE_URL=postgresql://vygo:vygo@localhost:5432/vygo pnpm db:migrate` | Apply checked-in Drizzle SQL migrations                                 | **0 (pass)** — `{"ok":true,"action":"migrate"}`                                                                                        |
| 11  | `pnpm check`                                                              | Alias: lint + format:check + typecheck                                  | **0 (pass)** (components verified individually after format fix)                                                                       |
| 12  | `pnpm ci:verify`                                                          | Root aggregate (secret-scan, lint, format, typecheck, readiness, build) | Represented by steps 2–5, 8–9; CI workflow also runs `pnpm test:email`                                                                 |

### Optional / environment-dependent

| Command                   | Result                           | Notes                                                                       |
| ------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `pnpm test:integration`   | Covered by `pnpm test` API suite | Requires `DATABASE_URL_TEST` / local Postgres; passed in this environment   |
| `pnpm test:e2e`           | **Not run** in this pass         | Playwright e2e; optional local/browser; not required by current CI workflow |
| Live Vercel deploy smoke  | **Not run**                      | Production not configured or claimed                                        |
| Live Railway deploy smoke | **Not run**                      | Production not configured or claimed                                        |

---

## CI representation

File: `.github/workflows/ci.yml`

On `push`/`pull_request` to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm secret-scan`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm typecheck`
6. `pnpm test:email` ← automated package tests for regression coverage
7. `pnpm readiness -- --assume-passed` (with step env flags)
8. `pnpm build`

This provides regression coverage for existing core email render flows and production build checks. Full API integration tests run locally/`pnpm test` when Postgres is available; they are not yet a required CI job (owner may add a Postgres service container later).

---

## Tree / safety checks (this pass)

| Check                              | Result                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `external-docs/` absent from tree  | **Yes** (gitignored; not present)                                  |
| `version.txt` added or modified    | **No** — file not present; not touched                             |
| `pnpm-lock.yaml` committed         | **Yes** (unchanged this mission)                                   |
| CI workflow committed              | **Yes** (updated to include `test:email`)                          |
| Secrets / private keys in new docs | **None** — examples and placeholders only; `pnpm secret-scan` pass |
| Live production deploy claimed     | **No** — docs state hosting not configured/claimed                 |

---

## Summary

All applicable lint, format, typecheck, unit/integration tests available in this environment, build, migration, and secret-scan commands completed with **exit code 0** after in-scope Prettier fixes. Documentation and owner launch inventory for owner-managed hosting are committed. **No live Vercel or Railway production deployment was configured or claimed.**
