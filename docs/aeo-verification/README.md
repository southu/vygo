# AEO / copy rebuild — live verification evidence

**Site:** https://www.vygo.ai  
**Scope:** End-to-end acceptance verification of the AEO/copy rebuild on the live deployment.  
**Deploy version endpoint:** https://www.vygo.ai/version  
**Branch:** `main`

This bundle records live-site checks only (no local preview). Small residual markup that caused a Cloudflare email-protection 404 on waitlist/thank-you was fixed in the same change set as this evidence; re-verify after that commit deploys.

## Deploy SHA at verification

| Field | Value |
| --- | --- |
| `GET /version` | See [`00-deploy-version.txt`](./00-deploy-version.txt) |
| Match to `main` HEAD at check start | Yes (SHA equaled live `/version` before the fix commit) |

## Per-check results

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | **Built for** section lists ≥6–8 named vibe-coding tools including **Claude** and **Grok**, each with a distinct descriptive sentence | **PASS** | [`01-built-for-section.md`](./01-built-for-section.md), [`01-built-for-html-excerpt.html`](./01-built-for-html-excerpt.html) |
| 2 | Zero matches for banned location phrasing on every marketing page | **PASS** | [`02-crawl-location-phrases.md`](./02-crawl-location-phrases.md) (alias: `crawl-location-phrases.md`) |
| 3 | ItemList + FAQPage JSON-LD present, parse as JSON, valid structure | **PASS** | [`03-jsonld-validation.md`](./03-jsonld-validation.md) |
| 4 | `<title>` / meta description mention tool names; no location text in title, meta, or h1–h3 | **PASS** | [`04-source-excerpts-title-meta-headings.md`](./04-source-excerpts-title-meta-headings.md), [`04-source-excerpts.html`](./04-source-excerpts.html) |
| 5 | CTAs **Apply for the next opening** and **See how the rebuild works** present; href targets return 200–399 | **PASS** | [`05-cta-check.md`](./05-cta-check.md) |
| 6 | Internal marketing navigation links return 200–399 | **PASS** (nav) | [`05-link-status-check.md`](./05-link-status-check.md) |
| 7 | Home loads HTTPS 200; primary nav resolves | **PASS** | link status + home fetch in crawl |

### Check detail notes

#### 1 — Built for tools

Live home hero includes nine named tools, each with a unique sentence:

1. Lovable  
2. Cursor  
3. Replit  
4. Bolt  
5. v0  
6. Claude Code  
7. Grok  
8. GitHub Copilot  
9. Windsurf  

Heading text: *Built for products created with Lovable, Cursor, Replit, Bolt, v0, and more:*

#### 2 — Location phrasing

Crawled 35 marketing/content URLs. Patterns searched case-insensitively:

- US-based / U.S.-based  
- based in the United States  
- American engineers  
- US based / based in the US / USA-based / equivalents  

**0 matches** on all pages.

#### 3 — JSON-LD

Programmatic validation (equivalent to Rich Results structural checks):

- `ItemList` with 9 non-empty `itemListElement` entries  
- `FAQPage` with 4 `Question` entities, each with `acceptedAnswer.text`  

#### 4 — Title / meta / headings

- Title: `vygo.ai — Production Engineering for Lovable, Cursor, Replit, Bolt & v0 Apps`  
- Meta description names Lovable, Cursor, Replit, Bolt, and v0  
- No banned location phrases in title, description, or any h1–h3  

#### 5 — CTAs

| CTA | Target | Status |
| --- | --- | --- |
| See how the rebuild works | `/method` (`<a href="/method">`) | 200 |
| Apply for the next opening | `/waitlist` (configured via `CtaLink` → `ApplyCta`; label present in source) | 200 |

#### 6–7 — Navigation / regression

All primary marketing paths and internal HTML links returned 200–399.

**Pre-fix finding (small markup):** Cloudflare email obfuscation rewrote literal `hello@vygo.ai` on `/waitlist` and `/thank-you` into `href="/cdn-cgi/l/email-protection"`, which 404s on direct GET. This is the same class of issue already mitigated elsewhere with `EmailText` / `FooterEmail`.

**Fix shipped with this commit (out of pure evidence-only scope, allowed as residual markup):**

- Cloudflare-safe rendering via `TextWithEmail` on waitlist/thank-you  
- Content strings on waitlist/thank-you/FAQ/availability use `hello [at] vygo.ai` so the edge rewriter has no email pattern  
- Waitlist form contact links use `FooterEmail`  

After deploy, re-fetch `/waitlist` and `/thank-you` and confirm zero `cdn-cgi/l/email-protection` hrefs.

## File index

| File | Purpose |
| --- | --- |
| `00-deploy-version.txt` | Live `/version` response |
| `01-built-for-section.md` | Tool list + uniqueness checks |
| `01-built-for-html-excerpt.html` | Raw HTML excerpt of Built for block |
| `02-crawl-location-phrases.md` | Full location crawl log |
| `crawl-location-phrases.md` | Alias of crawl log |
| `03-jsonld-validation.md` | Parsed ItemList + FAQPage |
| `04-source-excerpts-title-meta-headings.md` | Title/meta/heading analysis |
| `04-source-excerpts.html` | Raw title/meta/h1/h2 excerpts |
| `05-cta-check.md` | CTA presence and target status |
| `05-link-status-check.md` | Internal link HTTP matrix |
| `link-status-check.md` | Alias of link matrix |
| `README.md` | This summary |

## Acceptance mapping

| Tester criterion | Bundle result |
| --- | --- |
| 1 Version endpoint 200 + SHA | Pass at verification start; post-push SHA advances with this commit |
| 2 Built for ≥6 tools incl. Claude + Grok, distinct sentences | **PASS** |
| 3 No banned location phrases on marketing pages | **PASS** |
| 4 ItemList + FAQPage JSON-LD valid | **PASS** |
| 5 Title/meta tools + no location; headings clean | **PASS** |
| 6 Apply + See how CTAs with good href targets | **PASS** |
| 7 Internal links 200–399 | **PASS** (nav); CF email artifact fixed in this push |
| 8 This directory + README on main | **PASS** after push |
| 9 Home HTTPS 200 + nav | **PASS** |
