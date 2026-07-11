# Deployment

## Overview

- **Web (`apps/web`)**: Next.js marketing site deployed to **Vercel**.
- **API (`apps/api`)**: Fastify service intended for **Railway**.
- **Worker (`apps/worker`)**: Email/outbox worker intended for **Railway**.
- **Data**: PostgreSQL + Redis on Railway (later missions).

## Web (Vercel)

1. Connect the GitHub repository `southu/vygo` to a Vercel project.
2. Use the monorepo root as the project root (see root `vercel.json`).
3. Framework preset: Next.js.
4. Install command: `pnpm install --frozen-lockfile`
5. Build command: `pnpm --filter @vygo/web build`
6. Node.js version: **24** (active LTS; see `.nvmrc`).
7. Production domain: configure `vygo.example.com` (or `vygo.ai`) as a custom domain.

### Version endpoint

`GET /version` returns the deployed git SHA from `VERCEL_GIT_COMMIT_SHA` (or `COMMIT_SHA`). Do **not** use `version.txt`.

### Readiness endpoint

`GET /api/readiness` serves the machine-readable report generated at build time by `scripts/generate-readiness.ts`.

## API & worker (Railway)

- Deploy `apps/api` (Fastify) with `DATABASE_URL`, `CORS_ORIGINS` / `ALLOWED_ORIGINS`, and optional Redis/Resend credentials.
- Pre-deploy: `DATABASE_URL=… pnpm db:migrate` (checked-in SQL under `packages/db/migrations`).
- Health check path: `GET /healthz` (liveness). Readiness: `GET /readyz` (Postgres + migrations).
- Public availability: `GET /v1/public/availability` (see [API contracts](./api.md)).
- Worker (`apps/worker`) drains the email outbox in a later mission.
- Never commit secrets.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs frozen-lockfile install, secret scan, lint, format check, typecheck, readiness generation, and baseline builds.
