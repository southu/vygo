# Live acceptance pass — `vygo-live-acceptance-pass`

Scripted + recorded evidence that the LIVE app (https://www.vygo.ai) satisfies
the six mission checks for the readiness **multi-run analysis** flow. No product
behavior was changed — these scripts only exercise already-shipped public
endpoints and record the results.

## Artifacts

| file | what it is |
| --- | --- |
| `acceptance-pass.mjs` | Node (no deps) driver: mints a session token, runs projects **A** & **B** end-to-end via `POST /api/analysis/start` + `/api/analysis/complete`, re-runs A, checks the duplicate-start guard, verifies the legacy single-analysis user, lists submission records via `GET /api/submissions`, and asserts history/current. Re-runnable & idempotent. |
| `db-query.sh` | Read-only DB evidence via the vault provisioner path (`vault-provisioner-query sql`). Allowlisted `SELECT` only; never prints credentials. |
| `output/api-transcript.json` | Full HTTP request/response transcript (session tokens redacted). |
| `output/summary.md` | Per-check PASS/FAIL table + the visible history snapshot. |
| `output/db-query.txt` | Captured DB query output (analysis + submission rows). |

Reproduce: `node evidence/live-acceptance/acceptance-pass.mjs` then
`bash evidence/live-acceptance/db-query.sh > evidence/live-acceptance/output/db-query.txt`.

## Identities used (all public/demo namespaces — no real-user data touched)

- `demo@vygo.ai` — the account rendered on the public **/analyses** history page.
  Its projects **A** (2 completed runs) and **B** (1 completed run) are the
  mission's visible history, alongside the pre-existing `Default project` /
  `Project Beta` demo fixtures.
- `acceptance-api@vygo.ai` — isolated namespace for the always-fresh
  start/duplicate/accept API transcript.
- `legacy-single@vygo.ai` — a single-analysis account whose one migrated result
  lives in `Default project`.

## Check → evidence map

| # | mission check | evidence |
| --- | --- | --- |
| 1 | Complete an analysis end-to-end for project **A**; completed result appears | `api-transcript.json` (A start→complete); `GET /api/analysis/result?user=demo@vygo.ai&project=A`; renders on `/analyses` |
| 2 | Start & complete a second analysis for project **B** | `api-transcript.json` (B start→complete); B group on `/analyses` |
| 3 | Re-run A → history shows all three runs (A run1, B run, A run2), labeled per project, latest-per-project **current** | `summary.md` history table; `/analyses` groups A (2 runs) + B (1 run) with per-project "Current result"; `db-query.txt` per-project counts + current run |
| 4 | Legacy pre-migration single-analysis user still retains original result | `legacy-single@vygo.ai` via `GET /api/analysis/result?user=legacy-single@vygo.ai`; migration-integrity fixture in `/api/analysis/demo` (`fixture=legacy_single_analysis`, byte-for-byte in `Default project`); `db-query.txt` |
| 5 | Start endpoint (a) accepts a new run once the prior run completed, (b) rejects a duplicate start with an error status only while a run is in progress | `api-transcript.json`: **201** start → **409 `run_in_progress`** duplicate → **200** complete → **201** start-after-complete |
| 6 | Submission + analysis records queryable in the provisioned Railway DB (project `composer`) | `db-query.txt` (analyses rows + submission payloads for all acceptance runs); also over HTTP via scope-required `GET /api/submissions?user=…` |

`composer` is the mission's allowlisted project label; provisioning **reused**
the existing Railway project (dashboard `…/project/1b8abe52…`, folder `vygo`)
per `shared/provision_summary.json` (`created:false, reused:true`), which is the
Postgres that backs the live app.

## Guarantees

- **No secrets in the repo.** Session tokens are redacted before anything is
  written; the provisioner tool reports `secrets_in_output: False` and never
  emits connection strings. Only non-secret Railway resource UUIDs appear.
- **Idempotent.** The A/B display fixture is only built to reach its target
  state, so re-running converges instead of accumulating runs.
- **`version.txt` / `/version` untouched.**
