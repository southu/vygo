# Railway backend hosting readiness (project `vygo`)

> **Purpose:** everything a human operator needs to attach Postgres + Redis and
> deploy the API/worker on Railway — **without any secrets living in this repo**.
> This document and the stubs under [`deploy/railway/`](../deploy/railway/) use
> **environment variable names only** and public URL shapes only. No tokens, API
> keys, passwords, or credential-bearing connection strings appear here or in git.

## Hosting split (authoritative)

| Component              | Platform             | Notes                                                         |
| ---------------------- | -------------------- | ------------------------------------------------------------- |
| Web (`apps/web`)       | **Vercel**           | Static Next.js export; unchanged by this doc                  |
| API (`apps/api`)       | **Railway** (`vygo`) | Fastify service                                               |
| Worker (`apps/worker`) | **Railway** (`vygo`) | Separate service from the API                                 |
| PostgreSQL             | **Railway** (`vygo`) | Shared by API + worker                                        |
| Redis                  | **Railway** (`vygo`) | Rate limits / cache (API)                                     |
| Email provider         | **Resend**           | Server-side; see [email-and-resend.md](./email-and-resend.md) |
| Bot protection         | **Turnstile**        | Server-side secret; see [turnstile.md](./turnstile.md)        |

- **Site → Vercel. API / DB / Redis / worker → Railway (project `vygo`).**
- The Vercel frontend is **not** retargeted to Railway. Vercel hosting config
  (`vercel.json`, `apps/web`) is unchanged. The only link from web → Railway is
  the public API base URL env value (a public `https://` URL, never a secret).

## Railway project identity

Provisioning was **not** run for this readiness pass, so no services were
auto-created and no `project_id` was emitted. Fill these in from the Railway
dashboard once the owner creates (or opens) the project named **`vygo`**:

| Field         | Value                                                 |
| ------------- | ----------------------------------------------------- |
| Project name  | `vygo`                                                |
| Project ID    | `<railway-project-id>` — copy from Project → Settings |
| Dashboard URL | `https://railway.app/project/<railway-project-id>`    |

> These are **placeholders**, not fabricated identifiers. Substitute the real
> `project_id` / dashboard URL from Railway; never commit tokens or secrets when
> you do. Only the `project_id`, dashboard URL, and env **names** belong in git.

## Required backend env — names only (no values)

Set these on the Railway **API** and/or **worker** services. Values come from
Railway plugins or the owner's secret vault at deploy time — **never** committed.

| Env name                | Service(s)  | Provided by               | Purpose                                          |
| ----------------------- | ----------- | ------------------------- | ------------------------------------------------ |
| `DATABASE_URL`          | API, worker | Railway Postgres plugin   | Postgres connection (use private networking URL) |
| `REDIS_URL`             | API         | Railway Redis plugin      | Rate limiting / cache                            |
| `RESEND_API_KEY`        | API, worker | Resend (secret vault)     | Resend server API key (outbound email)           |
| `RESEND_WEBHOOK_SECRET` | API         | Resend (secret vault)     | Verify inbound Resend webhook signatures         |
| `TURNSTILE_SECRET_KEY`  | API         | Cloudflare (secret vault) | Server-side Turnstile verification               |

Public frontend → backend links (set on **Vercel**, not Railway). Every entry is
a `NEXT_PUBLIC_*` value that ships to the browser, so each is **public by
definition** and must never hold a secret:

| Env name                         | Where        | Value shape                                            |
| -------------------------------- | ------------ | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`            | Vercel (web) | Public `https://` origin of the Railway API            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel (web) | Cloudflare Turnstile **site** key (public, not secret) |

> **Naming note:** provision/architect notes may refer to the API URL as
> `NEXT_PUBLIC_API_BASE_URL` ("public API base URL"). The variable the web app
> actually reads is **`NEXT_PUBLIC_API_URL`** (see `apps/web/src/lib/api.ts` and
> `packages/config`). Use `NEXT_PUBLIC_API_URL`. It is a **public** value — the
> API's `https://…` origin, no trailing slash — and must never hold a secret.
>
> **Turnstile is a client/server pair.** The **public** site key above lives on
> Vercel and renders the widget (`apps/web/src/components/WaitlistForm.tsx`); its
> matching **secret**, `TURNSTILE_SECRET_KEY`, lives on the Railway API (table
> above) and verifies the token. Both halves must be set for bot protection to
> work — the site key is safe to expose, the secret never is. If the site key is
> unset the web app falls back to Cloudflare's public test key for non-prod only.
> See [turnstile.md](./turnstile.md). This is documentation of an existing public
> Vercel var — it does **not** change the Vercel hosting setup.

The full operational env name set (rate limits, IP-hash salts, logging, worker
tuning, `CORS_ORIGINS`, `EMAIL_FROM`, etc.) is captured as **empty stubs** in:

- [`deploy/railway/api/.env.example`](../deploy/railway/api/.env.example)
- [`deploy/railway/worker/.env.example`](../deploy/railway/worker/.env.example)

Every value in those stubs is blank or a non-secret placeholder. See also the
full credential inventory in [credentials-and-decisions.md](./credentials-and-decisions.md).

## Config stubs for human Railway attach

The [`deploy/railway/`](../deploy/railway/) folder holds copy-ready, secret-free
config for the operator:

| File                                                                          | What it is                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`deploy/railway/README.md`](../deploy/railway/README.md)                     | Per-service settings (root dir, build/start, wiring) |
| [`deploy/railway/api/.env.example`](../deploy/railway/api/.env.example)       | API service env **names** (empty/placeholder)        |
| [`deploy/railway/worker/.env.example`](../deploy/railway/worker/.env.example) | Worker service env **names** (empty/placeholder)     |

## Next steps (project `vygo`) — services not yet running

Provisioning did not auto-create services, so start here. Names/wiring only;
paste no secrets into git at any step.

1. **Open/create the Railway project** named `vygo`; record its `project_id` and
   dashboard URL in the table above (in your notes, not necessarily committed).
2. **Add Postgres** — add the Railway Postgres plugin. It exposes a connection
   URL; reference it as `DATABASE_URL` on the API and worker services (prefer the
   private-networking URL).
3. **Add Redis** — add the Railway Redis plugin; reference it as `REDIS_URL` on
   the API service.
4. **Add the API service** — deploy `apps/api` from `southu/vygo`
   (root dir = repo root; build/start per [`deploy/railway/README.md`](../deploy/railway/README.md)).
   Wire env names from the tables above; set `NODE_ENV=production`,
   `INLINE_EMAIL_WORKER` unset/false, `ENABLE_TEST_SURFACE=false` for prod.
5. **Add the worker service** — deploy `apps/worker` as a **separate** service
   sharing the same `DATABASE_URL`.
6. **Wire secrets from the vault by name** — populate `RESEND_API_KEY`,
   `RESEND_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, and IP-hash salts on the
   Railway services from the owner's secret store. Never commit the values.
7. **Set `NEXT_PUBLIC_API_URL` on Vercel** to the API's public `https://` origin
   once the API domain exists. This is the only web→Railway change; do not
   retarget the frontend itself.
8. **Migrate + verify** — run `pnpm db:migrate` against the project's
   `DATABASE_URL`, then probe the API's health endpoints (`GET /healthz`
   liveness, `GET /readyz` readiness-after-migrations, `GET /health` composite)
   before sending traffic. Full procedure:
   [deployment.md → API/worker Railway setup](./deployment.md#api-worker-postgresql-redis--exact-railway-setup).

## Guarantees for this repo

- No tokens, API keys, passwords, or credential-bearing connection strings are
  committed. `pnpm secret-scan` runs in CI over tracked files.
- Only `project_id` (placeholder), dashboard URL (placeholder), and env **names**
  are documented.
- The Vercel frontend and its hosting config are untouched; `/version` and the
  deploy gate are not modified.
