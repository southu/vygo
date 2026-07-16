# Ops readiness list (internal, read-only v1)

**Live path:** https://www.vygo.ai/ops/readiness  
**Data API (same-origin only):**

| Method | Path                       | Purpose                            |
| ------ | -------------------------- | ---------------------------------- |
| GET    | `/v1/ops/readiness`        | Filtered list (JSON)               |
| GET    | `/v1/ops/readiness/export` | CSV of the current filtered view   |
| GET    | `/v1/ops/readiness/:id`    | Submission + internal brief detail |

## Auth (existing ops pattern)

HTTP **Basic Auth**. Credentials are read only from process environment:

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `OPS_BASIC_AUTH_USER`     | Username (default `ops` when password is set)            |
| `OPS_BASIC_AUTH_PASSWORD` | Password (**required**; fail closed with 401 when unset) |

Unauthenticated requests to `/v1/ops/*` return **401** with `WWW-Authenticate: Basic` and never include readiness rows.

The browser UI at `/ops/readiness` prompts for credentials and stores them in `sessionStorage` for the tab only. Credentials are never embedded in page source, client bundles, or `NEXT_PUBLIC_*` config.

## Filters

Query parameters on list and CSV export:

| Param    | Description                                                   |
| -------- | ------------------------------------------------------------- |
| `bucket` | Exact bucket match (e.g. `Launch`, `Enterprise`, `Not a fit`) |
| `from`   | Inclusive start date (`YYYY-MM-DD` or ISO)                    |
| `to`     | Inclusive end date (`YYYY-MM-DD` or ISO)                      |

## CSV safety

Export columns: `id`, `created_at`, `bucket`, `company`, `contact_name`, `contact_email`, `overall_score`, `discrepancy_flag_count`, `has_brief`.

No raw paste fields. Data is stored redacted upstream; export does not add a leak path.

## Detail / brief

Opening a row loads scores, bucket, discrepancy flags, parsed report, talking points, and redacted paste only (if present).

## Browser API origin

All requests target **https://www.vygo.ai** (relative `/v1/ops/...`). Do not call `api.vygo.ai` from client code.
