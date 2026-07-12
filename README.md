# vygo

Production monorepo for **vygo.ai** — production engineering for AI-built software.

This repository is prepared for **owner-managed hosting**. Live Vercel and Railway
production deployments were **not** configured or claimed by this repository work;
the owner completes accounts, DNS, credentials, and launch using the checklists in
[`docs/`](docs/).

This repository is a **pnpm workspace** with:

| Path                  | Role                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `apps/web`            | Next.js marketing site (intended host: Vercel)                              |
| `apps/api`            | Fastify API (intended host: Railway)                                        |
| `apps/worker`         | Email / outbox worker (intended host: Railway)                              |
| `packages/db`         | Database client / schema (Drizzle) + checked-in SQL migrations              |
| `packages/email`      | Email templates and helpers                                                 |
| `packages/validation` | Shared Zod schemas                                                          |
| `packages/config`     | Typed environment validation                                                |
| `packages/ui`         | Design tokens and shared UI primitives                                      |
| `scripts/`            | Operational CLIs (`seed-local`, `set-availability`, readiness, secret scan) |
| `docs/`               | Deployment, ops, credentials inventory, launch checklist, verification      |
| `.github/workflows/`  | CI                                                                          |

## Prerequisites

- **Node.js 24** (active LTS) — see `.nvmrc`
- **pnpm 9** (declared via `packageManager` in root `package.json`; enable with `corepack enable`)
- Git

Optional for full local API/worker stack:

- PostgreSQL 16+
- Redis 7+
- Resend account (production email)
- Cloudflare Turnstile site + secret keys

## Environment setup

1. Copy secret-safe examples (never commit real credentials):

   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env
   cp apps/api/.env.example apps/api/.env
   cp apps/worker/.env.example apps/worker/.env
   ```

2. Fill in local values as needed. Typed validation lives in `@vygo/config`
   (`packages/config`). See [docs/credentials-and-decisions.md](docs/credentials-and-decisions.md)
   for the full inventory of owner-supplied values.
3. `external-docs/` is gitignored for private planning material — do not commit it.

## Installation

```bash
corepack enable
pnpm install --frozen-lockfile
```

A clean frozen-lockfile install is the supported path (and what CI uses). The
verified lockfile is `pnpm-lock.yaml` at the repository root.

## Local development — web, API, worker

### Marketing web (`apps/web`)

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env
# Optional: set NEXT_PUBLIC_API_URL, NEXT_PUBLIC_TURNSTILE_SITE_KEY
pnpm dev
# or: pnpm dev:web
# → http://localhost:3000
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/version
curl -s http://localhost:3000/api/readiness
```

Production-like local web start:

```bash
pnpm --filter @vygo/web build
pnpm --filter @vygo/web start
```

### API (`apps/api`)

Requires PostgreSQL (and preferably Redis) plus env from `apps/api/.env.example`
and/or root `.env.example`.

```bash
# Ensure Postgres is running, then apply migrations
export DATABASE_URL=postgresql://vygo:vygo@localhost:5432/vygo
pnpm db:migrate
pnpm seed:local   # optional: seed availability singleton

cp apps/api/.env.example apps/api/.env
# Set DATABASE_URL, REDIS_URL, CORS_ORIGINS, TURNSTILE_SECRET_KEY, etc.
pnpm dev:api
# → http://localhost:4000
```

Verify:

```bash
curl -s http://localhost:4000/healthz
curl -s http://localhost:4000/readyz
curl -s http://localhost:4000/health
curl -s http://localhost:4000/v1/public/availability
```

### Worker (`apps/worker`)

```bash
cp apps/worker/.env.example apps/worker/.env
# Set DATABASE_URL, RESEND_API_KEY (or leave empty for mock transport), EMAIL_FROM
pnpm dev:worker
```

For a single-process local harness, the API may set `INLINE_EMAIL_WORKER=true`
so the worker loop runs inside the API process (see `.env.example`). Production
Railway should run API and worker as **separate** services with
`INLINE_EMAIL_WORKER` unset/false.

## Database migrations

Checked-in SQL lives under `packages/db/migrations/`.

```bash
export DATABASE_URL=postgresql://vygo:vygo@localhost:5432/vygo
pnpm db:migrate
```

Successful output includes JSON: `{"ok":true,"action":"migrate"}`.

Apply migrations against the **target** environment (staging or production)
before or as part of releasing API/worker changes. See
[docs/deployment.md](docs/deployment.md) for staging vs production migration
procedure.

## Complete verification command sequence

Run from the repository root after `pnpm install --frozen-lockfile`:

```bash
# 1. Dependency install (frozen lockfile)
pnpm install --frozen-lockfile

# 2. Secret scan (blocks obvious credential material)
pnpm secret-scan

# 3. Lint
pnpm lint

# 4. Formatting
pnpm format:check

# 5. Typecheck (all packages/apps with a typecheck script)
pnpm typecheck

# 6. Unit / package tests (email + API suites; API integration needs Postgres)
pnpm test:email
# Optional (requires Postgres + DATABASE_URL_TEST):
# DATABASE_URL_TEST=postgresql://vygo:vygo@localhost:5432/vygo_test pnpm test:integration
# Combined (email always; integration when DB available):
pnpm test

# 7. Readiness report generation
pnpm readiness -- --assume-passed

# 8. Production builds (web static export + package builds)
pnpm build

# 9. Migrations (requires Postgres)
# DATABASE_URL=postgresql://vygo:vygo@localhost:5432/vygo pnpm db:migrate

# 10. Aggregate check alias
pnpm check   # lint + format:check + typecheck

# 11. CI-equivalent aggregate
pnpm ci:verify
```

Recorded results for this readiness pass: [docs/verification-report.md](docs/verification-report.md).

CI (`.github/workflows/ci.yml`) runs frozen-lockfile install, secret scan, lint,
format check, typecheck, email tests, Railway foundation status + readiness
generation, and baseline build.

## Machine endpoints (web)

| Method | Path                      | Purpose                                                                            |
| ------ | ------------------------- | ---------------------------------------------------------------------------------- |
| `GET`  | `/`                       | Marketing home (identifies the Vygo application)                                   |
| `GET`  | `/version`                | Deployed git SHA (plain text; from Vercel/CI env — not `version.txt`)              |
| `GET`  | `/api/readiness`          | JSON readiness report (`ready`, workspace structure, check results)                |
| `GET`  | `/api/railway-foundation` | Railway backend foundation status: provision outcome + go/no-go gate (secret-free) |

## Machine endpoints (API)

| Method | Path                      | Purpose                                                                                |
| ------ | ------------------------- | -------------------------------------------------------------------------------------- |
| `GET`  | `/health`                 | Composite readiness: API + database + email worker (no secrets or applicant data)      |
| `GET`  | `/healthz`                | Process liveness (no dependency checks)                                                |
| `GET`  | `/readyz`                 | Ready when Postgres is up and required Drizzle migrations are applied                  |
| `GET`  | `/v1/public/availability` | Public availability JSON + cache/ETag headers (neutral fallback)                       |
| `POST` | `/v1/waitlist`            | Secure waitlist intake (Turnstile, rate limits, atomic dual transactional outbox jobs) |
| `POST` | `/v1/webhooks/resend`     | Idempotent Resend/Svix webhook (signature required; provider events deduplicated)      |

See [docs/api.md](docs/api.md) for the full contract (request IDs, CORS, neutral responses).

## Scripts

```bash
# Requires PostgreSQL and DATABASE_URL (see .env.example)
pnpm db:migrate
pnpm seed:local
pnpm availability:set --status waitlist --date 2026-08-17 --type audit --dry-run
pnpm test:integration
pnpm secret-scan
pnpm readiness
```

## Documentation

| Doc                                                                    | Contents                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| [API contracts](docs/api.md)                                           | Request IDs, health, waitlist, webhooks, test surface          |
| [Deployment](docs/deployment.md)                                       | Vercel web, Railway API/worker/Postgres/Redis, staging vs prod |
| [Railway backend readiness](docs/railway-backend-readiness.md)         | Project `vygo`: env names, config stubs, human attach steps    |
| [Email & Resend](docs/email-and-resend.md)                             | Domain/DNS, sender, webhooks, event handling, failed-email ops |
| [Turnstile](docs/turnstile.md)                                         | Site/secret keys for local, staging, production                |
| [Backups & restore](docs/backups.md)                                   | Schedule, retention, restore, restore-test evidence fields     |
| [Content operations](docs/content-operations.md)                       | Copy, flags, availability, waitlist export/delete, content ops |
| [Incident response](docs/incident-response.md)                         | Severity, detection, containment, rollback, comms, recovery    |
| [Owner launch checklist](docs/owner-launch-checklist.md)               | Exact ordered hosting launch steps                             |
| [Credentials & decisions inventory](docs/credentials-and-decisions.md) | Every external credential + unresolved owner decisions         |
| [Verification report](docs/verification-report.md)                     | Exact commands and exit results for this readiness pass        |

## Hosting status (explicit)

- **Live Vercel production deployment was not configured or claimed** by this
  mission. The owner connects the project and deploys when ready.
- **Live Railway production deployment was not configured or claimed** by this
  mission. The backend targets **Railway project `vygo`** (API, worker,
  PostgreSQL, Redis); the owner creates the services and wires env by name using
  [docs/railway-backend-readiness.md](docs/railway-backend-readiness.md) and the
  secret-free stubs in [deploy/railway/](deploy/railway/). Provisioning was not
  run, so no `project_id` was emitted — fill it from the Railway dashboard.
- **Foundation deploy gate (machine-readable, secret-free):** the live site
  serves the provision outcome + go/no-go verdict at `GET /api/railway-foundation`
  (compact pointer on `GET /api/readiness`). Current state: provision
  `failed_closed` / `consumer_not_armed` (an explicit closed failure, never a
  silent partial), secrets self-scan clean, verdict **GO** for human Railway
  service attach on `vygo`. Live production API smoke is skipped until a service
  exists. See
  [Provision outcome & deploy gate](docs/railway-backend-readiness.md#provision-outcome--deploy-gate-machine-readable).
- Do not treat marketing claims (availability dates, pricing, U.S.-based /
  senior-only language, SLA, equity terms) as verified — see the
  [decision inventory](docs/credentials-and-decisions.md).

## License

Proprietary — All rights reserved.
