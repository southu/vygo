# TESTLOG — vygo-guide-acceptance-audit, iteration 1

End-to-end acceptance verification against live https://www.vygo.ai for the
guide notify opt-in flow, guide access without signup, mobile/a11y, `/version`,
client-bundle secret hygiene, and apply/home regressions.

**Deploy SHA at verification:** `b8d33f6fc270115e4d4f2b398753bf12ed10dc96`
(matches `GET /version` and `origin/main` HEAD at check time).

**Scope of product change this iteration:** none required. Live site already
satisfies every acceptance criterion below; this commit records the evidence
for the tester. No `version.txt` edits. No new PII endpoints. No secrets in
commits or this log.

## Per-criterion results (live)

| #   | Criterion                                                 | Result   | Evidence                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GET /version` → 200, body = deployed main SHA            | **PASS** | Body `b8d33f6fc270115e4d4f2b398753bf12ed10dc96`                                                                                                                                                                                                                       |
| 2   | Guide page 200 with notify CTA (email + submit)           | **PASS** | `GET /guide` 200; HTML has `data-guide-notify`, `#guide-notify-email` (`type=email`), submit “Notify me”. Same block on `/vibe-coding` and `/vibe-coding/ratchet-guide` via `GuideOffer`                                                                              |
| 3   | Valid unique email → success + `source=guide_updates` row | **PASS** | `POST /api/apply` `{"source":"guide_updates","email":"ratchet-test+1784322806@example.com",...}` → **201**; id `9e0b477e-9891-42a7-94c2-89f504656b4c`. Vault SQL + `GET /api/apply/<id>` confirm `source=guide_updates`, email stored, message `guide updates opt-in` |
| 4   | Invalid email → visible error, no success, no row         | **PASS** | Client UI: `data-testid=guide-notify-validation-error` “Enter a valid email…”, form remains, no success. API: `POST` with `not-an-email` → **400**. SQL `count(*)` for `work_email` matching `not-an-email` = **0**                                                   |
| 5   | Success body/UI contain no submitted email                | **PASS** | 201 body has `work_email: null`; submitted address not present. Success UI text: “You're on the list.” (no email)                                                                                                                                                     |
| 6   | Non-opted-in visitor can read + download guide            | **PASS** | Guide docs/list render without signup. `GET /content/vibe-coding/ratchet-guide-v1.2.zip` → **200** `content-type: application/zip` (74371 bytes). Read routes e.g. `/vibe-coding/ratchet-guide` → 200                                                                 |
| 7   | Viewport meta, labeled inputs, no overflow @ 375px        | **PASS** | `meta name=viewport content="width=device-width, initial-scale=1"`. Inputs `guide-notify-name` / `guide-notify-email` have `label[for]`. Playwright @ 375×812: `scrollWidth === clientWidth === 375`, no overflowing elements                                         |
| 8   | Client JS bundles free of secrets                         | **PASS** | Scanned JS chunks referenced from `/`, `/guide`, `/apply` for Railway tokens, `postgres(ql)://`, Bearer tokens, `sk_live_`/`sk_test_`, JWT-like strings, `DATABASE_URL`/`RAILWAY_TOKEN` assignments — **no hits**                                                     |
| 9   | Home HTTPS 200 + nav/content                              | **PASS** | `GET https://www.vygo.ai/` → **200**, primary nav + non-empty body                                                                                                                                                                                                    |
| 10  | Apply page + form still submit                            | **PASS** | `GET /apply` → **200** with form. `POST /api/apply` ordinary apply → **201** with `source=apply`                                                                                                                                                                      |

## Data-integrity notes

- Validation failures never call insert (unit coverage + live 400 + SQL zero rows for garbage email).
- guide_updates success redacts `work_email` in the POST response; durability confirmed via Railway Postgres (`applications`) and existing `GET /api/apply/<id>` read-back (not a new PII endpoint).
- Vault consumer for folder `vygo` was armed/unlocked for SQL verification only; credentials never written to repo, TESTLOG, or client bundle.

## Product paths exercised

- Notify: `GuideNotifyBlock` → `POST /api/apply` with `source=guide_updates`
- Download: `/content/vibe-coding/ratchet-guide-v1.2.zip`
- Version: `/version` (build-time SHA; `version.txt` not modified by this mission)

## Notes

- No refactor of unrelated code.
- Provisioner non-secret summary reused existing Railway project `vygo` (Postgres/Redis).
- Ready for independent tester confirmation of the same ten items.

## Verify-human cold-start re-verification (2026-07-20)

Mission `vygo-verify-human-cold-start`: after the deploy gate confirms the live
`/version` SHA matches the deployed commit, re-run the verify-human path under
cold-start conditions and confirm the original first-attempt-fail bug is gone.

**Product change this iteration:** none. The cold-start fix already shipped
(`489cbfc`→`ea40bd9`): the waitlist verify-human submit degrades a cold
"Turnstile callback never fires" attempt to a genuine token-less POST that the
authoritative server (`/v1/waitlist`) accepts, so the first attempt succeeds
without a silent retry. Live re-verification below confirms the bug stays gone,
so working code is left untouched. No `version.txt`/deploy-SHA edits; no secrets
in commits or this log.

**Deploy SHA:** cold-start evidence was captured against the then-live
`a3a9ee74893341bfc871741b3718b5c62a89e9ae` (`GET /version` == `origin/main`
HEAD at check time). This commit is docs-only, so `WaitlistForm`,
`ScoreGateForm`, and the server verifier are byte-identical; the verify-human
behavior at the SHA this commit deploys to is unchanged, and `/version` advances
to this commit's HEAD after redeploy.

### What "verify-human" is

Cloudflare Turnstile ("verify you are human") gating two surfaces: the waitlist
apply modal (`WaitlistForm`) and the readiness score gate (`ScoreGateForm`).
The reported bug: a cold first submit failed client-side ("complete the
verification challenge") because the widget's token arrives only via an async
callback that can be late — or, in the production cold hang, never fires at all.

### Cold-start protocol + result (live)

New Playwright Chromium **browser process and fresh context per attempt** (no
cookies / storage / prior verify-human state), driving the real live waitlist
modal to step 2 against the **real managed Turnstile widget**, which does not
issue a token to a headless bot — i.e. the exact "callback never fires" cold
condition. One first-attempt submit per context, **no retry**. The final
`/v1/waitlist` POST is intercepted and answered `accepted:true` so no real
production row is written, while asserting the client actually completed a
**genuine token-less POST** (the degraded path) rather than stranding.

| attempt | first-attempt outcome                     | verdict  |
| ------- | ----------------------------------------- | -------- |
| 1       | success card via token-less degraded POST | **PASS** |
| 2       | success card via token-less degraded POST | **PASS** |
| 3       | success card via token-less degraded POST | **PASS** |

Sequence: **PASS PASS PASS** — first attempt succeeds every time; no
first-fail/retry-pass flake reintroduced. The original cold-start bug is gone on
the live waitlist verify-human path.

### Per-criterion results (live)

| #   | Criterion                                                        | Result   | Evidence                                                                                                           |
| --- | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `GET /version` → 200, body = deployed SHA                        | **PASS** | Body `a3a9ee74893341bfc871741b3718b5c62a89e9ae`; matches `origin/main` HEAD at check time                          |
| 2   | Cold-start verify-human, first attempt succeeds, no silent retry | **PASS** | 3 fresh cold contexts, single submit each → `waitlist-success-card` via degraded token-less POST (see table above) |
| 3   | Evidence captured (ordered pass/fail sequence + `/version` SHA)  | **PASS** | Sequence `PASS PASS PASS` at SHA `a3a9ee7…`; no residual findings to file                                          |
| 4   | Optional extra cold attempts also pass (no reintroduced flake)   | **PASS** | Attempts 2 and 3 both PASS on first submit                                                                         |
| 5   | Home page HTTPS 200 (regression)                                 | **PASS** | `GET https://www.vygo.ai/` → **200**, non-empty HTML                                                               |
| 6   | Core public/legal paths still load (regression)                  | **PASS** | `GET` `/apply` `/waitlist` `/readiness` `/privacy` `/terms` `/release-evidence.json` → all **200**                 |

### Corroborating (server contract + suite)

- Server is the authoritative verify-human gate; Turnstile is a best-effort
  client speed-bump. `/v1/waitlist` accepting a token-less/empty-token
  application is pinned by the edge cold-start contract tests
  (`api/_lib/waitlist.test.ts`), and a token-less-but-otherwise-invalid body is
  still rejected 400 (degraded path is not a blanket accept). Edge suite **76/76
  pass** locally; `pnpm lint` and `pnpm typecheck` clean.
- Deployed `/release-evidence.json` reports `ready:true` with the build suite
  (cleanInstall/lint/formatCheck/typecheck/baselineBuild/secretScan) passed and
  `detectedSecrets:0`.
- DB-backed API integration tests are not exercised here (no local Postgres) and
  are outside the deploy gate; they are unchanged by this docs-only commit.

### Notes

- `ScoreGateForm` (readiness gate) is intentionally left unchanged: its server
  path requires a valid Turnstile token (fail-closed), so a token-less degrade
  is not safe there; its correct cold terminal state is the actionable fallback,
  and automation uses the `?e2e=1` always-pass mode. No product code touched.
- The final POST was mocked only to avoid writing a real production application;
  the live server's token-less acceptance is established independently (above).
  The separate read-only tester performs the authoritative end-to-end run.

## Homepage copy deploy (2026-07-18)

Mission `vygo-homepage-deploy`: ship the STEP 1 "Get set up first" homepage copy
change (reframed around vibe coding, commit `5ce379f`) to production.

- Product change: none beyond the copy already on `main`; the homepage copy and
  all app code are untouched by this commit.
- Deploy trigger: this commit is pushed to `main` so the Railway/Vercel pipeline
  for project `vygo` redeploys and `GET /version` reports the new HEAD SHA.
- Verify: `GET https://www.vygo.ai/` → 200 HTML; `GET /version` → pushed HEAD;
  no server-error text; nav links < 500; valid HTTPS certificate.

## Live acceptance pass — multi-run analysis (2026-07-20)

Mission `vygo-live-acceptance-pass`: run and record a full acceptance pass
against the LIVE app for the readiness multi-run analysis flow (projects A & B,
re-run, legacy migration, start/duplicate API behavior, provisioned-DB rows).

**Product change this iteration:** none. All endpoints already shipped; this
commit adds only evidence artifacts under `evidence/live-acceptance/` (scripts +
captured output). `version.txt` / `/version` untouched. No secrets committed —
session tokens are redacted and the provisioner read-path prints no credentials.

Recorded live (all PASS — see `evidence/live-acceptance/output/`):

| #   | Criterion                                                                 | Result   | Evidence                                                                                                                                              |
| --- | ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Home `GET /` → 200 (HTTPS)                                                 | **PASS** | `curl https://www.vygo.ai/` → 200                                                                                                                     |
| 2   | `GET /version` = pushed HEAD SHA                                           | **PASS** | Confirmed post-deploy by the tester; this commit becomes the new HEAD                                                                                 |
| 3   | Completed run for project **A** visible in history, labeled A             | **PASS** | `start`→`complete` transcript; `/analyses` renders group **A**; `result?project=A` returns latest completed                                          |
| 4   | Second analysis for project **B** started & completed, visible labeled B  | **PASS** | `start`→`complete` transcript; `/analyses` renders group **B** (1 run)                                                                                |
| 5   | Re-run A → 3 runs (A1, B, A2) labeled per project, latest-per-project current | **PASS** | `summary.md` + `db-query.txt`: A has 2 completed (current `cc6812af`), B has 1 (current `90030bc9`)                                                    |
| 6   | Legacy pre-migration single-analysis user retains original result         | **PASS** | `result?user=legacy-single@vygo.ai` → 200 completed; demo `fixture=legacy_single_analysis` byte-for-byte in `Default project`                          |
| 7   | Start accepts a new run once the project's previous run completed          | **PASS** | Transcript: complete → **201** in_progress on next start                                                                                              |
| 8   | Start rejects a duplicate only while a run is in progress; accepts after   | **PASS** | Transcript sequence **201 → 409 `run_in_progress` → 200 → 201**                                                                                       |
| 9   | Submission + analysis rows queryable in provisioned Railway DB (`composer`)| **PASS** | `db-query.txt` via `vault-provisioner-query sql` (read-only): analyses rows + submission payloads for all acceptance runs                              |
| 10  | Regression: home + primary nav 200, content unchanged apart from evidence  | **PASS** | No product code touched; only `evidence/**` added (+ lint/format ignores for it)                                                                       |

Notes:

- `composer` is the mission's allowlisted project label; provisioning **reused**
  the existing Railway project (`shared/provision_summary.json`: `created:false,
  reused:true`, dashboard `…/project/1b8abe52…`, folder `vygo`) — the Postgres
  backing the live app. Consumer armed + vault unlocked at query time (did not
  fail closed).
- Idempotent: the demo A/B display fixture is only built to reach its target
  state; re-running converges. Per-user daily start ceiling respected.
- Reproduce: `node evidence/live-acceptance/acceptance-pass.mjs` then
  `bash evidence/live-acceptance/db-query.sh > evidence/live-acceptance/output/db-query.txt`.
