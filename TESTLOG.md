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

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `GET /version` → 200, body = deployed main SHA | **PASS** | Body `b8d33f6fc270115e4d4f2b398753bf12ed10dc96` |
| 2 | Guide page 200 with notify CTA (email + submit) | **PASS** | `GET /guide` 200; HTML has `data-guide-notify`, `#guide-notify-email` (`type=email`), submit “Notify me”. Same block on `/vibe-coding` and `/vibe-coding/ratchet-guide` via `GuideOffer` |
| 3 | Valid unique email → success + `source=guide_updates` row | **PASS** | `POST /api/apply` `{"source":"guide_updates","email":"ratchet-test+1784322806@example.com",...}` → **201**; id `9e0b477e-9891-42a7-94c2-89f504656b4c`. Vault SQL + `GET /api/apply/<id>` confirm `source=guide_updates`, email stored, message `guide updates opt-in` |
| 4 | Invalid email → visible error, no success, no row | **PASS** | Client UI: `data-testid=guide-notify-validation-error` “Enter a valid email…”, form remains, no success. API: `POST` with `not-an-email` → **400**. SQL `count(*)` for `work_email` matching `not-an-email` = **0** |
| 5 | Success body/UI contain no submitted email | **PASS** | 201 body has `work_email: null`; submitted address not present. Success UI text: “You're on the list.” (no email) |
| 6 | Non-opted-in visitor can read + download guide | **PASS** | Guide docs/list render without signup. `GET /content/vibe-coding/ratchet-guide-v1.2.zip` → **200** `content-type: application/zip` (74371 bytes). Read routes e.g. `/vibe-coding/ratchet-guide` → 200 |
| 7 | Viewport meta, labeled inputs, no overflow @ 375px | **PASS** | `meta name=viewport content="width=device-width, initial-scale=1"`. Inputs `guide-notify-name` / `guide-notify-email` have `label[for]`. Playwright @ 375×812: `scrollWidth === clientWidth === 375`, no overflowing elements |
| 8 | Client JS bundles free of secrets | **PASS** | Scanned JS chunks referenced from `/`, `/guide`, `/apply` for Railway tokens, `postgres(ql)://`, Bearer tokens, `sk_live_`/`sk_test_`, JWT-like strings, `DATABASE_URL`/`RAILWAY_TOKEN` assignments — **no hits** |
| 9 | Home HTTPS 200 + nav/content | **PASS** | `GET https://www.vygo.ai/` → **200**, primary nav + non-empty body |
| 10 | Apply page + form still submit | **PASS** | `GET /apply` → **200** with form. `POST /api/apply` ordinary apply → **201** with `source=apply` |

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
