# Guide changelog

Tracks **this documentation pack** (`docs/ratchet-guide/v1.2/`), not the Ratchet software itself.

**Why it exists:** when you re-share the folder with friends or drop it on a new host, they can see what changed without diffing every file. Software/ops changes on a private host still belong in a private `docs/operator/CHANGELOG.md` (not this pack).

Pack folders: **`v1.2`** (current) · **`v1.1`** (archive). Section labels below remain `guide-YYYY-MM-DD` plus pack version.

---

## v1.2 / guide-2026-07-17c — web-publication sanitization

### Added

- [`one-pager.html`](./one-pager.html) staged next to [`one-pager.md`](./one-pager.md): same single-sheet content, self-contained (inline SVG, `@media print`, letter) so the published link works with no external assets

### Changed

- Replaced third-party service domains in examples with unmistakable placeholders (`git.example.com`, `cloud.example.com`)
- Removed host-specific scratch paths (null-device output sinks, relative rsync sources) from command examples — every remaining filesystem path is illustrative under `/srv/ratchet/`

---

## v1.2 / guide-2026-07-17b — public path names

### Changed

- Replaced production-style absolute path roots with neutral **`/srv/ratchet/{control,harness,projects}`** across the pack so the guide can be published without fingerprinting a real host layout
- Clarified that those paths are **illustrative** only

---

## v1.2 / guide-2026-07-17 — product behavior + versioned packs

### Added

- Versioned layout under `docs/ratchet-guide/`: `v1.1/` archive, `v1.2/` current
- Documented **~4–8 step** planner depth and thin-draft resplit
- Documented queue clear **All (keep running)** keeps draft steps
- Documented vault **custom arm hours**, **8h shortcut**, and **arm persistence** across consumer restart
- Assist/model footguns: Kimi in assist registry, CLI flag mismatches, real errors vs synthetic prose

### Changed

- [`composer.md`](./composer.md) — queue builder rules, clear modes, models
- [`vault.md`](./vault.md) — arm duration + persistence
- [`operations.md`](./operations.md) — post-reboot unlock vs re-arm
- [`loop-and-missions.md`](./loop-and-missions.md) — multi-step campaign note
- [`footguns.md`](./footguns.md) — new queue / vault / model rows
- [`README.md`](./README.md), [`one-pager.md`](./one-pager.md) — pack version pointers

### Not in this pack (parked product work)

- Draft list double-numbering UI fix
- Model effort selection UI

---

## guide-2026-07-15c — operator sidecar

### Added

- Operator **sidecar** docs: Grok Build CLI babysit — **~2 min until clean**, then **~10 min until done**
- [`ai-prompts.md`](./ai-prompts.md) section G (sidecar babysit prompt)

### Changed

- [`operations.md`](./operations.md) — full sidecar section
- [`lazy-medic-sentinel.md`](./lazy-medic-sentinel.md), [`overview.md`](./overview.md), [`principles.md`](./principles.md), [`architecture.md`](./architecture.md), [`diagrams.md`](./diagrams.md) — sidecar in ops model + cadence diagram
- [`README.md`](./README.md), [`one-pager.md`](./one-pager.md), [`one-pager.html`](./one-pager.html) — mental model + links

---

## guide-2026-07-15b — diagrams, one-pager, changelog

### Added

- [`diagrams.md`](./diagrams.md) — Mermaid gallery (happy path, edge, trust, loop state, ops vs product, Vault sequence, rebuild phases)
- [`one-pager.md`](./one-pager.md) — single-sheet Markdown summary
- [`one-pager.html`](./one-pager.html) — print/PDF-friendly HTML (letter, @media print, self-contained inline SVG)
- This file (`CHANGELOG.md`)

### Changed

- [`README.md`](./README.md) — links to diagrams, one-pager, changelog
- [`overview.md`](./overview.md) — Mermaid happy-path diagram
- [`architecture.md`](./architecture.md) — Mermaid system map + data-flow diagram
- [`loop-and-missions.md`](./loop-and-missions.md) — Mermaid iteration state diagram
- Root [`RATCHET-SYSTEM.md`](../../RATCHET-SYSTEM.md) — points at one-pager + diagrams

---

## guide-2026-07-15a — multi-file pack split

### Added

- Full pack split from single-file `RATCHET-SYSTEM.md`:
  - overview, architecture, principles, layout
  - loop-and-missions, composer, lazy-medic-sentinel, vault
  - projects-and-deploy, operations, rebuild, ai-prompts
  - footguns, examples, README index
- Expanded production lessons (KillMode, Railway dedupe, Vercel author, version auth, queue multi-step)
- Paste-ready AI prompts (rebuild / ops / heal / deploy-timeout / new product)

### Changed

- Root `RATCHET-SYSTEM.md` became a short pointer to `docs/ratchet-guide/`

---

## How to bump

When you edit the guide meaningfully:

1. Add a dated section at the **top** of this file
2. List Added / Changed / Removed
3. Optionally tag the share zip `ratchet-guide-YYYY-MM-DD`

Keep entries short; link to files instead of pasting whole docs.
