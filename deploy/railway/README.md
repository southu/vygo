# `deploy/railway/` — Railway config stubs (project `vygo`)

Secret-free, copy-ready config for attaching the backend to **Railway project
`vygo`**. These are **stubs**: env **names** and public settings only. No tokens,
keys, passwords, or credential-bearing connection strings live here or in git.

Full walkthrough and next steps:
[`../../docs/railway-backend-readiness.md`](../../docs/railway-backend-readiness.md).
Exact deploy procedure: [`../../docs/deployment.md`](../../docs/deployment.md).

**Machine-readable status:** the live site publishes the foundation provision
outcome + go/no-go deploy-gate verdict (secret-free) at `GET /api/railway-foundation`
(compact pointer also on `GET /api/readiness`). Current verdict: **GO** for human
attach — provision `failed_closed` / `consumer_not_armed` (clear stub), secrets
self-scan clean. See
[Provision outcome & deploy gate](../../docs/railway-backend-readiness.md#provision-outcome--deploy-gate-machine-readable).

## Hosting split

**Site → Vercel. API / DB / Redis / worker → Railway (project `vygo`).** The
Vercel frontend is not retargeted here; only the web app's `NEXT_PUBLIC_API_URL`
(a public `https://` URL) points at the Railway API.

## Services in project `vygo`

| Service  | Source         | Root dir  | Build command                                                        | Start command                      |
| -------- | -------------- | --------- | -------------------------------------------------------------------- | ---------------------------------- |
| Postgres | Railway plugin | —         | —                                                                    | — (managed)                        |
| Redis    | Railway plugin | —         | —                                                                    | — (managed)                        |
| API      | `southu/vygo`  | repo root | `pnpm install --frozen-lockfile && pnpm --filter @vygo/api build`    | `pnpm --filter @vygo/api start`    |
| Worker   | `southu/vygo`  | repo root | `pnpm install --frozen-lockfile && pnpm --filter @vygo/worker build` | `pnpm --filter @vygo/worker start` |

- **Health checks (API):** `/healthz` (liveness), `/readyz` (readiness after
  migrations), `/health` (composite ops).
- **Migrations:** run `pnpm db:migrate` against the project's `DATABASE_URL`
  before serving traffic (one-off Railway shell or CI job).
- **Node version:** 24 (matches `.nvmrc`).

## Env wiring (names only)

Copy the env **names** from the per-service stubs into each Railway service and
fill the values in Railway / from the owner's secret vault:

- API service → [`api/.env.example`](./api/.env.example)
- Worker service → [`worker/.env.example`](./worker/.env.example)

`DATABASE_URL` and `REDIS_URL` come from the Railway Postgres/Redis plugins.
`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, and IP-hash
salts come from the secret vault. **Never commit any of these values.**

## Why no `railway.json` here

All backend services deploy from the **repo root** (shared pnpm workspace), so a
single root `railway.json` cannot describe multiple services correctly. Configure
per-service root dir / build / start commands in the Railway dashboard using the
table above, rather than committing a config file that could mis-target a service.
