# Credentials and owner decisions inventory

**Label:** This document inventories **every required external credential /
account value / DNS record / webhook secret / environment variable** the owner
must supply for owner-managed hosting, plus **unresolved legal and operational
decisions**.

Values here are **placeholders or descriptions only**. No live secrets belong
in git.

**Hosting status:** Live Vercel and Railway production deployments were **not**
configured or claimed by this repository work.

---

## 1. Accounts (owner must create / own)

| Account                       | Purpose                      | Owner-supplied? | Notes                                      |
| ----------------------------- | ---------------------------- | --------------- | ------------------------------------------ |
| GitHub (`southu/vygo` or org) | Source + CI                  | Yes             | Deploy keys / app installs least privilege |
| Vercel                        | Web hosting                  | Yes             | Not connected by this mission              |
| Railway                       | API, worker, Postgres, Redis | Yes             | Not connected by this mission              |
| Resend                        | Transactional email          | Yes             | Domain verify + API key + webhooks         |
| Cloudflare Turnstile          | Bot protection               | Yes             | Separate widgets per environment           |
| DNS provider                  | Domain records               | Yes             | Apex, www, API, email auth                 |
| Secret manager                | Store credentials            | Yes             | Not git                                    |

---

## 2. DNS records (owner must publish)

Exact values come from Vercel, Railway, and Resend UIs at setup time.

| Record category            | Typical types                    | Environments                     | Owner-supplied values |
| -------------------------- | -------------------------------- | -------------------------------- | --------------------- |
| Web hostname               | A/AAAA/CNAME                     | Staging + production             | Target from Vercel    |
| API hostname               | CNAME/A                          | Staging + production             | Target from Railway   |
| Resend domain verification | TXT / CNAME (DKIM) / optional MX | Per sending domain               | From Resend domain UI |
| SPF / DMARC                | TXT                              | Production (and staging if used) | Owner email policy    |
| www ↔ apex redirect        | per DNS/Vercel                   | Production                       | Owner preference      |

---

## 3. Environment variables and secrets

### 3.1 Web (`apps/web` / Vercel)

| Name                             | Staging            | Production          | Local                   | Secret?     |
| -------------------------------- | ------------------ | ------------------- | ----------------------- | ----------- |
| `NODE_ENV`                       | as configured      | `production`        | `development`           | No          |
| `NEXT_PUBLIC_APP_URL`            | staging web URL    | production web URL  | `http://localhost:3000` | No          |
| `NEXT_PUBLIC_API_URL`            | staging API URL    | production API URL  | `http://localhost:4000` | No          |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | staging site key   | production site key | test site key           | No (public) |
| `COMMIT_SHA`                     | optional           | optional            | optional                | No          |
| `VERCEL_GIT_COMMIT_SHA`          | injected by Vercel | injected            | n/a                     | No          |

### 3.2 API (`apps/api` / Railway)

| Name                               | Staging                | Production               | Local                              | Secret?         |
| ---------------------------------- | ---------------------- | ------------------------ | ---------------------------------- | --------------- |
| `NODE_ENV`                         | owner choice           | `production`             | `development`                      | No              |
| `PORT`                             | platform               | platform                 | `4000`                             | No              |
| `DATABASE_URL`                     | staging Postgres       | production Postgres      | local Postgres                     | **Yes**         |
| `REDIS_URL`                        | staging Redis          | production Redis         | local Redis                        | **Yes**         |
| `CORS_ORIGINS` / `ALLOWED_ORIGINS` | staging web origin(s)  | production web origin(s) | localhost origins                  | No              |
| `LOG_LEVEL`                        | `info` typical         | `info` typical           | `info`                             | No              |
| `BODY_LIMIT_BYTES`                 | default 65536          | default                  | default                            | No              |
| `REQUEST_ID_HEADER`                | default `x-request-id` | default                  | default                            | No              |
| `TURNSTILE_SECRET_KEY`             | staging secret         | production secret        | Cloudflare always-pass test secret | **Yes**         |
| `RESEND_API_KEY`                   | staging/test key       | production key           | empty = mock                       | **Yes**         |
| `RESEND_WEBHOOK_SECRET`            | staging `whsec_…`      | production `whsec_…`     | optional local                     | **Yes**         |
| `EMAIL_FROM`                       | verified staging from  | verified production from | example in `.env.example`          | No (public-ish) |
| `LEAD_NOTIFICATION_EMAIL`          | test inbox             | ops inbox                | example                            | No              |
| `IP_HASH_SALT`                     | staging salt           | production salt          | local dev salt                     | **Yes**         |
| `IP_HASH_SALT_VERSION`             | int                    | int                      | `1`                                | No              |
| `IP_HASH_SALT_PREVIOUS`            | during rotation        | during rotation          | optional                           | **Yes**         |
| `IP_HASH_SALT_PREVIOUS_VERSION`    | during rotation        | during rotation          | optional                           | No              |
| `RATE_LIMIT_IP_MAX`                | owner tune             | owner tune               | default 20                         | No              |
| `RATE_LIMIT_IP_WINDOW_SECONDS`     | owner tune             | owner tune               | default 3600                       | No              |
| `RATE_LIMIT_EMAIL_MAX`             | owner tune             | owner tune               | default 5                          | No              |
| `RATE_LIMIT_EMAIL_WINDOW_SECONDS`  | owner tune             | owner tune               | default 3600                       | No              |
| `MIN_FORM_COMPLETION_MS`           | owner tune             | owner tune               | default 2000                       | No              |
| `UTM_MAX_LENGTH`                   | default                | default                  | default                            | No              |
| `ENABLE_TEST_SURFACE`              | often `true` for QA    | **`false`**              | `true` ok                          | No              |
| `TEST_FAULT_MODE`                  | non-prod only          | unset/`none`             | optional                           | No              |
| `LEAD_SCORE_ALERT_THRESHOLD`       | owner tune             | owner tune               | default 8                          | No              |
| `INLINE_EMAIL_WORKER`              | optional QA            | **unset/false**          | `true` ok for harness              | No              |
| `WORKER_POLL_INTERVAL_MS`          | if inline              | if inline                | default                            | No              |
| `WORKER_BATCH_SIZE`                | if inline              | if inline                | default                            | No              |
| `WORKER_MAX_ATTEMPTS`              | if inline              | if inline                | default 5                          | No              |
| `WORKER_HEARTBEAT_MAX_AGE_MS`      | default                | default                  | default                            | No              |
| `DATABASE_URL_TEST`                | CI/dev only            | n/a                      | local test DB                      | **Yes** if used |

### 3.3 Worker (`apps/worker` / Railway)

| Name                      | Staging                  | Production                | Local            | Secret?        |
| ------------------------- | ------------------------ | ------------------------- | ---------------- | -------------- |
| `NODE_ENV`                | as configured            | `production`              | `development`    | No             |
| `DATABASE_URL`            | same staging DB as API   | same production DB as API | local            | **Yes**        |
| `REDIS_URL`               | optional                 | optional                  | optional         | **Yes** if set |
| `RESEND_API_KEY`          | staging                  | production                | empty = mock     | **Yes**        |
| `RESEND_WEBHOOK_SECRET`   | usually unused on worker | usually unused            | optional         | **Yes** if set |
| `EMAIL_FROM`              | staging                  | production                | example          | No             |
| `LEAD_NOTIFICATION_EMAIL` | staging                  | production                | example          | No             |
| `LOG_LEVEL`               | as needed                | as needed                 | `info`           | No             |
| `WORKER_POLL_INTERVAL_MS` | tune                     | tune                      | default          | No             |
| `WORKER_BATCH_SIZE`       | tune                     | tune                      | default          | No             |
| `WORKER_MAX_ATTEMPTS`     | tune                     | tune                      | default          | No             |
| `WORKER_ONCE`             | n/a                      | n/a                       | `1` for one-shot | No             |
| `INLINE_EMAIL_WORKER`     | n/a on dedicated worker  | n/a                       | n/a              | No             |

### 3.4 Root tooling (`.env`)

See root `.env.example` for local aggregate vars used by scripts (`pnpm db:migrate`,
`pnpm availability:set`, `pnpm seed:local`).

### 3.5 Webhook endpoints (not secrets, but owner-configured)

| Endpoint                           | Env var companion       | Owner action                       |
| ---------------------------------- | ----------------------- | ---------------------------------- |
| `https://<api>/v1/webhooks/resend` | `RESEND_WEBHOOK_SECRET` | Register in Resend per environment |

### 3.6 Turnstile key pairs (summary)

| Environment | Site key      | Secret key              | Source                                |
| ----------- | ------------- | ----------------------- | ------------------------------------- |
| Local       | test site key | test secret `1x0000…AA` | Cloudflare test docs / `.env.example` |
| Staging     | owner         | owner                   | Cloudflare Turnstile widget           |
| Production  | owner         | owner                   | Separate widget                       |

---

## 4. Unresolved owner decisions (explicitly flagged)

The following are **owner-supplied and unverified** unless the owner records
independent evidence. This mission **does not invent or approve** them.

| Decision                                                                         | Status                                                                                     | Why it matters                           | Code touchpoints                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| **Real availability** (open/waitlist/paused, next opening dates, capacity notes) | **Owner-supplied / unverified**                                                            | Public API + marketing trust             | `pnpm availability:set`, `site_availability`, public availability endpoint      |
| **Pricing** (public numbers, which tiers shown)                                  | **Owner-supplied / unverified**                                                            | Commercial accuracy                      | `apps/web/src/content/pricing.ts`, `flags.showPublicPricing`, `showOpsPricing`  |
| **Timelines** (delivery dates, “next opening”, launch windows)                   | **Owner-supplied / unverified**                                                            | Misleading if invented                   | Availability notes, homepage/marketing copy modules                             |
| **U.S.-based claims**                                                            | **Owner-supplied / unverified**                                                            | Only publish while operationally true    | `flags.showUsBasedClaim`                                                        |
| **Senior-only claims**                                                           | **Owner-supplied / unverified**                                                            | Only publish while operationally true    | `flags.showSeniorOnlyClaim`                                                     |
| **SLA language** (uptime %, response times, credits)                             | **Owner-supplied / unverified**; default **absent** from contractual promises in this repo | Legal exposure                           | Do not add customer SLA without counsel; incident doc is internal scaffold only |
| **Equity terms** (percentages, structures)                                       | **Owner-supplied / unverified**; public display default **off**                            | Legal/confidential                       | `flags.showExactEquityTerms`, comments in `flags.ts`                            |
| **Cash-only premium** wording/numbers                                            | **Owner-supplied / unverified**; default **off**                                           | Commercial/legal                         | `flags.showCashOnlyPremium`                                                     |
| **Privacy policy & terms of service**                                            | **Legal review required** — pages marked draft                                             | Compliance                               | `legal.ts`, draft markers on deployed pages                                     |
| **Legal review** overall (claims, contracts, privacy, employment, equity offers) | **Owner + counsel**                                                                        | Blocking for final public legal posture  | Entire commercial/legal surface                                                 |
| **DMARC / email brand policy**                                                   | Owner                                                                                      | Deliverability + brand                   | DNS                                                                             |
| **PII retention vs deletion period**                                             | Owner + counsel                                                                            | Backups vs erasure rights                | [backups.md](./backups.md), waitlist deletion runbook                           |
| **On-call / incident comms channel**                                             | Owner                                                                                      | Detection → response                     | [incident-response.md](./incident-response.md)                                  |
| **Production hostname final selection**                                          | Owner                                                                                      | DNS + certs + CORS + Turnstile hostnames | Deployment env tables                                                           |
| **Whether production is open to public traffic**                                 | Owner launch approval                                                                      | Checklist phase 9                        | [owner-launch-checklist.md](./owner-launch-checklist.md)                        |

### Decision rules for contributors

- Do **not** flip claim flags to “true” without owner confirmation that the claim remains operationally accurate.
- Do **not** hard-code scarcity, customer logos, certifications, or SLAs.
- Do **not** publish exact equity or cash-premium figures without counsel.
- Do **not** remove legal draft disclaimers without counsel sign-off recorded by the owner.

---

## 5. What is already in-repo (not owner secrets)

| Item                                 | Location                              | Notes                           |
| ------------------------------------ | ------------------------------------- | ------------------------------- |
| Dependency lockfile                  | `pnpm-lock.yaml`                      | Commit required                 |
| CI workflow                          | `.github/workflows/ci.yml`            | Commit required                 |
| Env **examples**                     | `.env.example`, `apps/*/.env.example` | No live secrets                 |
| Cloudflare **test** Turnstile secret | documented for local only             | Not production                  |
| SQL migrations                       | `packages/db/migrations/`             | Apply with owner `DATABASE_URL` |

---

## 6. Related runbooks

- [Deployment](./deployment.md)
- [Email & Resend](./email-and-resend.md)
- [Turnstile](./turnstile.md)
- [Backups](./backups.md)
- [Content operations](./content-operations.md)
- [Incident response](./incident-response.md)
- [Owner launch checklist](./owner-launch-checklist.md)
