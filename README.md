# vygo

Production monorepo for **vygo.ai** — production engineering for AI-built software.

This repository is a **pnpm workspace** with:

| Path                  | Role                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `apps/web`            | Next.js marketing site (Vercel)                                             |
| `apps/api`            | Fastify API (Railway)                                                       |
| `apps/worker`         | Email / outbox worker (Railway)                                             |
| `packages/db`         | Database client / schema (Drizzle)                                          |
| `packages/email`      | Email templates and helpers                                                 |
| `packages/validation` | Shared Zod schemas                                                          |
| `packages/config`     | Typed environment validation                                                |
| `packages/ui`         | Design tokens and shared UI primitives                                      |
| `scripts/`            | Operational CLIs (`seed-local`, `set-availability`, readiness, secret scan) |
| `docs/`               | Deployment, content ops, incident response                                  |
| `.github/workflows/`  | CI                                                                          |

## Prerequisites

- **Node.js 24** (active LTS) — see `.nvmrc`
- **pnpm 9** (declared via `packageManager` in root `package.json`; enable with `corepack enable`)
- Git

Optional for later API/worker work: PostgreSQL 16+, Redis 7+, Resend account, Cloudflare Turnstile.

## Environment setup

1. Copy secret-safe examples (never commit real credentials):

   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env
   cp apps/api/.env.example apps/api/.env
   cp apps/worker/.env.example apps/worker/.env
   ```

2. Fill in local values as needed. Typed validation lives in `@vygo/config` (`packages/config`).
3. `external-docs/` is gitignored for private planning material — do not commit it.

## Installation

```bash
corepack enable
pnpm install --frozen-lockfile
```

A clean frozen-lockfile install is the supported path (and what CI uses).

## Development

```bash
# Marketing site (http://localhost:3000)
pnpm dev
# or
pnpm dev:web

# API (http://localhost:4000) — requires env as needed
pnpm dev:api

# Worker
pnpm dev:worker
```

## Local startup

End-to-end local startup for the web app:

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Configure environment (see Environment setup)
cp .env.example .env
cp apps/web/.env.example apps/web/.env

# 3. Start the Next.js dev server
pnpm dev

# 4. Verify
open http://localhost:3000
curl -s http://localhost:3000/version
curl -s http://localhost:3000/api/readiness
```

Production-like local web start:

```bash
pnpm --filter @vygo/web build
pnpm --filter @vygo/web start
```

## Checks

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm secret-scan
pnpm readiness -- --assume-passed
pnpm check          # lint + format:check + typecheck
```

## Builds

```bash
# All packages/apps with a build script
pnpm build

# Web only (also regenerates readiness via prebuild)
pnpm build:web
```

CI runs the full verify path (`pnpm install --frozen-lockfile`, secret scan, lint, format check, typecheck, readiness, build). See `.github/workflows/ci.yml`.

## Machine endpoints (web)

| Method | Path             | Purpose                                                               |
| ------ | ---------------- | --------------------------------------------------------------------- |
| `GET`  | `/`              | Marketing home (identifies the Vygo application)                      |
| `GET`  | `/version`       | Deployed git SHA (plain text; from Vercel/CI env — not `version.txt`) |
| `GET`  | `/api/readiness` | JSON readiness report (`ready`, workspace structure, check results)   |

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

- [API contracts](docs/api.md)
- [Deployment](docs/deployment.md)
- [Content operations](docs/content-operations.md)
- [Incident response](docs/incident-response.md)

## License

Proprietary — All rights reserved.
