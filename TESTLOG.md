# TESTLOG — vygo-vibe-coding-verify, iteration 1

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Run by the builder on 2026-07-17 (UTC). Live results
below were re-verified after the fix deployed (deployed HEAD
`c4b08cfe3d3017d061a956e948ca125a551963b5`, confirmed via `/version`).

## Summary

- One failure found and fixed: the hub topics grid showed **two** modules as
  available (acceptance requires exactly one). Fix: `c4b08cf` renders the
  "Rebuild checklist" topic as a non-linked coming-soon placeholder.
- All other criteria passed on first check; no secrets, real server paths,
  real internal hostnames, or operator-runbook content found anywhere in the
  rendered pages, the served markdown pack, or the zip.

## Per-criterion results

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Hub reachable, no auth redirect | PASS | `GET /vibe-coding` → 200 over HTTPS, `text/html`, no redirect chain, no login form in body |
| 2 | No broken internal links in section | PASS | Crawled hub + 4 stubs + 7 guide pages; 42 unique internal links (incl. all served pack markdown and the zip); all → 200; zero 4xx/5xx |
| 3 | Four coming-soon stubs public | PASS | `/vibe-coding/case-studies`, `/live-verify-testing`, `/models-and-costs`, `/writing-missions` all → 200, no login form / auth redirect |
| 4 | Guide pages serve full article content | PASS | `/vibe-coding/ratchet-guide` + `overview`, `architecture`, `ai-prompts`, `footguns`, `one-pager`, `rebuild` → 200, server-rendered article body (413–928 words inside `<main>` each) |
| 5 | Zip downloads and unzips | PASS | `GET /content/vibe-coding/ratchet-guide-v1.2.zip` → 200 `application/zip`; `unzip -t` clean; extracts 21 files; byte-identical to the committed artifact |
| 6 | `/version` serves deployed SHA | PASS | Pre-fix: served `6411714…` = then-HEAD. Post-fix: serves `c4b08cfe3d3017d061a956e948ca125a551963b5` = current HEAD |
| 7 | Viewport meta + functional mobile nav toggle | PASS | All 12 section pages carry `<meta name="viewport" content="width=device-width, initial-scale=1">`; `data-testid="mobile-nav-toggle"` present; at 390px it opens `mobile-navigation` (aria-expanded → true, 7 nav links visible) — Playwright/Chromium |
| 8 | No horizontal overflow at 390px | PASS | `document.documentElement.scrollWidth` = 390 = viewport width on all 12 pages (Playwright/Chromium) |
| 9 | Content audit (pages + pack + zip) | PASS | See audit section below |
| 10 | Hub main-content word count < 1250 | PASS | 733 words inside `<main>` (scripts/styles stripped) |
| 11 | Exactly one available module in topics grid | **FAIL → FIXED** | Was: "Ratchet system guide" **and** "Rebuild checklist" both `status: available`, the latter linking to live guide content (`rebuild.md`). Fixed in `c4b08cf`: grid now shows exactly one available card linking `/vibe-coding/ratchet-guide`; all other 7 topics are coming-soon placeholders (4 link their stub pages, 3 are non-linked cards) |
| 12 | Home page regression | PASS | `GET /` → 200; primary nav unchanged (`/audit /method /security /why-vygo /vibe-coding /pricing /waitlist`); h1 unchanged |
| 13 | Top-level pages regression | PASS | `/audit /method /security /why-vygo /pricing /waitlist /apply /terms /privacy` all → 200 |

## Content audit detail (criterion 9)

Scope audited: all 12 rendered section pages (post-deploy HTML), all 13
served markdown files under `/content/vibe-coding/ratchet-guide/`, the served
`one-pager-print` HTML, and all 21 files extracted from
`ratchet-guide-v1.2.zip`.

Method: pattern scans for credential formats (AWS/GitHub/Slack/Stripe key
shapes, private-key blocks, `api_key`/`token`/`password` assignments), long
hex/base64 blobs, IPv4 literals, email addresses, non-placeholder domains,
and filesystem paths (`/opt/…`, `/srv/…`, `/etc/…`, `/home/…`, `/root/…`),
plus manual review of `operations.md`, `vault.md`, and `layout.md` (the
ops-flavored docs).

Findings:

- `/opt/sandbox`: not present anywhere. PASS
- Server filesystem paths: only `/srv/ratchet/…` placeholders, explicitly
  declared illustrative by the pack itself (`MANIFEST.txt`: "Paths in the
  guide (for example /srv/ratchet) are illustrative placeholders … not
  access to anyone's running VPC"). No real host paths. PASS
- Internal domains/hostnames: only `*.example.com` placeholders and the
  site's own public domain; no IPs beyond `127.0.0.1` loopback examples.
  PASS
- Secrets/credentials: no values — only variable *names* in documentation
  context (e.g. `LAZY_CONTROL_TOKEN`, `ANTHROPIC_API_KEY` handling notes).
  64-hex strings in `MANIFEST.txt` are SHA-256 checksums of pack files.
  Only email is `you@example.com`. PASS
- Operator runbook / internal-ops content: none. `operations.md`/`vault.md`
  are the published self-hosting guide content (the product being offered),
  not internal Vygo ops material; nothing from repo-internal `docs/`
  runbooks appears in the pack. PASS

## Fix applied

- Commit `c4b08cf` — `apps/web/src/content/vibe-coding.ts`: "Rebuild
  checklist" topic changed to `route: null, status: "coming-soon"`; topics
  intro copy aligned. Deployed via normal pipeline; `/version` confirmed the
  new SHA before re-verification.

## Local checks (pre-push)

- `eslint`: PASS
- `prettier --check` on the changed file: PASS (repo-wide format:check has
  25 pre-existing failures on untouched files — verified identical on clean
  origin/main)
- `tsc` typecheck of `@vygo/web`: PASS (`packages/validation` has 7
  pre-existing type errors in `readiness-scoring.test.ts` — verified
  identical on clean origin/main)
- `pnpm build:web` (Next production build): PASS — all /vibe-coding routes
  prerender; build-stamped version/readiness artifacts were reverted and not
  committed (per repo convention the deploy pipeline stamps them)

## Notes

- Mobile toggle checks require post-hydration clicks; a first pass without
  hydration waits produced two false FAILs (`/vibe-coding`,
  `ratchet-guide/ai-prompts`) that passed on re-run with proper waits.
  Recorded here so the flake is not mistaken for a regression.
- No vault/consumer conditions encountered (no vault_locked,
  consumer_not_armed, or vault_access_denied).
