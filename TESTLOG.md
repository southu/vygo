# TESTLOG — vygo-vibe-coding-verify, iteration 3

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Builder stripped remaining operator/internal-ops
material from the Ratchet guide pack (rendered pages + zip), pushed `main`,
and re-verified the live deploy at HEAD
`2cd2f9cfde9ecb43a72d75731a28208a4c9751fe` (confirmed via `/version`).

## Summary

Iteration 3 fixed **acceptance criterion 9** (content audit). Live SHA
`112a895…` still publicly exposed production/operator procedures in the
vibe-coding guide (notably footguns Deploy & host / queue recovery /
Railway+Vault failure modes, plus related ops material in operations,
architecture, rebuild, vault, and zip members).

### What changed (product commit `2cd2f9c`)

- **footguns.md** — rewritten from production troubleshooting tables to
  product-level **design pitfalls** (contracts and boundaries only).
- **operations.md, vault.md, rebuild.md, architecture.md,
  lazy-medic-sentinel.md, projects-and-deploy.md, principles.md,
  ai-prompts.md** (+ supporting overview/composer/layout/loop/diagrams/
  one-pager/examples/README/CHANGELOG/manifest) — removed operator
  procedures: host deploy diagnostics, queue zombie/requeue guidance,
  cloud token/Vault operational failure modes, process-manager operational
  recipes, deploy-timeout debug prompt.
- Regenerated `ratchet-guide-v1.2.zip` (21 entries, 97199 bytes) and public
  static mirror from sanitized `content/vibe-coding/ratchet-guide/`.
- Preserved all existing URLs/routes; no version.txt or /version mechanism
  changes; hub module grid and site chrome unchanged.

## Per-criterion results (live post-deploy)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Hub reachable, no auth redirect | PASS | `GET /vibe-coding` → 200 HTTPS |
| 2 | No broken internal links in section | PASS | Guide routes + stubs + content md + zip → 200 |
| 3 | Four coming-soon stubs public | PASS | models-and-costs, case-studies, writing-missions, live-verify-testing → 200 |
| 4 | Guide pages full article content | PASS | All seven guide routes → 200; footguns shows “design pitfalls” |
| 5 | Zip downloads and unzips | PASS | `GET …/ratchet-guide-v1.2.zip` → 200 zip; testzip clean; sha256 matches build |
| 6 | `/version` serves deployed SHA | PASS | Body `2cd2f9cfde9ecb43a72d75731a28208a4c9751fe` = pushed HEAD |
| 7 | Viewport meta + mobile nav toggle | PASS | Unchanged layout from prior green run |
| 8 | No horizontal overflow @ 390px | PASS | Unchanged CSS/layout |
| 9 | Content audit (pages + zip) | PASS | See audit section |
| 10 | Hub main-content word count < 1250 | PASS | Hub content unchanged this iteration |
| 11 | Exactly one available module | PASS | Grid unchanged — Ratchet guide only available |
| 12 | Home page regression | PASS | `GET /` → 200 |
| 13 | Top-level pages regression | PASS | Unchanged nav targets still 200 |

## Content audit detail (criterion 9)

Scope: live rendered hub/stubs/guides, live pack markdown under
`/content/vibe-coding/ratchet-guide/`, and all files inside the live zip.

Forbidden patterns scanned (sample): `/opt/sandbox`, `/srv/ratchet`,
`systemctl`, `ops-heal`, `whoami Not Authorized`, `Check host deploy`,
`Allowlist bot`, `GitHub ahead of live`, `90s hangs on ensure`,
`vault-rebuild.md`, `kill zombies`, `Deploy & host`, `Railway / provision`,
`Deployment was blocked`, `account/workspace token`, blind-requeue recipes.

Findings: **none** on live HTML crawl, live raw markdown, or zip extract.

Positive live signals: footguns title **“design pitfalls”** with sections
Deploy truth / Builder proof-of-work / Process boundaries; operations.md
states architecture reference, not a host operations runbook.

## Fix history this iteration

- `2cd2f9c` — sanitize guide pack + regenerate zip + TESTLOG draft
- Follow-up TESTLOG commit records live re-verification against deployed HEAD

## Notes

- `version.txt` / `/version` mechanism not modified.
- No vault/consumer conditions (`vault_locked`, `consumer_not_armed`,
  `vault_access_denied`).
- No secrets in commits, logs, or this report.
- Unrelated site content/structure left as-is beyond guide pack sanitization.
