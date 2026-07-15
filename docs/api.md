# API contracts

Fastify service (`apps/api`). Base URL in production is the Railway API host;
locally `http://localhost:4000`. The local live endpoint may reverse-proxy these
routes onto the same origin as the marketing site.

## Request ID contract

| Rule      | Detail                                                                |
| --------- | --------------------------------------------------------------------- |
| Header    | `X-Request-Id` (configurable via `REQUEST_ID_HEADER`)                 |
| Inbound   | When present and matching `^[\w.:-]{1,128}$`, the value is propagated |
| Generated | Otherwise the API generates a UUID                                    |
| Response  | Every response includes `X-Request-Id` with the effective id          |
| Logs      | Request id is attached to structured logs (PII-redacted)              |

## `GET /health`

Composite readiness for live verification. HTTP 200 only when the API process,
PostgreSQL (with migrations), and the email worker heartbeat are ready.
Never includes credentials, signing secrets, authorization headers, email
bodies, or applicant data.

```json
{
  "ready": true,
  "service": "vygo",
  "commit": "abc123…",
  "checks": {
    "api": { "ready": true, "service": "vygo-api" },
    "database": { "ready": true, "status": "ok" },
    "emailWorker": { "ready": true, "status": "ok", "inline": true }
  }
}
```

## `GET /healthz`

Process liveness. No dependency checks.

```json
{ "ok": true, "healthy": true, "service": "vygo-api" }
```

## `GET /version`

Deployed git SHA as `text/plain`, for Ratchet's version-endpoint deploy gate.
The SHA is read from documented build metadata, in order:
`VERCEL_GIT_COMMIT_SHA` → `COMMIT_SHA` → `GIT_COMMIT_SHA` → `GITHUB_SHA`. When no
build-metadata variable is set (e.g. a bare local run), the body is `unknown`.

```
b657ec298a022aa45babc800d61d00ffdd34bc6c
```

## `GET /readyz`

Dependency-aware readiness. HTTP 200 only when PostgreSQL is reachable and all
required Drizzle migrations / schema objects are present. Otherwise HTTP 503.

```json
{
  "ready": true,
  "service": "vygo-api",
  "database": "ok",
  "migrations": "ok",
  "appliedMigrations": ["…"]
}
```

### Readiness when `DATABASE_URL` is absent

`/readyz` is fail-closed: with no `DATABASE_URL` configured it returns HTTP 503
with an explicit `reason` (`"DATABASE_URL not configured"`) rather than falsely
reporting ready. This is the safe local-development default — a probe never
reports a not-yet-provisioned database as ready.

The marketing site served at `www.vygo.ai` is a **static export with no database
dependency**, so it publishes its own edge `/healthz` and `/readyz` (written to
`apps/web/public/` by `scripts/generate-readiness.ts` at prebuild). Those edge
endpoints report `{"ready": true, "database": "not_configured"}` because the
static site has nothing to fail against; the Postgres-aware check above belongs
to the Fastify API deployment where `DATABASE_URL` is provisioned.

## `GET /v1/public/availability`

Public intake status. Response body:

```json
{
  "data": {
    "status": "waitlist",
    "nextOpeningDate": "2026-08-17",
    "engagementType": "audit",
    "displayNote": "Senior-only pods. Limited concurrent engagements.",
    "availableStarts": null,
    "updatedAt": "2026-07-11T18:00:00.000Z"
  }
}
```

### Caching headers

```text
Cache-Control: public, max-age=60, stale-while-revalidate=240
ETag: "<sha256-prefix>"
Vary: Origin, Accept-Encoding
```

Conditional requests: send `If-None-Match` with the current ETag to receive
HTTP 304 and an empty body when unchanged.

### Neutral safe response

Returned (still HTTP 200) when availability data is missing, malformed, stale
(`nextOpeningDate` in the past), or the database lookup fails. Never reports
`waitlist` or `paused` scarcity and never exposes internal errors:

```json
{
  "data": {
    "status": "open",
    "nextOpeningDate": null,
    "engagementType": "general",
    "displayNote": "Request current availability",
    "availableStarts": null,
    "updatedAt": "1970-01-01T00:00:00.000Z"
  }
}
```

Public responses never include database IDs, `updatedBy`, email addresses, stack
traces, or SQL.

## `POST /api/apply`

Public apply-form intake for `/apply` (Full name, Work email, optional Product URL
and message). Validates input, inserts one row into the Railway Postgres
`applications` table, and returns the stored row. The browser posts only to this
server endpoint — never directly to the database.

> **Two deployments, one contract.** On `www.vygo.ai` this is the Vercel edge
> function [`api/apply/index.ts`](../api/apply/index.ts). When the edge has no
> `DATABASE_URL` it proxies server-to-server to the Railway Fastify route of the
> same path ([`apps/api/src/routes/apply.ts`](../apps/api/src/routes/apply.ts)).
> Audit notes: [apply-audit.md](./apply-audit.md) and `GET /apply-audit.json`.

### Request body

```json
{
  "full_name": "Ratchet Tester",
  "work_email": "ratchet-tester@example.com",
  "product_url": "https://example.com",
  "message": "Optional product description"
}
```

`full_name` / `fullName` and `work_email` / `workEmail` / `email` are accepted.
`full_name` must be non-empty after trim. `work_email` must look like
`local@domain.tld` (must include `@` and a domain with a dot).

### Success

HTTP 201:

```json
{
  "id": "4ef82faa-2a39-4c34-8ee3-d44eb7e68a40",
  "full_name": "Ratchet Tester",
  "work_email": "ratchet-tester@example.com",
  "product_url": null,
  "message": null,
  "source": "apply",
  "created_at": "2026-07-15T23:10:59.424Z"
}
```

### Validation errors

HTTP 400 with no row `id` when `full_name` is empty or `work_email` is
implausible (e.g. `not-an-email`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "full_name is required and must be non-empty."
  }
}
```

## `GET /api/apply/:id`

Read-back of a stored applications row (proves durable persistence across
independent requests). HTTP 200 with the same public row shape as POST success;
HTTP 400 for a non-UUID id; HTTP 404 when missing.

## CORS

Two classes of origin receive a reflected `Access-Control-Allow-Origin`
(never a `*` wildcard):

1. **Exact allowlist** — the production marketing origins `https://www.vygo.ai`
   and `https://vygo.ai` (always allowed), plus any origins configured via the
   comma-separated `CORS_ORIGINS` / `ALLOWED_ORIGINS` env.
2. **Vercel preview origins (documented policy)** — the `vygo` project's preview
   deployments on `https://vygo-<deployment|git-branch>-<scope>.vercel.app`,
   matched by the pattern `^https://vygo(-[a-z0-9-]+)?\.vercel\.app$`. Matching
   origins are reflected individually.

Every other origin — including arbitrary `*.vercel.app` domains that are not the
vygo project, and any unrelated site — receives **no** permissive ACAO value. An
unrestricted production `*` wildcard is never emitted. The same policy is applied
by the Railway API (`apps/api/src/cors.ts`) and by the Vercel edge health/waitlist
surfaces (`api/_lib/http.ts`).

## Payload limits

Default body limit is 64 KiB (`BODY_LIMIT_BYTES`). Oversized requests receive
HTTP 413:

```json
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Request payload is too large."
  }
}
```

## `POST /v1/waitlist`

Secure waitlist intake. Requires an allowed `Origin`, `Content-Type: application/json`,
server-side Cloudflare Turnstile verification, privacy consent, and normalized fields.

> **Two deployments, one contract.** On the static marketing site
> (`www.vygo.ai`) this path is served by the Vercel Serverless Function
> [`api/waitlist.ts`](../api/waitlist.ts) (rewritten from `/v1/waitlist`). The
> edge function validates, persists to `waitlist_entries` with an atomic
> `ON CONFLICT (email)` upsert (safe duplicate handling), and returns sanitized
> errors; it does not require Turnstile (the intake channel is recorded as
> `source = 'web'`). The Fastify service below is the full-featured intake
> (Turnstile, Redis rate limits, transactional email outbox) for a Railway
> backend. Both share the same migrations and success/validation response
> shapes. See [deployment.md](./deployment.md#waitlist-persistence-on-the-edge-vercel-serverless-function).

### Success (new or duplicate email)

HTTP 200 — returned **before** provider delivery. New applications include a
durable `applicationId` and a transactional email queue summary. Marketing
consent is reported separately from email job state. Abuse silent-accepts omit
identifiers. Email addresses and bodies are never returned.

```json
{
  "data": {
    "accepted": true,
    "message": "Your application has been received.",
    "applicationId": "8f3c…",
    "marketingConsent": false,
    "email": {
      "queued": true,
      "jobCount": 2,
      "kinds": ["applicant_confirmation", "internal_lead_notification"]
    }
  }
}
```

New leads enqueue **two** transactional outbox jobs with stable non-secret
provider idempotency keys (`applicant-confirmation:{id}`,
`internal-lead-notification:{id}`). Duplicate email updates and idempotent
retries do not create additional deliveries.

### Validation error

HTTP 400:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please review the highlighted fields.",
    "fields": {
      "email": "Enter a valid work email."
    }
  }
}
```

### Rate limited

HTTP 429:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many attempts. Please try again later or email hello@vygo.ai."
  }
}
```

### Other documented errors

| Status | Code                     | When                                          |
| ------ | ------------------------ | --------------------------------------------- |
| 403    | `FORBIDDEN_ORIGIN`       | Missing or disallowed `Origin`                |
| 405    | `METHOD_NOT_ALLOWED`     | Non-POST methods                              |
| 409    | `IDEMPOTENCY_CONFLICT`   | Idempotency key reused with different payload |
| 413    | `PAYLOAD_TOO_LARGE`      | Body exceeds `BODY_LIMIT_BYTES`               |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | Content-Type is not JSON                      |
| 400    | `TURNSTILE_FAILED`       | Missing/invalid/failed Turnstile token        |
| 500    | `INTERNAL_ERROR`         | Persistence failure (generic; no PII)         |

### Processing order

1. Payload-size limit
2. Content-Type check
3. Origin allowlist
4. Honeypot / min completion time (abuse → generic 200, no persistence)
5. IP- and email-aware Redis (or memory) rate limits
6. Server-side Turnstile verification (no request-level bypass)
7. Zod validate + normalize (email lower/trim, HTTPS URL)
8. Idempotency lookup / conflict
9. Atomic lead upsert + dual transactional outbox insert (applicant + internal)
10. Success response with durable application id (no provider wait)

## `POST /v1/webhooks/resend`

Idempotent Resend webhook (Svix signatures). Missing/invalid signature → 4xx
and **no** event persistence. Valid signature → 2xx and one row per
`provider_event_id` (duplicates still 2xx).

Safe event inspection (test surface): `GET /v1/test-support/events?providerEventId=`.

### Request fields (strict)

| Field                | Required | Notes                                                                               |
| -------------------- | -------- | ----------------------------------------------------------------------------------- |
| `fullName`           | yes      | trim, max 120                                                                       |
| `email`              | yes      | trim + lowercase, max 254                                                           |
| `companyName`        | yes      | trim, max 160                                                                       |
| `productUrl`         | yes      | HTTPS (http only for localhost)                                                     |
| `stage`              | yes      | `prototype` \| `private_beta` \| `live_users` \| `revenue` \| `enterprise_pipeline` |
| `primaryBlocker`     | yes      | enum per schema                                                                     |
| `desiredStartWindow` | yes      | `asap` \| `within_30_days` \| `within_60_days` \| `this_quarter` \| `later`         |
| `message`            | yes      | short description, max 4000                                                         |
| `privacyAccepted`    | yes      | must be `true`                                                                      |
| `turnstileToken`     | yes      | verified server-side only                                                           |
| `role`               | no       |                                                                                     |
| `prototypePlatform`  | no       |                                                                                     |
| `budgetRange`        | no       | `under_25k` … `300k_plus` \| `not_determined`                                       |
| `commercialDeadline` | no       | boolean                                                                             |
| `marketingConsent`   | no       | boolean; separate from privacy                                                      |
| `idempotencyKey`     | no       | UUID; also accepted via `Idempotency-Key` header                                    |
| `utm`                | no       | `{ source, medium, campaign, content, term }` each max 128 chars                    |
| `landingPage`        | no       |                                                                                     |
| `referrer`           | no       |                                                                                     |
| `website`            | no       | **honeypot** — must be empty                                                        |
| `formStartedAt`      | no       | ms epoch or ISO; too-quick is an abuse signal                                       |

Duplicate emails update mutable fields and last-seen metadata, preserve first-seen
timestamps and original UTM/landing/referrer attribution, and return the same success body.

### Lead scoring (internal)

Deterministic weights (never returned on public success responses):

- Stage: private_beta +1, live_users +2, revenue +3, enterprise_pipeline +4
- Commercial deadline +3
- Desired start asap / within_30_days +2
- Budget 75k+ +2
- Security / security_compliance blocker +2

### Non-production test surface

When `ENABLE_TEST_SURFACE=true`, non-production `NODE_ENV`, or Cloudflare test
Turnstile secrets are configured. **Discoverability:** black-box testers should
start at `GET /v1/test-support` (also advertised as `testSupport` on `/readyz`
when enabled). In production-strict mode every path below returns 404.

| Method       | Path                                       | Purpose                                                               |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `GET`        | `/v1/test-support`                         | Catalog of all test-support routes                                    |
| `GET`        | `/v1/test-support/report`                  | Live integration-test report (coverage for intake scenarios)          |
| `GET`        | `/v1/test-support/email-report`            | React Email render, worker, webhook, shutdown, redaction suites       |
| `GET`        | `/v1/test-support/leads?email=`            | PII-safe lead inspection (score, UTM, versioned `ipHash`, timestamps) |
| `GET`        | `/v1/test-support/outbox?email=`           | Transactional outbox inspection (count/kind/status; no raw email)     |
| `GET`        | `/v1/test-support/jobs?applicationId=`     | Safe job status (kinds, statuses, provider idempotency keys)          |
| `GET`        | `/v1/test-support/events?providerEventId=` | Safe webhook event status / dedup count                               |
| `GET`/`POST` | `/v1/test-support/fault`                   | Arm lead/outbox persistence fault for next N intakes (`{mode,count}`) |
| `POST`       | `/v1/test-support/score`                   | Deterministic score preview (non-persisting)                          |
| `GET`        | `/v1/test-support/ip-hash?ip=`             | Versioned salted hash + rotation window                               |
| `GET`        | `/v1/test/waitlist/inspect?email=`         | Legacy alias of leads inspection                                      |
| `GET`        | `/v1/test/ip-hash?ip=`                     | Legacy alias of IP hash                                               |
| `POST`       | `/v1/test/score`                           | Legacy alias of score                                                 |
| `GET`        | `/v1/test/integration-report`              | Legacy alias of report                                                |

Fault injection example (non-production only):

```http
POST /v1/test-support/fault
Content-Type: application/json

{"mode":"outbox","count":1}
```

The next `POST /v1/waitlist` then returns a generic `500 INTERNAL_ERROR` and neither
lead nor outbox remains committed. Modes: `lead`, `outbox`, `none`.

Strict production (real Turnstile secret, `ENABLE_TEST_SURFACE=false`) does not
register these routes. Request fields/headers/query can never activate a Turnstile bypass.

### Turnstile (local / CI)

Use Cloudflare official test secrets via `TURNSTILE_SECRET_KEY`, or inject a
`TurnstileVerifier` adapter in process tests. Production must use real secrets.

## Operations

```bash
# Apply checked-in SQL migrations
DATABASE_URL=… pnpm db:migrate

# Seed local availability singleton
DATABASE_URL=… pnpm seed:local

# Update availability (shows current value first)
DATABASE_URL=… pnpm availability:set --status waitlist --date 2026-08-17 --type audit --note "…" --updated-by ops --dry-run
DATABASE_URL=… pnpm availability:set --status open --date 2026-08-17 --updated-by ops
# Production writes require --confirm-production

# API integration tests (requires Postgres)
DATABASE_URL_TEST=postgresql://vygo:vygo@localhost:5432/vygo_test pnpm test:integration
```
