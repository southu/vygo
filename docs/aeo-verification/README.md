# AEO / copy rebuild — live verification evidence

**Site:** https://www.vygo.ai  
**Scope:** End-to-end acceptance verification of the AEO/copy rebuild on the live deployment.  
**Deploy version endpoint:** https://www.vygo.ai/version  
**Branch:** `main`  
**Fetched:** 2026-07-23T15:28:35.934494+00:00

All checks below were run against the live site after deploy SHA `05d5fc25cda1762f9085e879592619efe420fe56` matched `main` HEAD.

## Deploy SHA

| Field                | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| `GET /version`       | `05d5fc25cda1762f9085e879592619efe420fe56` (HTTP 200) |
| `git rev-parse HEAD` | `05d5fc25cda1762f9085e879592619efe420fe56`            |
| Match                | **Yes**                                               |

See also [`00-deploy-version.txt`](./00-deploy-version.txt).

## Per-check results

| #   | Check                                                                                                                                 | Result                        | Evidence                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Built for** section lists ≥6–8 named vibe-coding tools including **Claude** and **Grok**, each with a distinct descriptive sentence | **PASS**                      | [`01-built-for-section.md`](./01-built-for-section.md), [`01-built-for-html-excerpt.txt`](./01-built-for-html-excerpt.txt)                       |
| 2   | Zero matches for banned location phrasing on every marketing page                                                                     | **PASS** (33 pages, 0 hits)   | [`02-crawl-location-phrases.md`](./02-crawl-location-phrases.md) (alias: `crawl-location-phrases.md`)                                            |
| 3   | ItemList + FAQPage JSON-LD present, parse as JSON, valid structure                                                                    | **PASS**                      | [`03-jsonld-validation.md`](./03-jsonld-validation.md)                                                                                           |
| 4   | `<title>` / meta description mention tool names; no location text in title, meta, or h1–h3                                            | **PASS**                      | [`04-source-excerpts-title-meta-headings.md`](./04-source-excerpts-title-meta-headings.md), [`04-source-excerpts.txt`](./04-source-excerpts.txt) |
| 5   | CTAs **Apply for the next opening** and **See how the rebuild works** present; href targets return 200–399                            | **PASS**                      | [`05-cta-check.md`](./05-cta-check.md)                                                                                                           |
| 6   | Internal marketing navigation links return 200–399                                                                                    | **PASS** (34 links, 0 broken) | [`05-link-status-check.md`](./05-link-status-check.md)                                                                                           |
| 7   | Home loads HTTPS 200; primary nav resolves                                                                                            | **PASS**                      | home + link matrix                                                                                                                               |

### Check 1 — Built for tools

9 named tools, each with a unique descriptive sentence:

1. Lovable
2. Cursor
3. Replit
4. Bolt
5. v0
6. Claude Code
7. Grok
8. GitHub Copilot
9. Windsurf

Heading: _Built for products created with Lovable, Cursor, Replit, Bolt, v0, and more:_

### Check 2 — Location phrasing

Crawled 33 marketing/content URLs. Patterns (case-insensitive): `US-based`, `U.S.-based`, `based in the United States`, `American engineers`, and equivalents. **0 matches.**

### Check 3 — JSON-LD

Programmatic validation of live home page scripts:

- `ItemList` with non-empty `itemListElement` entries
- `FAQPage` with Question entities, each with `acceptedAnswer.text`

### Check 4 — Title / meta / headings

- Title: `vygo.ai — Production Engineering for Lovable, Cursor, Replit, Bolt & v0 Apps`
- Meta description names Lovable, Cursor, Replit, Bolt, and v0
- No banned location phrases in title, description, or any h1–h3

### Check 5 — CTAs

| CTA                        | Target      | Status |
| -------------------------- | ----------- | ------ |
| See how the rebuild works  | `/method`   | 200    |
| Apply for the next opening | `/waitlist` | 200    |

### Checks 6–7 — Navigation

All discovered internal HTML marketing links returned 200–399. No broken navigation.

**Residual markup fixed during this verification:** Cloudflare was rewriting `demo@vygo.ai` on `/analyses` (and the login demo label) into `href="/cdn-cgi/l/email-protection"` (404 on direct GET). Fixed by extending `EmailText` to accept an `address` prop and using it in `AnalysesConsole` and `/login`. Privacy/terms meta descriptions use `hello [at] vygo.ai`. Post-redeploy: **zero** `cdn-cgi/l/email-protection` hrefs on crawled pages.

## File index

| File                                        | Purpose                             |
| ------------------------------------------- | ----------------------------------- |
| `00-deploy-version.txt`                     | Live `/version` response            |
| `01-built-for-section.md`                   | Tool list + uniqueness checks       |
| `01-built-for-html-excerpt.txt`             | Raw HTML excerpt of Built for block |
| `02-crawl-location-phrases.md`              | Full location crawl log             |
| `crawl-location-phrases.md`                 | Alias of crawl log                  |
| `03-jsonld-validation.md`                   | Parsed ItemList + FAQPage           |
| `04-source-excerpts-title-meta-headings.md` | Title/meta/heading analysis         |
| `04-source-excerpts.txt`                    | Raw title/meta/h1/h2 excerpts       |
| `05-cta-check.md`                           | CTA presence and target status      |
| `05-link-status-check.md`                   | Internal link HTTP matrix           |
| `link-status-check.md`                      | Alias of link matrix                |
| `README.md`                                 | This summary                        |

## Acceptance mapping

| Tester criterion                                             | Result                    |
| ------------------------------------------------------------ | ------------------------- |
| 1 Version endpoint 200 + SHA matches main                    | **PASS**                  |
| 2 Built for ≥6 tools incl. Claude + Grok, distinct sentences | **PASS**                  |
| 3 No banned location phrases on marketing pages              | **PASS**                  |
| 4 ItemList + FAQPage JSON-LD valid                           | **PASS**                  |
| 5 Title/meta tools + no location; headings clean             | **PASS**                  |
| 6 Apply + See how CTAs with good href targets                | **PASS**                  |
| 7 Internal links 200–399                                     | **PASS**                  |
| 8 `docs/aeo-verification/` + README on main                  | **PASS** (this directory) |
| 9 Home HTTPS 200 + nav                                       | **PASS**                  |

## Overall

**ALL CHECKS PASS** against deploy `05d5fc25cda1762f9085e879592619efe420fe56`.
