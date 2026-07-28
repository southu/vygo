# Check — Homepage tool grid outbound attribution links (live URL verification)

Section: hero "Built for products created with these tools" grid in
`apps/web/src/app/page.tsx`.

Each tile renders as an `<a target="_blank" rel="noopener noreferrer">` whose
href is built with safe URL construction (`new URL(base)` +
`searchParams.set('src', 'vygo')`), preserving any existing query params on the
base URL.

## Live base-URL verification

Every marketing/homepage base URL below was re-verified with a live HTTP request
(follow redirects) before use — no domains guessed or fabricated.

- [OK] Lovable         → https://lovable.dev                    → 200
- [OK] Cursor          → https://cursor.com                     → 200
- [OK] Replit          → https://replit.com                     → 200
- [OK] Bolt            → https://bolt.new                       → 200
- [OK] v0              → https://v0.dev                         → 200
- [OK] Claude Code     → https://claude.com/product/claude-code → 200
- [OK] Grok            → https://grok.com                       → 200 (official xAI Grok product homepage; resolves live)
- [OK] GitHub Copilot  → https://github.com/features/copilot    → 200
- [OK] Windsurf        → https://windsurf.com                   → 200

## Attribution + safety attributes

- Each anchor href includes `src=vygo`, appended via `URL.searchParams.set`
  (never string concatenation), so existing query params on any base URL are
  preserved.
- Each anchor carries `target="_blank"` and `rel="noopener noreferrer"`.

## Coverage

E2e assertions live in `apps/web/e2e/homepage-copy.spec.ts`
("Homepage tool grid outbound links") — they confirm every tile is an anchor
with the correct host, `src=vygo`, `target=_blank`, `rel` containing both
`noopener` and `noreferrer`, and no new console/page errors on the home page.

Visible tile names and descriptions are unchanged; only clickability (anchor +
focus-visible ring, cursor pointer) was added.
