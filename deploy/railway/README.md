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
Vercel frontend **and** marketing site are not retargeted here and are **not**
Railway services; only the web app's public `NEXT_PUBLIC_API_BASE_URL`
(`https://api.vygo.ai`, a public `https://` URL — never a secret) points at the
Railway API.

## Services in project `vygo`

Both backend services build from the **same root [`Dockerfile`](../../Dockerfile)**
(Node 24, pnpm frozen install) and differ only in start command + config file:

| Service  | Source         | Config-as-code path                  | Start command                      | Healthcheck |
| -------- | -------------- | ------------------------------------ | ---------------------------------- | ----------- |
| Postgres | Railway plugin | —                                    | — (managed)                        | —           |
| Redis    | Railway plugin | —                                    | — (managed)                        | —           |
| API      | `southu/vygo`  | `railway.toml` (repo root, default)  | `pnpm --filter @vygo/api start`    | `/healthz`  |
| Worker   | `southu/vygo`  | `deploy/railway/worker/railway.toml` | `pnpm --filter @vygo/worker start` | `/healthz`  |

- **Attach:** create both services from the `southu/vygo` repo. Leave the API on
  the default root `railway.toml`. For the worker, set **Service → Settings →
  Config-as-code** to `deploy/railway/worker/railway.toml` so it starts the
  worker process instead of the API.
- **Health checks (API):** `/healthz` (liveness), `/readyz` (readiness after
  migrations), `/health` (composite ops). The worker exposes its own HTTP
  liveness/status at `/healthz` and `/worker/status` (identifies the worker
  process) so it is health-checkable as a separate service.
- **Ports:** both bind `0.0.0.0:$PORT` (Railway injects `PORT`).
- **Migrations:** run `DATABASE_URL=… pnpm db:migrate` against the project's
  `DATABASE_URL` before serving traffic (one-off Railway shell or CI job) — it is
  intentionally NOT part of the container start command.
- **Runtime:** internal workspace packages ship as TypeScript and run via `tsx`
  (a runtime dependency); `pnpm build` validates types, `pnpm start` runs the
  entrypoint. Node version: 24 (matches `.nvmrc`).

## Env wiring (names only)

Copy the env **names** from the per-service stubs into each Railway service and
fill the values in Railway / from the owner's secret vault:

- API service → [`api/.env.example`](./api/.env.example)
- Worker service → [`worker/.env.example`](./worker/.env.example)

`DATABASE_URL` and `REDIS_URL` come from the Railway Postgres/Redis plugins.
`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, and IP-hash
salts come from the secret vault. **Never commit any of these values.**

## Config-as-code layout

Two services share one repo, so each points at its own committed config file
(Railway reads one config file per service):

- **API** → root [`railway.toml`](../../railway.toml) (the default).
- **Worker** → [`worker/railway.toml`](./worker/railway.toml); set this path in
  the worker service's Config-as-code setting so it does not inherit the API's
  root config.

Both reference the same root `Dockerfile`; only `startCommand` (and the process
they run) differ. This keeps a single reproducible build while running the API
and worker as genuinely separate Railway services.
