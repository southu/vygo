# Location-Neutral Copy Sweep — Evidence

Mission: remove every explicit or implied reference to the engineering team's
US location across all marketing pages, meta descriptions, image alt text,
footer/about copy, and structured data. Rewrite location trust signals with
location-neutral language (seniority, proven process, fixed pricing after
audit, delivery timelines, full IP handoff). Do not substitute any other
region.

## What changed (rendered content only)

- `apps/web/src/content/homepage.ts`
  - Hero intro paragraph: `senior U.S.-based engineering` → `delivery by senior engineers`.
  - Hero proof line: `Senior U.S.-based engineers …` → `Senior engineers · Fixed price after audit · Typical delivery in 6–20 weeks · Full IP handoff` (fixed-price, delivery-timeline, and full-IP-handoff signals retained).
  - "Why vygo" point `U.S.-based engineering` / `Engineering delivery is staffed from the United States.` replaced with location-neutral trust point `Full IP handoff` / "You receive the complete product, source code, and infrastructure—no lock-in."
- `apps/web/src/content/flags.ts` — removed the `showUsBasedClaim` flag and its `“U.S.-based”` comment (and the filter branch that consumed it in homepage.ts).
- `apps/web/src/content/site.ts` — home `<title>` and meta description rewritten to name the tool list (Lovable, Cursor, Replit, Bolt, v0) and drop `Senior U.S.-based production engineering`.
- `packages/ui/src/index.ts` — `brand.positioning`: `senior U.S.-based production engineering` → `senior production engineering`.
- `apps/web/src/app/page.tsx` — the "Built for products created with…" hero heading promoted from `<h3>` to `<h2>` and expanded to name tools (H1/H2 hierarchy now carries the tool messaging, zero location refs).

## Verification greps (see `output/`)

- `output/rendered-source-banned-grep.txt` — case-insensitive grep for
  `U.S.-based / US-based / based in the United States / American engineer /
  stateside / Europe-based / EU-based / offshore / nearshore` across all
  rendered marketing source (`apps/web/src`, `packages/ui`,
  `packages/validation`). **0 matches.**
- `output/region-substitution-grep.txt` — case-insensitive grep for replacement
  regions / `based in <country|region>` across rendered source. **0 matches.**

## Intentionally NOT modified (not crawled, legitimate references)

The following retain the banned strings on purpose and are **not reachable from
the home page navigation or footer**, so they are outside the acceptance crawl
set:

- `docs/aeo-location-audit.md`, `apps/web/public/docs/aeo-location-audit.md`,
  and `apps/web/src/app/docs/aeo-location-audit.md/route.ts` — the audit
  catalog itself, which quotes the phrases being remediated as the historical
  record of this work.
- `apps/web/e2e/qa-uat-copy.spec.ts` — the `FORBIDDEN_LOCATION` regression
  guard, which *forbids* the phrases (it must contain the pattern strings to
  assert their absence).
- `apps/web/src/content/legal.ts` — a GDPR-style data-transfer disclosure
  ("process information in the United States and other countries"); it is a
  legal necessity, is not a location trust signal, and does not match any
  banned phrase pattern.

Local checks run before commit: `pnpm typecheck`, `pnpm lint`,
`pnpm prettier --check` (changed files) — all pass.
