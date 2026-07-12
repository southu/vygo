# Deployment (owner-managed)

> **Hosting status:** Live Vercel production deployment was **not** configured
> or claimed by this repository work. Live Railway production deployment was
> **not** configured or claimed. The steps below are exact owner-managed setup
> instructions. Complete them only when the owner is ready to host.

## Overview

| Component              | Intended platform | Notes                                            |
| ---------------------- | ----------------- | ------------------------------------------------ |
| Web (`apps/web`)       | **Vercel**        | Next.js static export / monorepo root            |
| API (`apps/api`)       | **Railway**       | Fastify service                                  |
| Worker (`apps/worker`) | **Railway**       | Separate service from API                        |
| PostgreSQL             | **Railway**       | Shared by API + worker                           |
| Redis                  | **Railway**       | Rate limits / cache (API)                        |
| Email provider         | **Resend**        | See [email-and-resend.md](./email-and-resend.md) |
| Bot protection         | **Turnstile**     | See [turnstile.md](./turnstile.md)               |

Do **not** use `version.txt` for deploy identity. Web `GET /version` reads
`VERCEL_GIT_COMMIT_SHA` / `COMMIT_SHA` / CI SHA env vars.

---

## Web — exact Vercel setup

**Live Vercel production deployment was not configured or claimed.**

1. Create or sign in to a Vercel account owned by the business/owner.
2. Import GitHub repository `southu/vygo` (or the owner’s fork) into a new Vercel project.
3. Project settings:
   - **Root Directory:** repository root (use root `vercel.json`; do not set root to `apps/web` unless you intentionally diverge from the checked-in config).
   - **Framework preset:** leave as configured by `vercel.json` (`framework: null` with explicit build/output) or Next.js if the dashboard requires a preset — the install/build/output commands below must match.
   - **Node.js version:** **24** (matches `.nvmrc`).
   - **Install command:** `pnpm install --frozen-lockfile`
   - **Build command:** `pnpm --filter @vygo/web build`
   - **Output directory:** `apps/web/out` (static export; matches `vercel.json`).
4. Create **two** Vercel environments (or two projects) for **staging** and **production** (see [Staging vs production](#staging-vs-production)).
5. Configure environment variables per environment (web):

   | Variable                         | Staging                        | Production                    | Notes                          |
   | -------------------------------- | ------------------------------ | ----------------------------- | ------------------------------ |
   | `NEXT_PUBLIC_APP_URL`            | `https://staging.example.com`  | `https://vygo.ai` (owner DNS) | Public site origin             |
   | `NEXT_PUBLIC_API_URL`            | Staging API origin             | Production API origin         | No trailing slash              |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Staging Turnstile site key     | Production Turnstile site key | Public; never put secrets here |
   | `COMMIT_SHA`                     | Usually unset (Vercel injects) | Usually unset                 | Fallback if needed             |

   Vercel automatically injects `VERCEL_GIT_COMMIT_SHA` for `GET /version`.

6. Domains (owner DNS):
   - Staging: e.g. `staging.vygo.ai` (owner chooses).
   - Production: e.g. `vygo.ai` / `www.vygo.ai` (owner chooses; not claimed here).
7. Deploy by pushing to the branch connected for that environment (owner configures git integration). Verify after deploy:

   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" "https://<web-host>/"
   curl -sS "https://<web-host>/version"
   curl -sS "https://<web-host>/api/readiness"
   ```

8. Confirm `/version` SHA matches the intended git commit before calling a release done.

### Waitlist persistence on the edge (Vercel serverless function)

The marketing site is a static export, so the public waitlist submit path is
served by a Vercel Serverless Function committed at
[`api/waitlist.ts`](../api/waitlist.ts) (workspace package `@vygo/edge`). The
root [`vercel.json`](../vercel.json) rewrites the documented `POST /v1/waitlist`
onto `/api/waitlist`, so the browser form on `www.vygo.ai` persists directly to
Postgres from the same origin — no separate API host is required for intake.

The function validates input, performs an atomic
`INSERT … ON CONFLICT (email) DO UPDATE` upsert into the shared
`waitlist_entries` table (safe duplicate handling — never a duplicate row or a
server error), and returns only PII- and secret-safe bodies (no connection
string, SQL, stack trace, or credential on any path, including database
failures).

1. **Attach Postgres and set the connection string.** Add Vercel Postgres (or
   any Postgres) to the project and set `DATABASE_URL` (Vercel Postgres also
   exposes `POSTGRES_URL`, read as a fallback) as a **server-side** env var on
   Production and Preview. Never expose it as `NEXT_PUBLIC_*`. See
   [`api/.env.example`](../api/.env.example).
2. **Run the production migration command once** against that database before
   serving traffic (fresh, empty database supported):

   ```bash
   DATABASE_URL="$DATABASE_URL" pnpm db:migrate
   ```

   Output includes `{"ok":true,"action":"migrate"}`. This applies the checked-in
   ordered migrations under `packages/db/migrations/` (`0000_init` →
   `0001_email_worker` → `0002_waitlist_source`).

3. **Verify** after deploy:

   ```bash
   curl -sS -X POST "https://www.vygo.ai/v1/waitlist" \
     -H 'content-type: application/json' \
     -d '{"fullName":"Test User","email":"test@example.com","companyName":"Example",
          "productUrl":"https://example.com","stage":"prototype",
          "primaryBlocker":"reliability_scale","desiredStartWindow":"asap",
          "message":"Testing the intake flow.","privacyAccepted":true}'
   # → {"data":{"accepted":true,"applicationId":"…", … }}
   ```

If `DATABASE_URL` is not configured the function **fails soft**: it accepts and
records submissions in a process-local, non-durable store (with the same
email-uniqueness duplicate handling as Postgres) so the marketing form still
returns a genuine acknowledgement instead of a hard `503`. This is a degraded
mode only — attach Postgres and set `DATABASE_URL` (or `POSTGRES_URL`) for
durable persistence, which the function prefers automatically whenever it is
configured. No response on any path (success, validation, duplicate, or database
failure) leaks a connection string, credential, SQL, or stack trace.

The hardened Fastify intake on Railway (Turnstile, Redis rate limits,
transactional email outbox) remains the option for a full backend deployment and
shares the same migrations and data model.

---

## API, worker, PostgreSQL, Redis — exact Railway setup

**Live Railway production deployment was not configured or claimed.**

The backend targets **Railway project `vygo`**. For a secret-free readiness
summary (env **names** only, config stubs, and human attach steps) see
[railway-backend-readiness.md](./railway-backend-readiness.md) and the stubs in
[`deploy/railway/`](../deploy/railway/).

Create **separate** Railway projects (or clearly named environment groups) for
**staging** and **production**. Within each environment, create **four** services:

### 1. PostgreSQL service

1. In the Railway project, add a **PostgreSQL** plugin/service.
2. Copy the private `DATABASE_URL` (or `POSTGRES_URL`) into API and worker env.
3. Prefer Railway private networking URLs for service-to-service traffic.
4. Do not expose Postgres publicly unless required for admin; prefer Railway shell / one-off migrate jobs.

### 2. Redis service

1. Add a **Redis** plugin/service.
2. Set `REDIS_URL` on the **API** service (rate limiting). Worker may omit Redis if unused.
3. Keep Redis private to the project network.

### 3. API service (`apps/api`)

1. New service from the same GitHub repo (`southu/vygo`).
2. **Root directory:** repository root.
3. **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @vygo/api build`
4. **Start command:** `pnpm --filter @vygo/api start` (or `node apps/api/dist/index.js` after build paths are verified).
5. **Health check path:** `/healthz` (liveness) or `/readyz` (readiness after migrations). Composite ops check: `/health`.
6. Generate a public HTTPS domain (Railway default) or attach a custom domain (e.g. `api.staging.…` / `api.…`).
7. Set environment variables (see tables below). Critical:

   - `NODE_ENV=production` for production (and for staging if you treat it as prod-like; use `ENABLE_TEST_SURFACE=false` when not testing).
   - `PORT` — Railway often injects `PORT`; ensure the app binds to it (default in schema is `4000`).
   - `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS` (include the web origin(s)).
   - `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `IP_HASH_SALT`, salts/versions.
   - `EMAIL_FROM`, `LEAD_NOTIFICATION_EMAIL`.
   - `INLINE_EMAIL_WORKER` — **unset or false** when worker is a separate service.
   - `ENABLE_TEST_SURFACE=false` on production.

8. **Pre-deploy / release migration** (run once per environment before traffic):

   ```bash
   # From a one-off Railway shell or CI job with DATABASE_URL set to that environment
   pnpm install --frozen-lockfile
   DATABASE_URL="$DATABASE_URL" pnpm db:migrate
   ```

9. Verify:

   ```bash
   curl -sS "https://<api-host>/healthz"
   curl -sS "https://<api-host>/readyz"
   curl -sS "https://<api-host>/health"
   curl -sS "https://<api-host>/v1/public/availability"
   ```

### 4. Worker service (`apps/worker`)

1. New **separate** service from the same repo (do not run only inline worker in production).
2. **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @vygo/worker build`
3. **Start command:** `pnpm --filter @vygo/worker start`
4. Env: same `DATABASE_URL` as API, `RESEND_API_KEY`, `EMAIL_FROM`, `LEAD_NOTIFICATION_EMAIL`, `NODE_ENV`, worker tuning vars (`WORKER_POLL_INTERVAL_MS`, `WORKER_MAX_ATTEMPTS`, etc.).
5. No public HTTP domain required unless you add admin probes later.
6. Confirm worker heartbeats so API `GET /health` reports `emailWorker.ready: true`.

### Resend webhook URL

Point Resend’s webhook to:

```text
https://<api-host>/v1/webhooks/resend
```

Use the matching environment’s API host and `RESEND_WEBHOOK_SECRET`. Details:
[email-and-resend.md](./email-and-resend.md).

---

## Staging vs production

Treat staging and production as **objectively separate**: different domains,
service instances, databases, Redis instances, API keys, Turnstile key pairs,
webhook secrets, and CORS allowlists. Never point staging web at production API
or production web at staging API.

### Domains (examples — owner substitutes real hostnames)

| Role           | Staging example                       | Production example          |
| -------------- | ------------------------------------- | --------------------------- |
| Web            | `https://staging.vygo.ai`             | `https://vygo.ai`           |
| API            | `https://api.staging.vygo.ai`         | `https://api.vygo.ai`       |
| Resend webhook | `…/v1/webhooks/resend` on staging API | same path on production API |

### Environment variables (distinction)

| Variable / concern                 | Staging                                      | Production                                        |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `NODE_ENV`                         | `production` or `development` (owner choice) | `production`                                      |
| `DATABASE_URL`                     | Staging Postgres only                        | Production Postgres only                          |
| `REDIS_URL`                        | Staging Redis only                           | Production Redis only                             |
| `CORS_ORIGINS` / `ALLOWED_ORIGINS` | Staging web origin(s)                        | Production web origin(s)                          |
| `NEXT_PUBLIC_APP_URL`              | Staging web URL                              | Production web URL                                |
| `NEXT_PUBLIC_API_URL`              | Staging API URL                              | Production API URL                                |
| Turnstile site + secret            | Staging key pair                             | Production key pair (never reuse staging in prod) |
| `RESEND_API_KEY`                   | Staging/test domain or restricted key        | Production domain key                             |
| `RESEND_WEBHOOK_SECRET`            | Staging webhook signing secret               | Production webhook signing secret                 |
| `IP_HASH_SALT` (+ versions)        | Staging-only salts                           | Production-only salts; rotate independently       |
| `ENABLE_TEST_SURFACE`              | May be `true` for QA                         | **`false`**                                       |
| `INLINE_EMAIL_WORKER`              | Optional true only for single-process QA     | **false / unset** (dedicated worker service)      |
| `LEAD_NOTIFICATION_EMAIL`          | Internal test inbox                          | Real ops inbox                                    |
| `EMAIL_FROM`                       | Verified staging sender                      | Verified production sender                        |

Full credential inventory: [credentials-and-decisions.md](./credentials-and-decisions.md).

### Migration procedures

| Step | Staging                                             | Production                                  |
| ---- | --------------------------------------------------- | ------------------------------------------- |
| 1    | Deploy/migrate against staging `DATABASE_URL` first | Only after staging green                    |
| 2    | `DATABASE_URL=<staging> pnpm db:migrate`            | `DATABASE_URL=<production> pnpm db:migrate` |
| 3    | Smoke `/readyz`, waitlist dry-run, webhook test     | Same checks on production hosts             |
| 4    | Keep a backup snapshot before risky migrations      | Required — see [backups.md](./backups.md)   |

Migrations are the checked-in SQL under `packages/db/migrations/` applied via
`pnpm db:migrate`. Do not hand-edit production schema outside migrations.

### Release checks (both environments)

1. CI green on the commit being released (`.github/workflows/ci.yml`).
2. Migrations applied; `GET /readyz` → 200.
3. Web `/version` SHA matches intended commit; `/api/readiness` reports ready structure.
4. API `/health` → 200 with database + email worker ready.
5. Public availability returns expected status (or neutral safe fallback).
6. Waitlist POST succeeds with real staging Turnstile (staging) or production keys (production).
7. Resend webhook accepts a test event (signature valid).
8. No `ENABLE_TEST_SURFACE` inspection routes in production-strict mode.
9. Backup exists and last restore-test evidence is within policy ([backups.md](./backups.md)).

### Availability CLI note

Production writes require explicit confirmation:

```bash
DATABASE_URL=… pnpm availability:set --status waitlist --date YYYY-MM-DD --type audit \
  --updated-by ops@example.com --confirm-production
```

Use `--dry-run` first. Prefer staging before production.

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) on `main` and PRs:

1. `pnpm install --frozen-lockfile`
2. `pnpm secret-scan`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm typecheck`
6. `pnpm test:email` (package tests without live Postgres)
7. `pnpm readiness -- --assume-passed`
8. `pnpm build`

Owner may extend CI with Postgres services for `pnpm test:integration`.

---

## What this repo does not do

- Does not create Vercel or Railway projects.
- Does not set production credentials or DNS.
- Does not claim that production is deployed or live.
- Does not approve legal, pricing, SLA, equity, or marketing claims
  ([credentials-and-decisions.md](./credentials-and-decisions.md)).
