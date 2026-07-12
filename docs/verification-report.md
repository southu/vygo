# Verification report — owner hosting readiness

**Mission:** `vygo-owner-hosting-readiness`  
**Date (UTC):** 2026-07-12  
**Repository:** `southu/vygo`  
**Branch:** `main`  
**Scope:** Owner-managed hosting documentation, CI representation, lockfile, ops
runbooks, credential/decision inventory, and launch checklist. Live Vercel and
Railway production deployments were **not** configured or claimed.

**Runtime:** Node **24.18.0** (via `/opt/homebrew/opt/node@24`, matching
`.nvmrc` / `engines.node` `24.x`) and **pnpm 9.15.9**. CI uses Node 24 via
`actions/setup-node` + `.nvmrc`.

---

## Command results

| #   | Command                                                                   | Purpose                                                               | Final exit result                                                     |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `pnpm install --frozen-lockfile`                                          | Clean install from committed lockfile                                 | **0 (pass)**                                                          |
| 2   | `pnpm secret-scan`                                                        | Block obvious committed secrets                                       | **0 (pass)** — `secret-scan: passed (no repository secrets detected)` |
| 3   | `pnpm lint`                                                               | ESLint across monorepo                                                | **0 (pass)**                                                          |
| 4   | `pnpm format:check`                                                       | Prettier check                                                        | **0 (pass)** — all matched files use Prettier code style              |
| 5   | `pnpm typecheck`                                                          | TypeScript across workspace packages/apps                             | **0 (pass)**                                                          |
| 6   | `pnpm test:email`                                                         | Email package unit/render tests                                       | **0 (pass)** — 4 tests passed                                         |
| 7   | `pnpm test`                                                               | Email + API suites                                                    | **0 (pass)** — email 4/4; API integration **46/46** (local Postgres)  |
| 8   | `pnpm readiness -- --assume-passed`                                       | Machine readiness JSON (CI-like assume flags)                         | **0 (pass)** — under Node 24.18.0: **`ready=true`**                   |
| 9   | `pnpm build`                                                              | Production builds (`@vygo/web` export + api/worker `tsc`)             | **0 (pass)**                                                          |
| 10  | `DATABASE_URL=postgresql://vygo:vygo@localhost:5432/vygo pnpm db:migrate` | Apply checked-in Drizzle SQL migrations                               | **0 (pass)** — `{"ok":true,"action":"migrate"}`                       |
| 11  | `pnpm check`                                                              | Alias: lint + format:check + typecheck                                | **0 (pass)**                                                          |
| 12  | `pnpm ci:verify`                                                          | Aggregate secret-scan → lint → format → typecheck → readiness → build | Represented by steps 2–5, 8–9; CI also runs `pnpm test:email`         |

### Optional / environment-dependent

| Command                   | Result                           | Notes                                                                       |
| ------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `pnpm test:integration`   | Covered by `pnpm test` API suite | Requires `DATABASE_URL_TEST` / local Postgres; **46/46** passed here        |
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
6. `pnpm test:email` — automated package tests for regression coverage of core email render flows
7. `pnpm readiness -- --assume-passed` (with step env flags)
8. `pnpm build` — production build checks

This provides regression coverage for existing core email flows and production
build checks. Full API integration tests (`pnpm test` / `pnpm test:integration`)
run when Postgres is available; they are not yet a required CI job (owner may add
a Postgres service container later).

---

## Tree / safety checks (this pass)

| Check                             | Result                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| `external-docs/` absent from tree | **Yes** (gitignored; not present; not tracked)                     |
| `version.txt` added or modified   | **No** — file not present; not touched by this mission             |
| `pnpm-lock.yaml` committed        | **Yes**                                                            |
| CI workflow committed             | **Yes** (includes `test:email` + build)                            |
| Secrets / private keys in docs    | **None** — examples and placeholders only; `pnpm secret-scan` pass |
| Live production deploy claimed    | **No** — docs state hosting not configured/claimed                 |

---

## Documentation inventory (committed under `docs/`)

| Doc                            | Owner-hosting topics covered                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `deployment.md`                | Exact Vercel + Railway setup; staging vs prod; migrations; release checks; non-claims     |
| `email-and-resend.md`          | Domain/DNS, sender, webhooks, events, failed-email recovery                               |
| `turnstile.md`                 | Local / staging / production site + secret keys                                           |
| `backups.md`                   | Schedule, retention, restore, restore-test evidence fields                                |
| `content-operations.md`        | Content ops, availability updates, waitlist export/deletion, email recovery pointer       |
| `incident-response.md`         | Severity, detection, containment, rollback, communications, recovery, post-incident       |
| `owner-launch-checklist.md`    | Ordered checklist: accounts → DNS → credentials → services → migrations → verify → launch |
| `credentials-and-decisions.md` | Full credential inventory + flagged owner decisions (claims, SLA, equity, legal)          |
| `verification-report.md`       | This file — exact commands and exit results                                               |
| `api.md`                       | API contracts (supporting ops)                                                            |

Root `README.md` documents prerequisites, installation, environment setup, local
web/API/worker startup, migrations, and the complete verification command sequence.

---

## Summary

All applicable lint, format, typecheck, unit/integration tests available in this
environment, build, migration, and secret-scan commands completed with **exit
code 0**. Documentation, credential/decision inventory, owner launch checklist,
CI configuration, and verified lockfile are committed. **No live Vercel or
Railway production deployment was configured or claimed.**
