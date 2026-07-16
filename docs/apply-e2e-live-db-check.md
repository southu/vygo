# Apply form E2E live DB check

**Mission:** `vygo-apply-e2e-live-db-check`  
**Date (UTC):** 2026-07-16  
**Live site:** https://www.vygo.ai  
**Deploy SHA verified:** `1ad9a05926db963b557b541d4625d6a74566f444` (matches `main` HEAD at verification time)  
**Scope:** End-to-end proof that live “Apply for the next opening” submissions are stored durably in the Railway Postgres `applications` table, with written evidence. No product or schema changes were required.

**Secrets policy:** This document contains **no** tokens, passwords, or connection strings. Database credentials were obtained only through the Vault Provisioner path (armed consumer lease → Railway GraphQL variable fetch for the Postgres plugin) and used ephemerally for `psql`. They were never written to the repo, mission files, or this report.

---

## Provision summary (non-secret)

From the Vault Provisioner run for this mission (`shared/provision.json`, `ok: true`):

| Field | Value |
| --- | --- |
| Provider | `railway` |
| Project name | `vygo` |
| Project id | `1b8abe52-f665-4e07-9a99-f6aa36a62610` |
| Dashboard | `https://railway.app/project/1b8abe52-f665-4e07-9a99-f6aa36a62610` |
| Postgres | present / reused (`ok: true`) |
| Redis | present / reused (`ok: true`) |
| Services | `api`, `worker`, `Postgres`, `Postgres-0MtT`, `Redis` |
| Table | `applications` (columns: `id`, `full_name`, `work_email`, `product_url`, `message`, `source`, `created_at`) |

**Connection method used for SQL evidence:** Vault consumer lease of the Railway credential → Railway GraphQL `variables` for service `Postgres-0MtT` → ephemeral `psql` against the public Postgres URL. Connection material never appears below.

---

## Run markers

| Path | Name | Email |
| --- | --- | --- |
| API/form-equivalent (primary marker) | `Ratchet E2E Test` | `e2e-test+20260716-000703@vygo.ai` |
| Real browser form (Playwright) | `Ratchet E2E Test` | `e2e-test+20260716-000703-ui@vygo.ai` |
| Failure path | `Ratchet E2E Test` | `not-an-email` |

Both valid test rows are **left in place**. They are self-flagging as test data by the name **`Ratchet E2E Test`** and the **`e2e-test+…@vygo.ai`** email pattern so operators can follow up without deleting production applicants.

---

## Regression checks

| Check | Result |
| --- | --- |
| `GET https://www.vygo.ai/` | HTTP **200**; home heading present: “Turn your working prototype into production-grade software.” |
| `GET https://www.vygo.ai/version` | HTTP **200**; body `1ad9a05926db963b557b541d4625d6a74566f444` |
| `GET https://www.vygo.ai/apply` | HTTP **200**; form fields in page source: `apply-form`, Full name (`apply-full-name`), Work email (`apply-work-email`), Submit application; heading “Apply for the next opening” |
| `GET https://www.vygo.ai/api/readyz` | `ready: true`, `database: connected` / Railway API path healthy |
| Railway API `GET /readyz` | `database: ok`, migrations applied |

---

## Success path (live form)

### Browser submission (Playwright headless Chromium on live site)

1. Opened `https://www.vygo.ai/apply`.
2. Filled Full name / Work email / optional fields; clicked **Submit application**.
3. Inline thank-you rendered (form replaced; still on `/apply`).

**Thank-you evidence (page HTML / text):**

- Heading (`data-testid="apply-success-heading"`): `Thank you — your application is in.`
- Message confirms senior-engineer review and follow-up within one business day.
- Reference id attribute: `data-application-id="4b4ee93d-6a63-4bc8-85ec-76de7338f36e"`
- Form count after success: `0` (thank-you only).

**POST response body** (`https://www.vygo.ai/api/apply`, HTTP **201**):

```json
{
  "id": "4b4ee93d-6a63-4bc8-85ec-76de7338f36e",
  "full_name": "Ratchet E2E Test",
  "work_email": "e2e-test+20260716-000703-ui@vygo.ai",
  "product_url": "https://example.com/e2e-ratchet-ui",
  "message": "UI E2E live DB check 20260716-000703-ui",
  "source": "apply",
  "created_at": "2026-07-16T00:10:32.681Z"
}
```

**Independent read-back** (`GET https://www.vygo.ai/api/apply/4b4ee93d-6a63-4bc8-85ec-76de7338f36e`, HTTP **200**): same columns/values as above.

### Primary marker (API POST matching the form payload)

Submitted at `2026-07-16T00:09:40Z` with email `e2e-test+20260716-000703@vygo.ai` → HTTP **201**, id `e6c1dc96-fa60-462b-a313-a489467eca8c`.

---

## Railway database query evidence

Credentials: Vault Provisioner path only (see connection method above).  
Host/db/table names from provision inventory: project `vygo`, service `Postgres-0MtT`, table `applications`.

### SQL used (valid primary marker — expect exactly one row)

```sql
SELECT id::text AS id, full_name, work_email, product_url, message, source,
       created_at::text AS created_at
FROM applications
WHERE full_name = 'Ratchet E2E Test'
  AND work_email = 'e2e-test+20260716-000703@vygo.ai';
```

```sql
SELECT count(*)::int AS n
FROM applications
WHERE full_name = 'Ratchet E2E Test'
  AND work_email = 'e2e-test+20260716-000703@vygo.ai';
```

**Result:** `n = 1`. Full stored row (all columns):

| Column | Value |
| --- | --- |
| `id` | `e6c1dc96-fa60-462b-a313-a489467eca8c` |
| `full_name` | `Ratchet E2E Test` |
| `work_email` | `e2e-test+20260716-000703@vygo.ai` |
| `product_url` | `https://example.com/e2e-ratchet` |
| `message` | `Ratchet E2E live DB check run 20260716-000703 — leave in place as test data.` |
| `source` | `apply` |
| `created_at` | `2026-07-16 00:09:40.921977+00` |

Timestamp is within seconds of the submission (`2026-07-16T00:09:40Z`), well inside the 10-minute window.

### SQL used (browser UI marker — expect exactly one row)

```sql
SELECT id::text AS id, full_name, work_email, product_url, message, source,
       created_at::text AS created_at
FROM applications
WHERE full_name = 'Ratchet E2E Test'
  AND work_email = 'e2e-test+20260716-000703-ui@vygo.ai';
```

**Result:** `n = 1`. Full stored row:

| Column | Value |
| --- | --- |
| `id` | `4b4ee93d-6a63-4bc8-85ec-76de7338f36e` |
| `full_name` | `Ratchet E2E Test` |
| `work_email` | `e2e-test+20260716-000703-ui@vygo.ai` |
| `product_url` | `https://example.com/e2e-ratchet-ui` |
| `message` | `UI E2E live DB check 20260716-000703-ui` |
| `source` | `apply` |
| `created_at` | `2026-07-16 00:10:32.681443+00` |

---

## Failure path (invalid email)

### Browser + API

- Live form filled with name `Ratchet E2E Test` and email `not-an-email`.
- Inline error shown (`data-testid="apply-error"`); form still present; thank-you **absent** (`apply-success` count = 0).

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

## Secrets / credentials scan for this document

- No Railway tokens, Vault keys, passwords, or connection strings are included.
- Provision identifiers (project id, service names, public dashboard URL) are non-secret.
- Database access for SQL used only the Vault Provisioner / consumer lease path.
