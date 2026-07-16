# Apply form E2E live DB check

**Mission:** `vygo-apply-e2e-live-db-check`  
**Date (UTC):** 2026-07-16  
**Iteration:** 4 (Vault UI consumer unlocked/armed for folder `vygo`; consumer key installed at the standard host path mode `0600` so tester preflight no longer returns `missing_consumer_key`; prior DB evidence retained)  
**Live site:** https://www.vygo.ai  
**Deploy SHA at verification:** see `GET /version` after this commit deploys (pre-push HEAD is recorded below at verification time)  
**Scope:** End-to-end proof that live “Apply for the next opening” submissions are stored durably in the Railway Postgres `applications` table, with written evidence. No product or schema changes were required for persistence or validation. Iteration 4 is a **provisioning/test-harness** fix only.

**Secrets policy:** This document contains **no** tokens, passwords, connection strings, or consumer key material. Database credentials are obtained only through the Vault Provisioner path (armed consumer lease → Railway GraphQL variables for the Postgres plugin → ephemeral `psql` on `DATABASE_PUBLIC_URL`) and are never written to the repo, mission files, TESTLOG, verdicts, or this report.

**Public non-secret query metadata (for tester/harness):**  
https://www.vygo.ai/api/railway-db-query-method.json

**Callable Vault Provisioner interface:** `vault-provisioner-query` on `PATH` (alias `vault-consumer`).

- **Preflight (required before any live form or SQL check):** `vault-provisioner-query status` — expect `ok: true`, `consumer_key_present: true`, `armed: true`, `vault_unlocked: true`.
- **Query:** `vault-provisioner-query sql --folder vygo --run-id <unique-id> --from-summary scratch/provision_summary_nonsecret.json --sql "<approved SELECT>"`.
- **Host preconditions (iteration 4):** Vault consumer for folder `vygo` is unlocked and armed; the consumer key is installed at a **standard host path outside the repo** with mode `0600` (see Vault README: `~/.config/ratchet/vault_consumer.key`). The key is never staged into the product repository, tester workspace artifacts, or git history.
- The CLI never prints tokens, passwords, or connection strings.

---

## Provision summary (non-secret)

From the Vault Provisioner run for this mission (`shared/provision_summary.json`, project `vygo`, `ok: true` for Postgres/Redis reuse):

| Field                  | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Provider               | `railway`                                                                         |
| Project name           | `vygo`                                                                            |
| Project id             | `1b8abe52-f665-4e07-9a99-f6aa36a62610`                                            |
| Environment            | `production` (`39b57aef-2574-4d8e-bbd2-673e91eb9768`)                             |
| Dashboard              | `https://railway.app/project/1b8abe52-f665-4e07-9a99-f6aa36a62610`                |
| Postgres service       | `Postgres-0MtT` (`7e3b44d3-f9d4-4afd-a367-2fde98bd510f`)                          |
| Database name          | `railway`                                                                         |
| Public proxy host/port | `tokaido.proxy.rlwy.net` / `14610` (names only; no password)                      |
| Table                  | `applications`                                                                    |
| Columns                | `id`, `full_name`, `work_email`, `product_url`, `message`, `source`, `created_at` |

**Approved connection method:** Prefer the callable CLI **`vault-provisioner-query`** (on `PATH`; alias `vault-consumer`), which performs: Vault consumer `register_run` (folder `vygo`) → short-lived `lease` for `RAILWAY_TOKEN` → Railway GraphQL `variables` for service `Postgres-0MtT` → `psql` against **`DATABASE_PUBLIC_URL`** (not the internal `*.railway.internal` URL) → `release` lease. Credentials never leave the Vault/lease path into artifacts.

---

## Run markers (iteration 2)

| Path                                   | Name               | Email                                    |
| -------------------------------------- | ------------------ | ---------------------------------------- |
| Primary success (form-equivalent POST) | `Ratchet E2E Test` | `e2e-test+20260716-000703-i2@vygo.ai`    |
| Real browser form (Playwright)         | `Ratchet E2E Test` | `e2e-test+20260716-000703-i2-ui@vygo.ai` |
| Failure path                           | `Ratchet E2E Test` | `not-an-email`                           |

Both valid test rows are **left in place**. They are self-flagging as test data by the name **`Ratchet E2E Test`** and the **`e2e-test+…@vygo.ai`** email pattern so operators can follow up without deleting production applicants.

(Iteration 1 markers `e2e-test+20260716-000703@vygo.ai` and `…-ui@vygo.ai` remain in place as well.)

---

## Regression checks

| Check                                | Result                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET https://www.vygo.ai/`           | HTTP **200**; home content renders                                                                                                                                                                                                       |
| `GET https://www.vygo.ai/version`    | HTTP **200**; body is deployed git SHA                                                                                                                                                                                                   |
| `GET https://www.vygo.ai/apply`      | HTTP **200**; form fields present: `apply-form`, Full name (`apply-full-name`), Work email (`apply-work-email`), Submit application; heading “Apply for the next opening”                                                                |
| `GET https://www.vygo.ai/api/readyz` | `ready: true`, `database: connected` / Railway API path healthy                                                                                                                                                                          |
| Railway API `GET /readyz`            | `database: ok`, migrations applied                                                                                                                                                                                                       |
| Vault consumer                       | Armed + unlocked for folder `vygo`; consumer key present at standard host path (mode `0600`); `vault-provisioner-query status` / `whoami` / approved `sql` succeed (including under capability-dropped root matching the tester sandbox) |

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
Host/db/table names from provision inventory + GraphQL variable _names_ (values never logged).

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

| Column        | Value                                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| `id`          | `d47662b1-89d2-4f69-a31b-a9e9e8a5a35f`                                            |
| `full_name`   | `Ratchet E2E Test`                                                                |
| `work_email`  | `e2e-test+20260716-000703-i2@vygo.ai`                                             |
| `product_url` | `https://example.com/e2e-ratchet-i2`                                              |
| `message`     | `Ratchet E2E live DB check run 20260716-000703-i2 — leave in place as test data.` |
| `source`      | `apply`                                                                           |
| `created_at`  | `2026-07-16 00:17:44.266413+00`                                                   |

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

| Column        | Value                                        |
| ------------- | -------------------------------------------- |
| `id`          | `8f653e3e-5fbf-4577-b692-7432482caf78`       |
| `full_name`   | `Ratchet E2E Test`                           |
| `work_email`  | `e2e-test+20260716-000703-i2-ui@vygo.ai`     |
| `product_url` | `https://example.com/e2e-ratchet-i2-ui`      |
| `message`     | `UI E2E live DB check 20260716-000703-i2-ui` |
| `source`      | `apply`                                      |
| `created_at`  | `2026-07-16 00:18:48.40363+00`               |

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

## Tester unblock notes

### Iteration 1 — BUG-1 (metadata missing)

Iteration 1 tester failed closed because no non-secret provision summary / Vault-backed query interface was visible in the tester cwd.

### Iteration 2 — partial unblock

Non-secret provision + query metadata was published, but the tester still had **no callable** consumer/lease client (no executable, no MCP). Fail-closed remained correct.

### Iteration 3 — callable interface restored

1. Vault consumer remains **armed and unlocked** for folder `vygo` (`lease_api` + `broker_api` true).
2. Callable CLI installed on the harness host PATH:
   - `vault-provisioner-query` (primary)
   - `vault-consumer` (alias)
   - path hint: `/usr/local/bin/vault-provisioner-query`
3. Harness stages into the tester cwd each run:
   - `scratch/provision_summary_nonsecret.json` (from `shared/provision_summary.json`)
   - `scratch/vault_provisioner_interface.md` (when the CLI is present)
4. Non-secret provision + query metadata is also published at:
   - harness: `shared/provision_summary.json` → `database_query` + `callable_interface`
   - live: `https://www.vygo.ai/api/railway-db-query-method.json`
   - this document under `docs/apply-e2e-live-db-check.md`
5. Example (secrets stay inside the CLI; only row output is printed):

```bash
vault-provisioner-query status
vault-provisioner-query sql \
  --folder vygo \
  --run-id "$RATCHET_RUN_ID" \
  --from-summary scratch/provision_summary_nonsecret.json \
  --sql "SELECT id::text, full_name, work_email, product_url, message, source, created_at::text FROM applications WHERE full_name = 'Ratchet E2E Test' AND work_email = 'e2e-test+<run-marker>@vygo.ai';"
```

6. Credentials remain **only** on the Vault lease path inside the CLI; agents must not invent tokens or scrape secrets into TESTLOG.

**Fixed means:** a tester rerun can discover `vault-provisioner-query` on PATH, confirm status, and execute the approved SELECTs without exposing any token, password, or secret-bearing connection string.

---

## Secrets / credentials scan for this document

- No Railway tokens, Vault keys, passwords, or connection strings are included.
- Provision identifiers (project id, service names, public proxy host/port, public dashboard URL) are non-secret metadata.
- Database access for SQL used only the Vault Provisioner / consumer lease path (`vault-provisioner-query`).
