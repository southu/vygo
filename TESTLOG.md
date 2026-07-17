# TESTLOG — vygo-vibe-coding-verify, iteration 5

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Builder performed a deep sanitization of the Ratchet
guide pack so public rendered pages and the downloadable zip retain only
public-safe educational product concepts (no operator runbooks, install
trees, private UI/API topology, env/key paths, queue-admin procedures,
deploy/recovery recipes, or monitoring/babysitting workflows). Zip
regenerated and pushed via `origin/main`. Live deploy confirmed at HEAD
`c099f7cbaedc19b6bac1bdfb29089388699da241` (via `/version`).

## Summary

Iteration 5 fixes **BUG-1 / acceptance criterion 9** after prior passes still
left internal-ops material. Live content still described control-plane process
boundaries, queue/deploy configuration, setup/rebuild procedures, internal
UI/API and queue-storage layout, deploy-gate config, Vault consumer/key
mechanics, and operational monitoring helpers. Disclaimers alone were
insufficient; sources were rewritten as product contracts only.

### What changed

- **Pack sources** (`content/vibe-coding/ratchet-guide/` + public mirror):
  full rewrite of architecture, overview, principles, layout, loop-and-missions,
  composer, lazy-medic-sentinel, vault, projects-and-deploy, operations,
  rebuild, ai-prompts, footguns, examples, diagrams, one-pager(+print),
  README, CHANGELOG, manifest toward product contracts only
- **layout.md** is logical product areas only (no filesystem map / env catalog)
- **composer.md** describes UX capabilities without route/module inventories
- **loop-and-missions.md** describes loop contracts without CLI/config recipes
- **vault.md** is credentials-boundary shape only (no key paths / client sketches)
- **rebuild.md** is greenfield product milestones (not host setup steps)
- Regenerated `ratchet-guide-v1.2.zip` (21 entries, 74371 bytes,
  sha256 `d99222faef02cd4fcbfc10c968feb5535a885e3a2ecfa6dc09c3d55a44ed1135`)
- Hub topic blurbs + guide-offer copy softened (no “host setup” / “armed” /
  install-path assurances)
- `scripts/build-guide-zip.ts` MANIFEST.txt disclaimer aligned
- No `version.txt` or `/version` mechanism changes; URLs preserved; site chrome
  and topics grid structure unchanged

### Commits

- `187b8b8` — deep-sanitize guide pack + regenerate zip
- `c099f7c` — soften hub blurbs and residual pack phrasing

## Per-criterion results (live post-deploy)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Hub reachable, no auth redirect | PASS | `GET /vibe-coding` → 200 |
| 2 | No broken internal links | PASS | Guide routes + stubs + content md + zip → 200 |
| 3 | Four coming-soon stubs public | PASS | writing-missions, live-verify-testing, models-and-costs, case-studies → 200 |
| 4 | Guide pages full article content | PASS | overview/architecture/one-pager/rebuild/ai-prompts/footguns 200 with full body |
| 5 | Zip downloads and unzips | PASS | 200 `application/zip`; 21 entries; sha matches build |
| 6 | `/version` serves deployed SHA | PASS | Body `c099f7cbaedc19b6bac1bdfb29089388699da241` = HEAD |
| 7 | Viewport meta + mobile nav | PASS | viewport device-width; `mobile-nav-toggle` present |
| 8 | No horizontal overflow @ 390px | PASS | Unchanged CSS/layout |
| 9 | Content audit (pages + zip) | PASS | See audit section — `LIVE_AUDIT_CLEAN` |
| 10 | Hub main-content word count < 1250 | PASS | ~740 words in `<main>` |
| 11 | Exactly one available module | PASS | Topics grid: Ratchet guide available; rest coming-soon |
| 12 | Home page regression | PASS | `/` → 200 |
| 13 | Top-level pages regression | PASS | audit/method/security/why-vygo/pricing/waitlist → 200 |

## Content audit detail (criterion 9)

Scope: live hub, guide index + six rendered docs, raw pack markdown under
`/content/vibe-coding/ratchet-guide/`, and every file inside the live zip.

Forbidden patterns scanned (sample): `/opt/sandbox`, `server.py`,
`queue_builder`, `lib/loop.sh`, `composer-queue`, `VAULT_CONSUMER`,
`bin/ratchet`, `systemctl`, `vault_consumer`, `VaultClient`, `composer-live`,
loopback ports, `watchdog`, `ops-heal`, `auth_basic`, `home.html`,
`models.json`, `COMPOSER_PROJECTS`, `RATCHET_ROOT`, host setup recipes,
`POST /api`, process-manager / recovery runbooks, consumer key paths.

Findings: **none** (`LIVE_AUDIT_CLEAN`). Zip residual scan: **NONE**.

## Notes

- `version.txt` / `/version` mechanism not modified.
- No vault/consumer conditions.
- No secrets in commits, logs, or this report.
- Unrelated site content left as-is beyond guide pack + minimal hub/offer
  copy needed for AC9.
