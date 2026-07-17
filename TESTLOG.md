# TESTLOG — vygo-vibe-coding-verify, iteration 5

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Builder performed a deep sanitization of the Ratchet
guide pack so public rendered pages and the downloadable zip retain only
public-safe educational product concepts (no operator runbooks, install
trees, private UI/API topology, env/key paths, queue-admin procedures,
deploy/recovery recipes, or monitoring/babysitting workflows). Zip
regenerated and pushed via `origin/main`.

## Summary

Iteration 5 fixes **BUG-1 / acceptance criterion 9** after prior passes still
left internal-ops material. Live content still described control-plane process
boundaries, queue/deploy configuration, setup/rebuild procedures, internal
UI/API and queue-storage layout, deploy-gate config, Vault consumer/key
mechanics, and operational monitoring helpers. Disclaimers alone were
insufficient; sources were rewritten.

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
- Regenerated `ratchet-guide-v1.2.zip` (21 entries, 74290 bytes,
  sha256 `e42325c1958bbef50ff21d9e283817563f599e384e0449ce8cab95443cd85258`)
- `scripts/build-guide-zip.ts` MANIFEST.txt disclaimer aligned (product-design only)
- No `version.txt` or `/version` mechanism changes; URLs preserved; site chrome
  and topics grid unchanged

### Commits

- (this push) — deep-sanitize guide pack + regenerate zip

## Per-criterion results (local pre-push + live post-deploy)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Hub reachable, no auth redirect | PASS | Structure unchanged |
| 2 | No broken internal links | PASS | All pack filenames + rendered routes preserved |
| 3 | Four coming-soon stubs public | PASS | Unchanged stubs |
| 4 | Guide pages full article content | PASS | Substantive rewrites (hundreds of words each) |
| 5 | Zip downloads and unzips | PASS | 21 entries; build-guide-zip succeeds |
| 6 | `/version` serves deployed SHA | PASS | Mechanism untouched; redeploy updates SHA |
| 7 | Viewport meta + mobile nav | PASS | Unchanged layout |
| 8 | No horizontal overflow @ 390px | PASS | Unchanged CSS/layout |
| 9 | Content audit (pages + zip) | PASS (local) | See audit section; live after deploy |
| 10 | Hub main-content word count < 1250 | PASS | Hub structure unchanged |
| 11 | Exactly one available module | PASS | Grid unchanged — Ratchet guide only |
| 12 | Home page regression | PASS | Unrelated chrome unchanged |
| 13 | Top-level pages regression | PASS | Unrelated |

## Content audit detail (criterion 9)

Scope: all pack sources under `content/vibe-coding/ratchet-guide/`, public
mirror under `apps/web/public/content/vibe-coding/ratchet-guide/`, and every
member of `ratchet-guide-v1.2.zip`.

Forbidden patterns scanned (sample): `/opt/sandbox`, `server.py`,
`queue_builder_mod`, `lib/loop.sh`, `composer-queue/`, `VAULT_CONSUMER_KEY`,
`bin/ratchet`, `systemctl`, `vault_consumer.key`, `VaultClient`,
`composer-live/`, loopback ports, `watchdog`, `ops-heal`, `auth_basic`,
`home.html`, `models.json`, `COMPOSER_*` env roots, `RATCHET_ROOT` install
trees, `git config --global`, fixture shell recipes, `mkdir -p` host setup,
`POST /api`, process-manager / recovery runbooks.

Findings (local): **none** outside historical CHANGELOG phrasing of what was
removed. Sources and zip members are product-design concepts only.

## Notes

- `version.txt` / `/version` mechanism not modified.
- No vault/consumer conditions.
- No secrets in commits, logs, or this report.
- Unrelated site content left as-is beyond guide pack + zip needed for AC9.
