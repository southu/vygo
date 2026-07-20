# Live acceptance pass — `vygo-live-acceptance-pass`

Scripted + recorded evidence that the LIVE app (https://www.vygo.ai) satisfies
the six mission checks for the readiness **multi-run analysis** flow. No product
behavior was changed — these scripts only exercise already-shipped public
endpoints and record the results.

## Artifacts

| file | what it is |
| --- | --- |
| `acceptance-pass.mjs` | Node (no deps) driver: mints a session token, runs projects **A** & **B** end-to-end via `POST /api/analysis/start` + `/api/analysis/complete`, re-runs A, checks the duplicate-start guard, verifies the legacy single-analysis user, lists submission records via `GET /api/submissions`, and asserts history/current. Re-runnable & idempotent. |
| `railway-query.sh` | Credential-free **HTTP** read-only DB evidence: `curl https://www.vygo.ai/api/railway/query`. Returns the acceptance runs' analysis + submission rows from the provisioned Railway DB (project `vygo`) as recorded query output. Allowlist-scoped to the documented acceptance identities; never returns a connection string or secret. |
| `db-query.sh` | Read-only DB evidence via the vault provisioner CLI path (`vault-provisioner-query sql`). Allowlisted `SELECT` only; never prints credentials. |
| `output/api-transcript.json` | Full HTTP request/response transcript (session tokens redacted). |
| `output/summary.md` | Per-check PASS/FAIL table + the visible history snapshot. |
| `output/db-query.txt` | Captured DB query output (analysis + submission rows) via the CLI path. |
| `output/railway-query.json` | Captured DB query output via the HTTP `/api/railway/query` path. |

Reproduce: `node evidence/live-acceptance/acceptance-pass.mjs`, then either DB
evidence path (they read the SAME Railway Postgres, project `vygo`):

- HTTP (no credentials): `bash evidence/live-acceptance/railway-query.sh > evidence/live-acceptance/output/railway-query.json`
- CLI (direct psql SELECT): `bash evidence/live-acceptance/db-query.sh > evidence/live-acceptance/output/db-query.txt`

### `/api/railway/query` — authenticated, read-only Railway `vygo` query

`GET https://www.vygo.ai/api/railway/query` is the credential-free HTTP evidence
surface for the provisioned Railway database. It returns three query blocks —
`analyses` rows, paired `submissions` rows, and per-project run counts + current
run — for the acceptance identities, sourced from the same Railway Postgres the
app reads through `/api/analyses`. It is **allowlist-scoped**: omit `user` to
return every documented acceptance identity in one payload, or pass one of them
(`demo@vygo.ai`, `acceptance-api@vygo.ai`, `legacy-single@vygo.ai`); any other
`user` is refused with `SCOPE_NOT_ALLOWED`, so it can never enumerate arbitrary
accounts. No connection string, Railway token, password, or secret is ever
returned. `GET /provisioning-status` documents this path under
`databaseEvidence` (`project: vygo`, `queryEndpoint: /api/railway/query`).

The end-user **history view** lives at `/analyses` and is discoverable from
`/readiness` (the "View analysis history" entry). It groups every run by project,
marks each project's latest completed run **current** (a per-row ★ Current badge,
backed by the API's explicit `current` / `currentByProject` marker), keeps older
runs openable, and scopes to one named identity (no cross-user listing). The
legacy pre-migration identity is viewable at `/analyses?fixture=legacy`.

## Identities used (all public/demo namespaces — no real-user data touched)

- `demo@vygo.ai` — the account rendered on the public **/analyses** history page.
  Its projects **A** (2 completed runs) and **B** (1 completed run) are the
  mission's visible history, alongside the pre-existing `Default project` /
  `Project Beta` demo fixtures.
- `acceptance-api+<run>@vygo.ai` — isolated, **per-run uniquified** namespace for
  the always-fresh start/duplicate/accept API transcript. The unique suffix
  guarantees each reproduction gets its own rolling-24h run-start budget, so the
  201→409→200→201 sequence is always recordable and a fresh tester never hits the
  per-user daily rate limit. (`acceptance-api@vygo.ai` remains an allowlisted
  scope on `/api/railway/query` for backward compatibility.)
- `legacy-single@vygo.ai` — a single-analysis account whose one migrated result
  lives in `Default project`.

## Check → evidence map

| # | mission check | evidence |
| --- | --- | --- |
| 1 | Complete an analysis end-to-end for project **A**; completed result appears | `api-transcript.json` (A start→complete); `GET /api/analysis/result?user=demo@vygo.ai&project=A`; renders on `/analyses` |
| 2 | Start & complete a second analysis for project **B** | `api-transcript.json` (B start→complete); B group on `/analyses` |
| 3 | Re-run A → history shows all three runs (A run1, B run, A run2), labeled per project, latest-per-project **current** | `summary.md` history table; `/analyses` groups A (2 runs) + B (1 run) with per-project "Current result" + a visible **★ Current** badge on the latest completed run; the list response carries an **explicit** `current` marker (per-row `current` boolean + a `currentByProject` map) — check `history-current-marker`; `db-query.txt` per-project counts + current run |
| 4 | Legacy pre-migration single-analysis user still retains original result | `legacy-single@vygo.ai` via `GET /api/analysis/result?user=legacy-single@vygo.ai`; directly viewable in the history UI at **`/analyses?fixture=legacy`** (seed-on-read `GET /api/analysis/demo?user=legacy-single@vygo.ai`) — check `legacy-fixture-viewable`; migration-integrity fixture in `/api/analysis/demo` (`fixture=legacy_single_analysis`, byte-for-byte in `Default project`); `db-query.txt` |
| 5 | Start endpoint (a) accepts a new run once the prior run completed, (b) rejects a duplicate start with an error status only while a run is in progress | `api-transcript.json`: **201** start → **409 `run_in_progress`** duplicate → **200** complete → **201** start-after-complete |
| 6 | Submission + analysis records queryable in the provisioned Railway DB (project `vygo`) | **HTTP:** `output/railway-query.json` (`GET /api/railway/query` — analyses + submissions + per-project counts for the acceptance runs, no credentials); **CLI:** `db-query.txt` (direct psql SELECT via the vault provisioner); also via scope-required `GET /api/submissions?user=…` |

`vygo` is the mission's allowlisted project label (matching the vault-provisioner
folder); provisioning **reused** the existing Railway project (dashboard
`…/project/1b8abe52…`, folder `vygo`) per `shared/provision_summary.json`
(`created:false, reused:true`), which is the Postgres that backs the live app.

## Guarantees

- **No secrets in the repo.** Session tokens are redacted before anything is
  written; the provisioner tool reports `secrets_in_output: False` and never
  emits connection strings. Only non-secret Railway resource UUIDs appear.
- **Idempotent.** The A/B display fixture is only built to reach its target
  state, so re-running converges instead of accumulating runs.
- **`version.txt` / `/version` untouched.**
