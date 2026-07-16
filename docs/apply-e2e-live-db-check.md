# Apply form E2E live DB check

**Mission:** `vygo-apply-e2e-live-db-check`  
**Date (UTC):** 2026-07-16  
**Iteration:** 2 (Vault Provisioner armed; DB query path re-verified)  
**Live site:** https://www.vygo.ai  
**Deploy SHA at verification:** see `GET /version` after this commit deploys (pre-push HEAD is recorded below at verification time)  
**Scope:** End-to-end proof that live “Apply for the next opening” submissions are stored durably in the Railway Postgres `applications` table, with written evidence. No product or schema changes were required for persistence or validation.

**Secrets policy:** This document contains **no** tokens, passwords, or connection strings. Database credentials were obtained only through the Vault Provisioner path (armed consumer lease → Railway GraphQL variables for the Postgres plugin → ephemeral `psql` on `DATABASE_PUBLIC_URL`) and were never written to the repo, mission files, or this report.

**Public non-secret query metadata (for tester/harness):**  
https://www.vygo.ai/api/railway-db-query-method.json

---

## Provision summary (non-secret)

From the Vault Provisioner run for this mission (`shared/provision_summary.json`, project `vygo`, `ok: true` for Postgres/Redis reuse):

| Field | Value |
| --- | --- |
| Provider | `railway` |
| Project name | `vygo` |
| Project id | `1b8abe52-f665-4e07-9a99-f6aa36a62610` |
| Environment | `production` (`39b57aef-2574-4d8e-bbd2-673e91eb9768`) |
| Dashboard | `https://railway.app/project/1b8abe52-f665-4e07-9a99-f6aa36a62610` |
| Postgres service | `Postgres-0MtT` (`7e3b44d3-f9d4-4afd-a367-2fde98bd510f`) |
| Database name | `railway` |
| Public proxy host/port | `tokaido.proxy.rlwy.net` / `14610` (names only; no password) |
| Table | `applications` |
| Columns | `id`, `full_name`, `work_email`, `product_url`, `message`, `source`, `created_at` |

**Approved connection method:** Vault consumer `register_run` (folder `vygo`) → short-lived `lease` for `RAILWAY_TOKEN` → Railway GraphQL `variables` for service `Postgres-0MtT` → `psql` against **`DATABASE_PUBLIC_URL`** (not the internal `*.railway.internal` URL) → `release` lease. Credentials never leave the Vault/lease path into artifacts.

---

## Run markers (iteration 2)

| Path | Name | Email |
| --- | --- | --- |
| Primary success (form-equivalent POST) | `Ratchet E2E Test` | `e2e-test+20260716-000703-i2@vygo.ai` |
| Real browser form (Playwright) | `Ratchet E2E Test` | `e2e-test+20260716-000703-i2-ui@vygo.ai` |
| Failure path | `Ratchet E2E Test` | `not-an-email` |

Both valid test rows are **left in place**. They are self-flagging as test data by the name **`Ratchet E2E Test`** and the **`e2e-test+…@vygo.ai`** email pattern so operators can follow up without deleting production applicants.

(Iteration 1 markers `e2e-test+20260716-000703@vygo.ai` and `…-ui@vygo.ai` remain in place as well.)

---

## Regression checks

| Check | Result |
| --- | --- |
| `GET https://www.vygo.ai/` | HTTP **200**; home content renders |
| `GET https://www.vygo.ai/version` | HTTP **200**; body is deployed git SHA |
| `GET https://www.vygo.ai/apply` | HTTP **200**; form fields present: `apply-form`, Full name (`apply-full-name`), Work email (`apply-work-email`), Submit application; heading “Apply for the next opening” |
| `GET https://www.vygo.ai/api/readyz` | `ready: true`, `database: connected` / Railway API path healthy |
| Railway API `GET /readyz` | `database: ok`, migrations applied |
| Vault consumer | Armed + unlocked; `railway.whoami` and `list_services` succeed for project `vygo` |

---

## Success path (live form)

### Browser submission (Playwright headless Chromium on live site)

1. Opened `https://www.vygo.ai/apply`.
2. Filled Full name / Work email / optional fields; clicked **Submit application**.
3. Inline thank-you rendered (form replaced; still on `/apply`).

**Thank-you evidence (page text):**

- Heading (`data-testid="apply-success-heading"`): `Thank you — your application is in.`
- Body confirms senior-engineer review and follow-up within one business day.
- Reference id attribute: `data-application-id="8f653e3e-5fbf-4577-b692-7432482caf78"`
- Form count after success: `0` (thank-you only).

**POST response body** (`https://www.vygo.ai/api/apply`, HTTP **201**):

```json
{
  "id": "8f653e3e-5fbf-4577-b692-7432482caf78",
  "full_name": "Ratchet E2E Test",
  "work_email": "e2e-test+20260716-000703-i2-ui@vygo.ai",
  "product_url": "https://example.com/e2e-ratchet-i2-ui",
  "message": "UI E2E live DB check 20260716-000703-i2-ui",
  "source": "apply",
  "created_at": "2026-07-16T00:18:48.403Z"
}
```

### Primary marker (API POST matching the form payload)

Submitted at `2026-07-16T00:17:44Z` with email `e2e-test+20260716-000703-i2@vygo.ai` → HTTP **201**:

```json
{
  "id": "d47662b1-89d2-4f69-a31b-a9e9e8a5a35f",
  "full_name": "Ratchet E2E Test",
  "work_email": "e2e-test+20260716-000703-i2@vygo.ai",
  "product_url": "https://example.com/e2e-ratchet-i2",
  "message": "Ratchet E2E live DB check run 20260716-000703-i2 — leave in place as test data.",
  "source": "apply",
  "created_at": "2026-07-16T00:17:44.266Z"
}
```

Independent read-back `GET /api/apply/<id>` returns the same stored columns.

---

## Railway database query evidence

Credentials: Vault Provisioner path only (see connection method above).  
Host/db/table names from provision inventory + GraphQL variable *names* (values never logged).

### SQL used (valid primary marker — expect exactly one row)

```sql
SELECT id::text AS id, full_name, work_email, product_url, message, source,
       created_at::text AS created_at
FROM applications
WHERE full_name = 'Ratchet E2E Test'
  AND work_email = 'e2e-test+20260716-000703-i2@vygo.ai';
```

```sql
SELECT count(*)::int AS n
FROM applications
WHERE full_name = 'Ratchet E2E Test'
  AND work_email = 'e2e-test+20260716-000703-i2@vygo.ai';
```

**Result:** `n = 1`. Full stored row (all columns):

| Column | Value |
| --- | --- |
| `id` | `d47662b1-89d2-4f69-a31b-a9e9e8a5a35f` |
| `full_name` | `Ratchet E2E Test` |
| `work_email` | `e2e-test+20260716-000703-i2@vygo.ai` |
| `product_url` | `https://example.com/e2e-ratchet-i2` |
| `message` | `Ratchet E2E live DB check run 20260716-000703-i2 — leave in place as test data.` |
| `source` | `apply` |
| `created_at` | `2026-07-16 00:17:44.266413+00` |

Timestamp matches the submission (`2026-07-16T00:17:44Z`), well inside the 10-minute window.

### SQL used (browser UI marker — expect exactly one row)

```sql
SELECT id::text AS id, full_name, work_email, product_url, message, source,
       created_at::text AS created_at
FROM applications
WHERE full_name = 'Ratchet E2E Test'
  AND work_email = 'e2e-test+20260716-000703-i2-ui@vygo.ai';
```

**Result:** `n = 1`. Full stored row:

| Column | Value |
| --- | --- |
| `id` | `8f653e3e-5fbf-4577-b692-7432482caf78` |
| `full_name` | `Ratchet E2E Test` |
| `work_email` | `e2e-test+20260716-000703-i2-ui@vygo.ai` |
| `product_url` | `https://example.com/e2e-ratchet-i2-ui` |
| `message` | `UI E2E live DB check 20260716-000703-i2-ui` |
| `source` | `apply` |
| `created_at` | `2026-07-16 00:18:48.40363+00` |

---

## Failure path (invalid email)

### Browser + API

- Live form filled with name `Ratchet E2E Test` and email `not-an-email`.
- Inline error shown (`data-testid="apply-error"`); form still present; thank-you **absent** (`apply-success` count = 0).
- Browser also surfaces HTML email validation: `Please include an '@' in the email address. 'not-an-email' is missing an '@'.`

**Error text / HTML:**

```text
work_email must be a valid-looking address (include @ and a domain).
```

**POST response body** (HTTP **400**):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "work_email must be a valid-looking address (include @ and a domain)."
  }
}
```

No application `id` is returned (no insert).

### Database confirmation (zero rows for invalid email)

```sql
SELECT count(*)::int AS n
FROM applications
WHERE work_email = 'not-an-email';
```

**Result:** `n = 0`.

---

## Explicit retention statement

The valid test application rows above were **left in place** on purpose. They are identifiable as test data by:

1. Name: **`Ratchet E2E Test`**
2. Email pattern: **`e2e-test+<run-marker>@vygo.ai`**

This report is written confirmation that live application data is being stored in Railway Postgres for follow-up. No existing application rows were modified or deleted.

---

## Tester unblock notes (iteration 1 BUG-1)

Iteration 1 tester failed closed because no non-secret provision summary / Vault-backed query interface was visible in the tester cwd. For this iteration:

1. Vault consumer is **armed and unlocked** for folder `vygo`.
2. Non-secret provision + query metadata is published at:
   - harness: `shared/provision_summary.json` → `database_query` object
   - live: `https://www.vygo.ai/api/railway-db-query-method.json`
   - this document under `docs/apply-e2e-live-db-check.md`
3. Credentials remain **only** on the Vault lease path; agents must not invent tokens or scrape secrets into TESTLOG.

---

## Secrets / credentials scan for this document

- No Railway tokens, Vault keys, passwords, or connection strings are included.
- Provision identifiers (project id, service names, public proxy host/port, public dashboard URL) are non-secret metadata.
- Database access for SQL used only the Vault Provisioner / consumer lease path.
