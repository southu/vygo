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

## `GET /healthz`

Process liveness. No dependency checks.

```json
{ "ok": true, "healthy": true, "service": "vygo-api" }
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

## CORS

`CORS_ORIGINS` / `ALLOWED_ORIGINS` is a comma-separated allowlist. Only listed
origins receive `Access-Control-Allow-Origin`. Unlisted origins receive no
permissive ACAO value.

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
```
