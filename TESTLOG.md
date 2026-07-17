# TESTLOG — vygo-vibe-coding-verify, iteration 1

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Builder re-verified live on 2026-07-17 (UTC) against
deployed HEAD `a188f13e917589de56df7e2f0cb7f9f802b40f90` (confirmed via
`/version`).

## Summary

- Prior fix in this iteration: commit `c4b08cf` made the hub topics grid show
  exactly one available module (Ratchet system guide); "Rebuild checklist" is
  a non-linked coming-soon placeholder. Recorded in `a188f13`.
- Independent re-crawl + Playwright mobile pass on the live deploy: **all 13
  acceptance criteria PASS**. No further code changes required.

## Per-criterion results

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Hub reachable, no auth redirect | PASS | `GET https://www.vygo.ai/vibe-coding` → 200 over HTTPS, `text/html`, no redirect, no login form |
| 2 | No broken internal links in section | PASS | Crawled hub + 4 stubs + 7 guide pages + all pack markdown linked from the section + zip; 40+ unique section/content URLs; all → 200; zero 4xx/5xx |
| 3 | Four coming-soon stubs public | PASS | `/vibe-coding/case-studies`, `/live-verify-testing`, `/models-and-costs`, `/writing-missions` all → 200, no login form / auth redirect, "Coming soon" present |
| 4 | Guide pages serve full article content | PASS | `/vibe-coding/ratchet-guide` + `overview`, `architecture`, `ai-prompts`, `footguns`, `one-pager`, `rebuild` → 200, server-rendered article body (~436–915 words inside `<main>`) |
| 5 | Zip downloads and unzips | PASS | `GET /content/vibe-coding/ratchet-guide-v1.2.zip` → 200 `application/zip` (~115KB); `ZipFile.testzip()` clean; 21 text files extract |
| 6 | `/version` serves deployed SHA | PASS | Body `a188f13e917589de56df7e2f0cb7f9f802b40f90` = local `git rev-parse HEAD` at verification time |
| 7 | Viewport meta + functional mobile nav toggle | PASS | All 12 section pages: `<meta name="viewport" content="width=device-width, initial-scale=1">`; `data-testid="mobile-nav-toggle"` present; at 390px click opens `#mobile-navigation` (`aria-expanded=true`, 7 nav links) — Playwright/Chromium |
| 8 | No horizontal overflow at 390px | PASS | `document.documentElement.scrollWidth` = 390 = viewport on hub + all 4 stubs + all 7 guide pages (Playwright/Chromium, nav closed) |
| 9 | Content audit (pages + pack + zip) | PASS | See audit section below |
| 10 | Hub main-content word count < 1250 | PASS | 746 words inside `<main>` (scripts/styles/tags stripped) |
| 11 | Exactly one available module in topics grid | PASS | Topics grid: 1× `data-status="available"` card → `/vibe-coding/ratchet-guide` ("Ratchet system guide"); 7× coming-soon cards (4 stub links + 3 non-linked placeholders including Rebuild checklist, Composer walkthrough, Vault deep-dive) |
| 12 | Home page regression | PASS | `GET /` → 200; primary nav still includes `/audit /method /security /why-vygo /vibe-coding /pricing /waitlist` |
| 13 | Top-level pages regression | PASS | `/audit /method /security /why-vygo /pricing /waitlist /apply /terms /privacy` all → 200 |

## URLs checked (section + regression)

**Hub / stubs / guides (HTML 200):**

- `/vibe-coding`
- `/vibe-coding/case-studies`
- `/vibe-coding/live-verify-testing`
- `/vibe-coding/models-and-costs`
- `/vibe-coding/writing-missions`
- `/vibe-coding/ratchet-guide`
- `/vibe-coding/ratchet-guide/overview`
- `/vibe-coding/ratchet-guide/architecture`
- `/vibe-coding/ratchet-guide/ai-prompts`
- `/vibe-coding/ratchet-guide/footguns`
- `/vibe-coding/ratchet-guide/one-pager`
- `/vibe-coding/ratchet-guide/rebuild`

**Pack / zip (200):**

- `/content/vibe-coding/ratchet-guide-v1.2.zip`
- `/content/vibe-coding/ratchet-guide/README.md` and sibling pack files discovered via hub/guide links (overview, architecture, principles, layout, loop-and-missions, composer, lazy-medic-sentinel, vault, projects-and-deploy, operations, examples, diagrams, CHANGELOG, one-pager, one-pager-print, ai-prompts, footguns, rebuild)

**Meta / regression:**

- `/version`
- `/` and top-level nav targets listed in criterion 13

## Content audit detail (criterion 9)

Scope: all 12 rendered section pages (live HTML), all served pack files under
`/content/vibe-coding/ratchet-guide/`, and all 21 files from
`ratchet-guide-v1.2.zip`.

Method: regex scans for credential shapes (AWS/GitHub/Slack/OpenAI key
patterns, private-key blocks, `password`/`api_key`/`secret` assignments),
filesystem paths (`/opt/…`, `/home/…`, `/root/…`, `/etc/…`), plus review of
ops-flavored pack docs (`operations.md`, `vault.md`, `layout.md`).

Findings:

- `/opt/sandbox`: not present. PASS
- Server filesystem paths: only `/srv/ratchet/…` illustrative placeholders
  (offer copy: "Paths in the guide are illustrative — rename them to match
  your own install"). No real host paths. PASS
- Internal domains/hostnames: only `*.example.com` / public site domain
  patterns as documentation examples. PASS
- Secrets/credentials: no secret *values* — documentation may name env vars
  (e.g. handling notes). No private keys or live tokens. PASS
- Operator runbook / internal-ops content: none from repo-internal `docs/`
  runbooks. Pack ops files are the published self-hosting product guide, not
  Vygo internal ops. PASS

## Fix history this iteration

- `c4b08cf` — `apps/web/src/content/vibe-coding.ts`: "Rebuild checklist"
  topic set to `route: null, status: "coming-soon"` so the topics grid shows
  exactly one available module.
- `a188f13` — initial TESTLOG for that fix.
- This commit — re-verification TESTLOG against the live deploy (no product
  code changes; all criteria already green).

## Local / live tooling used

- HTTPS crawl (Python urllib) for status codes, link graph, word count, content
  audit
- Playwright/Chromium at viewport 390×844 for viewport meta, mobile nav
  toggle open behavior, and `documentElement.scrollWidth` overflow check
- Zip integrity via Python `zipfile.ZipFile.testzip()`

## Notes

- Site-wide `overflow-x: hidden` on the document root keeps
  `documentElement.scrollWidth` at the viewport width even when long
  fenced-code / table cells have large intrinsic widths; criterion 8 uses
  the document scrollWidth metric and passes.
- Mobile toggle checks need post-hydration clicks; wait for network idle +
  short settle before clicking.
- No vault/consumer conditions encountered (`vault_locked`,
  `consumer_not_armed`, `vault_access_denied`).
- `version.txt` / `/version` mechanism was not modified.
- No secrets written to commits, logs, or this report.
