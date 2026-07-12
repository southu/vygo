# Backups and restore testing

> This repository does not provision managed backups. The owner configures
> Railway (or external) PostgreSQL backups and proves restore on a schedule.

## Scope

| Data store                                       | Backup required? | Notes                           |
| ------------------------------------------------ | ---------------- | ------------------------------- |
| PostgreSQL (leads, outbox, events, availability) | **Yes**          | Primary system of record        |
| Redis                                            | Optional         | Rate-limit state; rebuildable   |
| Vercel static web                                | Via git          | Redeploy from git SHA           |
| Resend                                           | Provider         | Not a substitute for DB backups |

## Scheduling (owner policy)

Recommended baseline (owner may tighten; not a contractual SLA):

| Item                         | Recommended default                         |
| ---------------------------- | ------------------------------------------- |
| Full logical dump            | Daily, automated                            |
| Point-in-time (if available) | Enable on production Postgres plan          |
| Staging snapshot             | Before risky migrations                     |
| Offsite copy                 | At least one copy outside the primary cloud |

Record the actual schedule the owner enables (provider UI or cron).

## Retention (owner policy)

Recommended baseline:

| Environment | Retain daily dumps | Retain weekly | Notes                                        |
| ----------- | ------------------ | ------------- | -------------------------------------------- |
| Staging     | 7 days             | 4 weeks       | Enough for migration rollback practice       |
| Production  | 30 days            | 12 weeks      | Align with legal/privacy retention decisions |

**Unresolved:** legal retention vs deletion obligations for waitlist PII — owner
and counsel decide; see [credentials-and-decisions.md](./credentials-and-decisions.md).

## Backup procedure (PostgreSQL logical dump)

Example using `pg_dump` against the environment’s `DATABASE_URL` (run from a
trusted admin machine or Railway one-off; never commit dump files):

```bash
# Set URL for the target environment only
export DATABASE_URL='postgresql://…'   # owner secret — do not commit

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="vygo-pg-${STAMP}.dump"

pg_dump "$DATABASE_URL" --format=custom --file="$OUT"
# Store $OUT in encrypted object storage / backup vault
shasum -a 256 "$OUT" > "${OUT}.sha256"
```

Railway-native: enable automatic backups in the Postgres service dashboard and
document retention there. Still run an **independent restore test** periodically.

## Restore instructions

### A. Restore into an isolated restore target (preferred)

Never restore a production dump over production without an explicit incident
decision. Prefer a new empty Postgres instance.

```bash
export RESTORE_DATABASE_URL='postgresql://…'  # empty target DB

# Optional: create database first
# createdb …

pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$RESTORE_DATABASE_URL" \
  vygo-pg-YYYYMMDDTHHMMSSZ.dump
```

### B. Verify application against restored data

```bash
export DATABASE_URL="$RESTORE_DATABASE_URL"
pnpm db:migrate   # should be no-op if dump already had schema; safe if idempotent journal matches
# Start API against restore DB (local or temporary Railway service)
curl -sS "$API/readyz"
curl -sS "$API/v1/public/availability"
# Spot-check row counts (read-only)
```

```sql
SELECT count(*) AS waitlist_rows FROM waitlist_entries WHERE deleted_at IS NULL;
SELECT count(*) AS outbox_rows FROM email_outbox;
SELECT status, next_opening_date FROM site_availability LIMIT 1;
```

### C. Production restore (incident only)

1. Declare severity and freeze writes if needed ([incident-response.md](./incident-response.md)).
2. Snapshot current (broken) volume if possible for forensics.
3. Restore to a new instance, validate, then cut traffic (or restore in place only with explicit owner approval).
4. Re-run migrations only if the dump is behind the intended schema.
5. Rotate credentials if the incident involved access compromise.
6. Complete post-incident write-up.

## Repeatable restore-test procedure

Run at least **monthly** on production backups (and after any backup config change).

1. Select the latest successful backup artifact (note id/timestamp).
2. Provision an isolated Postgres (Railway ephemeral service or local Docker).
3. Restore the artifact with `pg_restore` (or provider “restore to new” UI).
4. Point a temporary API (or `psql` checks only) at the restored database.
5. Execute verification queries and HTTP checks above.
6. Confirm checksum/record counts are plausible vs pre-backup notes.
7. Destroy the restore environment; do not leave PII-bearing restore DBs idle.
8. Fill the evidence table below and store it in the owner’s ops log (not necessarily in git).

### Restore-test evidence fields (record every run)

| Field                         | Example / instructions                | Recorded value |
| ----------------------------- | ------------------------------------- | -------------- |
| Test date (UTC)               | `2026-07-12T04:00:00Z`                |                |
| Environment of source backup  | `production` / `staging`              |                |
| Backup artifact id / filename | `vygo-pg-….dump` or Railway backup id |                |
| Backup taken at (UTC)         | From provider or dump stamp           |                |
| Restore target                | New Railway Postgres / local Docker   |                |
| Operator                      | Name or handle                        |                |
| `pg_restore` / UI result      | exit 0 / success                      |                |
| `SELECT count(*)` waitlist    | Number                                |                |
| `SELECT count(*)` outbox      | Number                                |                |
| Availability status observed  | `open` / `waitlist` / `paused`        |                |
| `/readyz` result (if used)    | HTTP code + body summary              |                |
| Pass / fail                   | `pass` only if all checks ok          |                |
| Issues / follow-ups           | Free text                             |                |
| Artifact destroyed at (UTC)   | When restore DB was deleted           |                |

## What not to do

- Do not commit database dumps, `.sql` data exports with PII, or backup credentials.
- Do not use production dumps on shared laptops without encryption and deletion policy.
- Do not claim RPO/RTO or SLA numbers in customer materials unless the owner and counsel approve ([credentials-and-decisions.md](./credentials-and-decisions.md)).
