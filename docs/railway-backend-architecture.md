# Vygo backend architecture — Railway plane (project `vygo`)

> **Architect-only plan.** This document describes how the Vygo **backend plane**
> — a Fastify API, Postgres, Redis, and an email worker — is laid out on
> **Railway** project `vygo`. It is a plan, not a provisioning action: no
> infrastructure is created, destroyed, redeployed, or retargeted by this file.
>
> **No secrets appear anywhere in this document.** It uses environment variable
> **key names** and public URL shapes only — no tokens, API keys, passwords, or
> credential-bearing connection strings. A secret-free copy is published for live
> verification at **`/docs/railway-backend-architecture`** on the deployed site.

## 1. Hosting split (authoritative)

**The marketing site is hosted on Vercel. The API, Postgres, Redis, and the email
worker are hosted on Railway (project `vygo`).**

| Component              | Platform                 | Role                                              |
| ---------------------- | ------------------------ | ------------------------------------------------- |
| Web (`apps/web`)       | **Vercel**               | Static Next.js export — marketing/site            |
| API (`apps/api`)       | **Railway** (`vygo`)     | Fastify HTTP service                              |
| Worker (`apps/worker`) | **Railway** (`vygo`)     | Email/outbox worker — a **separate** service      |
| PostgreSQL             | **Railway** (`vygo`)     | Primary data store, shared by API + worker        |
| Redis                  | **Railway** (`vygo`)     | Rate limiting / cache for the API                 |
| Email provider         | **Resend**               | External SaaS; server-side send + inbound webhook |
| Bot protection         | **Cloudflare Turnstile** | External SaaS; server-side token verification     |

- The marketing/site plane stays on **Vercel** and is **not** retargeted or moved
  to Railway. Vercel hosting config (`vercel.json`, `apps/web`) is unchanged.
- The API + Postgres + Redis + email worker plane runs on **Railway** in a single
  project named `vygo`.
- The only link from the Vercel frontend to the Railway backend is a **public**
  API base URL env value (an `https://` origin), never a secret.

## 2. Topology (services and process roles)

```
                       Internet (HTTPS)
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                             │
   Vercel (marketing/site)                    Railway project `vygo`
   apps/web — static Next.js export           ┌───────────────────────────┐
        │  public API base URL (https)        │  API service (apps/api)   │
        └───────────────────────────────────► │  Fastify HTTP server      │
                                              │   • /healthz /readyz      │
                                              │   • waitlist, availability│
                                              │   • Resend webhook intake │
                                              └──────┬──────────┬─────────┘
                                                     │          │
                              private networking     │          │  private networking
                                     ┌───────────────┘          └───────────┐
                                     ▼                                       ▼
                          ┌────────────────────┐                  ┌────────────────────┐
                          │ Postgres (plugin)  │◄────────────────►│  Redis (plugin)    │
                          │ leads, email outbox│   (API only)     │ rate limit / cache │
                          │ events, heartbeat  │                  └────────────────────┘
                          └─────────┬──────────┘
                                    │ same DATABASE_URL
                                    ▼
                          ┌────────────────────────┐        ┌──────────────┐
                          │ Worker service         │───────►│   Resend     │
                          │ apps/worker            │  send  │ (email SaaS) │
                          │ outbox drain + retries │        └──────────────┘
                          └────────────────────────┘
```

Four backend process/data roles run in project `vygo`:

1. **Fastify API (`apps/api`)** — the public HTTP service. Handles waitlist
   submissions, availability, Resend inbound webhooks, and health/readiness
   probes. Verifies Cloudflare Turnstile tokens server-side and enqueues outbound
   email into a Postgres-backed outbox.
2. **Email worker (`apps/worker`)** — a **separate** long-running service (not a
   web process) that drains the email outbox and delivers via Resend.
3. **PostgreSQL** — a Railway managed plugin; the primary data store shared by the
   API and the worker.
4. **Redis** — a Railway managed plugin; used by the API for rate limiting/cache.

The worker can also run **inline inside the API process** for local/dev via
`INLINE_EMAIL_WORKER=true`. In production on Railway it runs as its **own
service** with `INLINE_EMAIL_WORKER=false` on both services, so API scaling and
worker throughput are independent.

## 3. Data stores

- **PostgreSQL (Railway plugin, shared).** Stores waitlist leads, the email
  **outbox** (queued/sending/sent/dead-letter jobs), delivered email **events**
  (from Resend webhooks), and the **worker heartbeat** row that `/health` reads.
  Both the API (producer) and the worker (consumer) connect with the same
  `DATABASE_URL`; prefer Railway **private networking** for that URL.
- **Redis (Railway plugin, API-only).** Backs IP/email rate limiting and
  lightweight caching in the API via `REDIS_URL`. If Redis is absent the API
  falls back to an in-process memory store, so it is operationally optional but
  recommended for multi-instance correctness.

## 4. Email worker responsibilities

The worker is a database-backed **outbox** processor. Its responsibilities:

- **Claim** due outbox jobs using `SELECT … FOR UPDATE SKIP LOCKED` so multiple
  workers/instances never process the same job twice.
- **Deliver** each job through the Resend transport (server-side API key).
- **Retry** transient failures with exponential backoff + jitter, up to
  `WORKER_MAX_ATTEMPTS`.
- **Dead-letter** jobs that exhaust their attempts so they stop being retried and
  can be inspected.
- **Heartbeat** — periodically upsert a worker heartbeat row; the API `/health`
  endpoint reads it to report worker readiness (fresh vs. stale/missing).
- **Graceful shutdown** on `SIGTERM`/`SIGINT` (Railway redeploy/stop) so an
  in-flight batch finishes or is released cleanly.
- **Secret redaction** in logs — API keys, signing secrets, and PII are never
  logged.

Tuning knobs (non-secret): `WORKER_POLL_INTERVAL_MS`, `WORKER_BATCH_SIZE`,
`WORKER_MAX_ATTEMPTS`.

## 5. How the services connect

| From → To          | Mechanism / env name                                  | Notes                                         |
| ------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Web (Vercel) → API | `NEXT_PUBLIC_API_BASE_URL` (public `https://` origin) | See naming note below; **public**, not secret |
| API → Postgres     | `DATABASE_URL` (Railway Postgres plugin)              | Prefer private-networking URL                 |
| API → Redis        | `REDIS_URL` (Railway Redis plugin)                    | Rate limit / cache; optional fallback         |
| API → Resend (out) | `RESEND_API_KEY`                                      | Server-side send + outbox enqueue             |
| Resend → API (in)  | `RESEND_WEBHOOK_SECRET`                               | Verify inbound webhook signatures             |
| API → Turnstile    | `TURNSTILE_SECRET_KEY`                                | Server-side bot-token verification            |
| Worker → Postgres  | `DATABASE_URL` (same DB as API)                       | Outbox drain, heartbeat                       |
| Worker → Resend    | `RESEND_API_KEY`                                      | Delivers queued email                         |
| API CORS allowlist | `CORS_ORIGINS`                                        | Include the Vercel web origin(s)              |

> **Naming note — `NEXT_PUBLIC_API_BASE_URL`.** Architect/provision notes call the
> web→API link `NEXT_PUBLIC_API_BASE_URL` ("public API base URL"). The variable
> the web app **actually reads** is **`NEXT_PUBLIC_API_URL`** (see
> `apps/web/src/lib/api.ts` and `packages/config`). Set `NEXT_PUBLIC_API_URL` on
> **Vercel** to the Railway API's public `https://` origin (no trailing slash). It
> is a **public** value and must never hold a secret.

## 6. Deploy and runtime notes (no secrets)

Per-service settings for the Railway dashboard (mirrors
[`deploy/railway/README.md`](../deploy/railway/README.md)):

| Service  | Source         | Root dir  | Build                                                                | Start                              |
| -------- | -------------- | --------- | -------------------------------------------------------------------- | ---------------------------------- |
| Postgres | Railway plugin | —         | — (managed)                                                          | — (managed)                        |
| Redis    | Railway plugin | —         | — (managed)                                                          | — (managed)                        |
| API      | `southu/vygo`  | repo root | `pnpm install --frozen-lockfile && pnpm --filter @vygo/api build`    | `pnpm --filter @vygo/api start`    |
| Worker   | `southu/vygo`  | repo root | `pnpm install --frozen-lockfile && pnpm --filter @vygo/worker build` | `pnpm --filter @vygo/worker start` |

- **Node version:** 24 (matches `.nvmrc`).
- **Health checks (API):** `/healthz` (liveness), `/readyz` (readiness after
  migrations), `/health` (composite: API + database + worker heartbeat).
- **Migrations:** run `pnpm db:migrate` against the project's `DATABASE_URL`
  before serving traffic (one-off Railway shell or CI job).
- **Production posture:** on both services set `NODE_ENV=production`,
  `INLINE_EMAIL_WORKER=false` (the worker is its own service), and
  `ENABLE_TEST_SURFACE=false`.
- **Ports:** Railway injects `PORT`; the API binds to it (schema default 4000).
- Secret values come from the Railway plugins or the owner's secret vault **at
  deploy time** and are entered in the Railway dashboard — never committed.

## 7. Environment variable key catalog (names only, no values)

All entries are **key names only**. No values, connection strings, or tokens
appear here or in git. Full secret-free stubs live under
[`deploy/railway/`](../deploy/railway/).

### API service (`apps/api` on Railway)

| Key name                                                   | Provided by             | Secret? | Purpose                               |
| ---------------------------------------------------------- | ----------------------- | ------- | ------------------------------------- |
| `DATABASE_URL`                                             | Railway Postgres plugin | yes     | Postgres connection (private net URL) |
| `REDIS_URL`                                                | Railway Redis plugin    | yes     | Rate limit / cache                    |
| `RESEND_API_KEY`                                           | Resend (vault)          | yes     | Outbound email (Resend server key)    |
| `RESEND_WEBHOOK_SECRET`                                    | Resend (vault)          | yes     | Verify inbound Resend webhooks        |
| `TURNSTILE_SECRET_KEY`                                     | Cloudflare (vault)      | yes     | Server-side Turnstile verification    |
| `IP_HASH_SALT` / `IP_HASH_SALT_VERSION`                    | vault                   | yes     | Versioned IP hashing (never log IPs)  |
| `CORS_ORIGINS`                                             | operator                | no      | Allowlist incl. Vercel web origin(s)  |
| `EMAIL_FROM` / `LEAD_NOTIFICATION_EMAIL`                   | operator                | no      | Email identity / notify address       |
| `RATE_LIMIT_IP_MAX` / `RATE_LIMIT_IP_WINDOW_SECONDS`       | operator                | no      | Per-IP rate limiting                  |
| `RATE_LIMIT_EMAIL_MAX` / `RATE_LIMIT_EMAIL_WINDOW_SECONDS` | operator                | no      | Per-email rate limiting               |
| `MIN_FORM_COMPLETION_MS` / `LOG_LEVEL`                     | operator                | no      | Anti-bot timing / log verbosity       |
| `NODE_ENV` / `PORT`                                        | Railway / operator      | no      | Runtime mode / injected port          |
| `INLINE_EMAIL_WORKER` / `ENABLE_TEST_SURFACE`              | operator                | no      | `false` in prod                       |

### Worker service (`apps/worker` on Railway)

| Key name                                                                | Provided by             | Secret? | Purpose                              |
| ----------------------------------------------------------------------- | ----------------------- | ------- | ------------------------------------ |
| `DATABASE_URL`                                                          | Railway Postgres plugin | yes     | Same DB as API (outbox drain)        |
| `REDIS_URL`                                                             | Railway Redis plugin    | yes     | Optional; only if worker needs it    |
| `RESEND_API_KEY`                                                        | Resend (vault)          | yes     | Deliver queued email                 |
| `EMAIL_FROM` / `LEAD_NOTIFICATION_EMAIL`                                | operator                | no      | Email identity                       |
| `WORKER_POLL_INTERVAL_MS` / `WORKER_BATCH_SIZE` / `WORKER_MAX_ATTEMPTS` | operator                | no      | Worker tuning                        |
| `NODE_ENV` / `LOG_LEVEL` / `INLINE_EMAIL_WORKER`                        | operator                | no      | Runtime; `INLINE_EMAIL_WORKER=false` |

### Vercel web (`apps/web`) — public link to Railway API

| Key name                                                     | Secret? | Purpose                                       |
| ------------------------------------------------------------ | ------- | --------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` (alias for `NEXT_PUBLIC_API_URL`) | no      | Public `https://` origin of the Railway API   |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                             | no      | Public Turnstile **site** key (client widget) |
| `NEXT_PUBLIC_APP_URL`                                        | no      | Public site origin                            |

> `NEXT_PUBLIC_*` values are **public by design** and safe to expose in the
> browser bundle. The **server** secrets `TURNSTILE_SECRET_KEY`,
> `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` live only on **Railway**, never on
> Vercel and never in git.

## 8. Secret-safety confirmation

This plan and its published HTTP copy **contain no secret material**:

- Only environment variable **key names** and public URL shapes are documented;
  **no values** are present.
- No API keys, passwords, JWTs, live/test payment-style tokens, Railway/Vercel
  API tokens, or credential-bearing database/Redis connection strings appear.
- `pnpm secret-scan` runs over tracked files in CI and gates this repo.
- The Vercel frontend, its hosting config, and the deploy SHA marker
  (`/version`) are untouched by this document.

## Related

- Operator readiness walkthrough:
  [`docs/railway-backend-readiness.md`](./railway-backend-readiness.md)
- Copy-ready per-service stubs: [`deploy/railway/`](../deploy/railway/)
- Exact deploy procedure: [`docs/deployment.md`](./deployment.md)
