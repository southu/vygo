# Guide changelog

Tracks **this documentation pack**, not the Ratchet software itself.

**Why it exists:** when you re-share the folder with friends or drop it on a new host, they can see what changed without diffing every file. Private install notes stay outside this pack.

Pack folders: **`v1.2`** (current) · **`v1.1`** (archive). Section labels below remain `guide-YYYY-MM-DD` plus pack version.

---

## v1.2 / guide-2026-07-17h — deep public sanitization (concepts only)

### Removed

- Internal file/module/storage layouts and install tree maps
- Private UI/API route tables, source-module inventories, and queue-storage paths
- Environment variable catalogs, key-path details, and consumer-key sketches
- Operational queue/admin actions, CLI run recipes, and process exit-code cookbooks
- Step-by-step host/control-plane/Vault setup and monitoring/babysitting workflows
- Deploy strategy configuration tables and fixture command recipes

### Changed

- Entire pack rewritten around **public-safe product contracts** (live truth, proof-of-work, streaks, brokered secrets, multi-step queues)
- [`layout.md`](./layout.md) is logical product areas only — not a filesystem map
- [`composer.md`](./composer.md), [`loop-and-missions.md`](./loop-and-missions.md), [`vault.md`](./vault.md), [`rebuild.md`](./rebuild.md), and related docs describe roles and contracts without operator procedures
- Rendered pages and zip members stay substantive educational articles; every public route remains reachable

### Not published

- Host-private install notes, recovery runbooks, and real topology remain out of this share pack

---

## v1.2 / guide-2026-07-17g — public pack is product design only

### Removed

- Residual install-private and control-plane admin material from rendered and zip-packaged docs
- Material that still read as operator procedures after earlier sanitization passes

### Changed

- [`operations.md`](./operations.md) is pack scope only (what is / is not included)
- [`lazy-medic-sentinel.md`](./lazy-medic-sentinel.md) reduced to observe-only boundary
- Architecture, overview, one-pager, diagrams, footguns, principles, rebuild, examples, and composer docs limited to product contracts
- Printable one-pager HTML aligned

### Not published

- Host-private install notes remain out of this share pack

---

## v1.2 / guide-2026-07-17f — strip operator procedures

### Removed

- Production troubleshooting tables and diagnostic prompts from public docs
- Failure-mode and process-manager recipes that belonged in private install notes

### Changed

- [`footguns.md`](./footguns.md) reframed as design pitfalls (contracts and boundaries)
- Pack docs kept as product-level shapes only
- [`ai-prompts.md`](./ai-prompts.md) reduced to rebuild / new-product / friend-share prompts

---

## v1.2 / guide-2026-07-17e — public ops sanitization

### Removed

- Host-private babysit prompts and day-to-day command recipes from the share pack

### Changed

- Replaced absolute server-style path roots with placeholder **`RATCHET_ROOT/{control,harness,projects}`**
- Fixed broken pack-external root-pointer link (404 on the public site)

---

## v1.2 / guide-2026-07-17d — one-pager clean-URL rename

### Changed

- Renamed the printable HTML one-pager: file `one-pager.html` → `one-pager-print.html`, published and linked as [`one-pager-print`](./one-pager-print). The pack host serves the site with Vercel `cleanUrls`, which 308-redirects every `.html` URL to its extensionless form — listing and linking the extensionless clean URL makes the printable sheet return 200 directly.

---

## v1.2 / guide-2026-07-17c — web-publication sanitization

### Added

- [`one-pager-print`](./one-pager-print) staged next to [`one-pager.md`](./one-pager.md): same single-sheet content, self-contained (inline SVG, `@media print`, letter) so the published link works with no external assets

### Changed

- Replaced third-party service domains in examples with unmistakable placeholders (`git.example.com`, `cloud.example.com`)
- Removed host-specific scratch paths from command examples — every remaining filesystem path is an illustrative install root

---

## v1.2 / guide-2026-07-17b — public path names

### Changed

- Replaced production-style absolute path roots with neutral **`RATCHET_ROOT/{control,harness,projects}`** placeholders across the pack so the guide can be published without fingerprinting a real host layout
- Clarified that those paths are **illustrative** only

---

## v1.2 / guide-2026-07-17 — product behavior + versioned packs

### Added

- Versioned layout under `docs/ratchet-guide/`: `v1.1/` archive, `v1.2/` current
- Documented **~4–8 step** planner depth and thin-draft resplit
- Documented queue clear **All (keep running)** keeps draft steps
- Assist/model footguns: CLI flag mismatches, real errors vs synthetic prose

### Changed

- Composer, vault, loop, footguns, README, and one-pager updated for multi-step campaigns and pack version pointers

---

## guide-2026-07-15b — diagrams, one-pager, changelog

### Added

- [`diagrams.md`](./diagrams.md) — Mermaid gallery (happy path, trust, loop state, Vault sequence, rebuild phases)
- [`one-pager.md`](./one-pager.md) — single-sheet Markdown summary
- [`one-pager-print`](./one-pager-print) — print/PDF-friendly HTML
- This file (`CHANGELOG.md`)

---

## guide-2026-07-15a — multi-file pack split

### Added

- Full pack split from a single-file root pointer into overview, architecture, principles, layout, loop-and-missions, composer, lazy-medic-sentinel, vault, projects-and-deploy, operations, rebuild, ai-prompts, footguns, examples, and README index
- Paste-ready AI prompts for rebuild, new product, and friend share

---

## How to bump

When you edit the guide meaningfully:

1. Add a dated section at the **top** of this file
2. List Added / Changed / Removed
3. Optionally tag the share zip `ratchet-guide-YYYY-MM-DD`

Keep entries short; link to files instead of pasting whole docs.
