# Verification report — Railway production verification

**Mission:** `vygo-railway-production-verification`
**Date (UTC):** 2026-07-12
**Repository:** `southu/vygo`
**Branch:** `main`
**Scope:** Prepare and verify the vygo API + worker for production on Railway.
Run the repository-defined install, lint, typecheck, test, migration, and
production-build commands; scan for accidental secrets; verify the deployment
configuration; and capture the exact, un-fabricated state of the Vault-gated
Railway deployment.

**Toolchain:** pnpm 9.15.9 (pinned via `packageManager`). `engines.node` /
`.nvmrc` request Node 24.x; CI runs Node 24 via `actions/setup-node`. This local
verification pass ran on Node 25.x (`engine-strict=false`), which only emits a
non-fatal "Unsupported engine" warning — every command below still exits 0.

---

## Deployment status (headline)

**The Railway production deployment is blocked by an explicitly verified,
fail-closed Vault condition — not by any repository defect.** The Vault consumer
that would release a scoped Railway token is **not armed** in this builder, so
provisioning fails closed by design (`scripts/provision-railway.ts`) rather than
inventing infrastructure. No live Railway results are fabricated in this report.

| Signal                                  | Verified value                                                   |
| --------------------------------------- | ---------------------------------------------------------------- |
| `pnpm provision` outcome (local)        | `ok=false`, `outcome=failed_closed`, `code=consumer_not_armed`   |
| Live `GET /api/provision` (www.vygo.ai) | `ok=false`, `outcome=failed_closed`, `code=consumer_not_armed`   |
| Emitted `project_id`                    | `null` (never fabricated on a closed failure)                    |
| Railway API domain `api.vygo.ai`        | Does **not** resolve — no live Railway API is deployed yet       |
| Railway services created                | None by this builder (allowlist `[vygo]`, destroy hard-disabled) |

Per the mission acceptance criteria, this is the one sanctioned blocker
(criterion 14): the exact fail-closed Vault state is captured, no live results
are invented, and all local checks + deploy configuration are otherwise complete
and buildable. A follow-on run with an armed Vault consumer completes
provisioning and the live Railway checks without any further code change.

---

## Local command results (this iteration)

| #   | Command                           | Purpose                                    | Result                                                                         |
| --- | --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | `pnpm install --frozen-lockfile`  | Deterministic install from the lockfile    | **0 (pass)** — resolved 304 packages, no lockfile drift                        |
| 2   | `pnpm secret-scan`                | Block accidental committed credentials     | **0 (pass)** — `secret-scan: passed (no repository secrets detected)`          |
| 3   | `pnpm lint`                       | ESLint across the monorepo                 | **0 (pass)** — no findings                                                     |
| 4   | `pnpm format:check`               | Prettier verification                      | **0 (pass)** — all matched files use Prettier code style                       |
| 5   | `pnpm typecheck`                  | TypeScript across all workspace projects   | **0 (pass)** — 9 projects, all `Done`                                          |
| 6   | `pnpm test`                       | email + edge + API suites                  | **0 (pass)** — **50/50 tests, 16 suites, 0 fail**                              |
| 7   | `pnpm db:migrate` (real Postgres) | Apply checked-in Drizzle migrations        | **0 (pass)** — `{"ok":true,"action":"migrate"}`, idempotent on re-run          |
| 8   | `pnpm build`                      | Production build (web export + api/worker) | **0 (pass)** — web static export (16 routes) + api/worker `tsc` all `Done`     |
| 9   | `pnpm provision`                  | Vault Provisioner (fail-closed by design)  | **fail-closed, exit 0** — `consumer_not_armed`, no services, `project_id=null` |

**Migration detail (item 7):** run against a throwaway local PostgreSQL instance
with `DATABASE_URL` set. The three ordered migrations (`0000_init` →
`0001_email_worker` → `0002_waitlist_source`) applied cleanly, creating the six
production tables (`waitlist_entries`, `email_outbox`, `email_events`,
`submission_idempotency`, `site_availability`, `worker_heartbeats`) and recording
3 rows in `drizzle.__drizzle_migrations`. A second run was a no-op, confirming
idempotency for a safe production release migration.

---

## Deployment-configuration checks (local, code-level)

All backend deployment configuration is present and correct for the moment the
Vault is armed:

| Area                     | Verified state                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Container image          | Root `Dockerfile` builds both API + worker from one image; each Railway service overrides the start command.     |
| API service config       | `railway.toml` — `DOCKERFILE` build, `pnpm --filter @vygo/api start`, healthcheck `/healthz`.                    |
| Worker service config    | `deploy/railway/worker/railway.toml` — separate service, worker start command, own healthcheck.                  |
| Postgres persistence     | `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` reference; `/readyz` gates on Postgres + required migrations.      |
| Redis (worker-backed)    | `REDIS_URL` = `${{Redis.REDIS_URL}}` reference; API rate-limit store probes Redis and reports via `/health`.     |
| CORS allowlist           | `apps/api/src/cors.ts` reflects only the exact marketing origins + configured `CORS_ORIGINS` + vygo previews.    |
| No `*` wildcard          | ACAO is never `*`; unapproved origins receive no permissive allow-origin header.                                 |
| Frontend stays on Vercel | `provision.json` `frontend.isRailwayService=false`; no Railway service hosts the marketing frontend.             |
| Version identity         | `/version` derives from `VERCEL_GIT_COMMIT_SHA`/`COMMIT_SHA`/CI SHA at deploy — not the committed `version.txt`. |

The CORS allowlist was exercised in unit tests and against the live edge (below):
an allowed origin is reflected exactly; an unapproved origin is refused.

---

## Live surface evidence (www.vygo.ai — Vercel edge; redacted, non-secret)

These surfaces are the **Vercel marketing edge mirror**, not the Railway backend.
They are reported here only as objective, un-fabricated observations. No secret,
connection string, SQL, or stack trace appears on any path.

| Probe                                      | Observed result                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `GET /version`                             | `200`, body = deployed SHA (`75a8a96…`), matching `main` HEAD at capture time.  |
| `GET /healthz`                             | `200` — liveness JSON.                                                          |
| `GET /readyz`                              | `200` but `database: not_configured` — no production Postgres attached to edge. |
| `POST /v1/waitlist` (unique email)         | `200`, `{accepted:true, applicationId:…}` — edge **fail-soft**, non-durable.    |
| CORS preflight from `https://www.vygo.ai`  | `204` + `access-control-allow-origin: https://www.vygo.ai`.                     |
| CORS preflight from `https://evil.example` | `204` + **no** allow-origin header (correctly refused).                         |
| `GET /api/provision`                       | `ok=false, outcome=failed_closed, code=consumer_not_armed` (matches local).     |
| `https://api.vygo.ai/healthz`              | Host does not resolve — the Railway API is not deployed.                        |

**Interpretation (no fabrication):** because `DATABASE_URL` is not attached to the
edge, the marketing waitlist function fails soft into a process-local, non-durable
store — it acknowledges submissions but does **not** prove production Postgres
persistence. Durable persistence, real Redis-backed worker readiness, and the live
Railway `/healthz`/`/readyz` require the Railway API + worker + Postgres + Redis
services, which are gated behind the armed Vault consumer.

---

## Secret / safety checks

| Check                                       | Result                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm secret-scan` over tracked files       | **pass** — no repository secrets detected                         |
| Provisioner self-scan of emitted artifact   | **pass** — `detectedSecrets: 0`, names-only policy                |
| `version.txt` hand-modified to game version | **No** — deploy identity comes from the deploy-SHA env var        |
| Plaintext credentials/tokens in evidence    | **None** — all evidence is public URLs, env **names**, and status |
| Committed Railway token / vault key         | **None** — builder holds no token; provisioner reads names only   |

---

## Acceptance-criteria mapping

| #      | Criterion                                                            | Status this iteration                                                          |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1–2, 6 | Live Railway `/healthz`, `/readyz`, worker/Redis                     | **Blocked** — no Railway API deployed (Vault fail-closed). Not fabricated.     |
| 3      | `/version` matches deployed `main`                                   | Web edge `/version` matches HEAD; refreshes on the Vercel deploy of this push. |
| 4–5    | Live waitlist accept + Postgres persistence                          | **Blocked** — edge fails soft; durable Postgres needs the Railway API.         |
| 7      | CORS allows configured marketing origin                              | **Pass** on the edge; API CORS code enforces the same allowlist.               |
| 8      | CORS rejects unapproved origin                                       | **Pass** on the edge; API CORS code emits no ACAO for unapproved origins.      |
| 9      | Core routes over HTTPS, not marketing HTML                           | **Pass** — health/version/waitlist return JSON/plain text, not the site HTML.  |
| 10     | Railway inventory: API+worker+PG+Redis, no frontend                  | **Blocked** — project not provisioned; config declares exactly this topology.  |
| 11     | Deploy from approved composer flow + pushed `main`                   | **Pending** — this push updates `main`; Railway deploy awaits armed Vault.     |
| 12     | Repo commands (install→build) all pass                               | **Pass** — see local command results above.                                    |
| 13     | No accidental credentials; evidence redacted                         | **Pass** — secret-scan + self-scan clean; evidence is non-secret.              |
| 14     | If blocked: exact fail-closed Vault state, no fabrication, buildable | **Satisfied** — this report is that evidence.                                  |

---

## Summary

Every repository command — install, secret-scan, lint, format, typecheck, tests
(50/50), migrations (against a real Postgres, idempotent), and the production
build — completes with **exit code 0**. The backend deployment configuration
(Dockerfile, `railway.toml`, worker config, Postgres/Redis references, CORS
allowlist, Vercel-only frontend) is complete and correct. The **sole** remaining
blocker to live Railway verification is the explicitly verified, fail-closed
Vault condition (`consumer_not_armed`): no Railway token is armed in this builder,
so provisioning fails closed and no live Railway results are invented. The
repository is buildable and ready to deploy the instant an armed Vault consumer
runs the same, unchanged flow.
