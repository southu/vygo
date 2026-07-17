# TESTLOG — vygo-vibe-coding-verify, iteration 2

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Builder repaired pack content, pushed `main`, and
re-verified the live deploy at HEAD
`f3bb9a2e7cd05949d33a30c0cf45e303c13b8e4c` (confirmed via `/version`).

## Summary

Iteration 2 fixed:

1. **Operator-runbook / internal-ops material** in rendered guides and the zip
   (production SSH prompts, heal ticks, operator-sidecar babysit workflows,
   day-to-day process-manager recipes, operator-console instructions, absolute
   server-style path roots).
2. **Broken internal link:** `CHANGELOG.md` linked `../../RATCHET-SYSTEM.md` →
   `https://www.vygo.ai/content/RATCHET-SYSTEM.md` **404**. Link removed.

Deployed commit: `f3bb9a2` — pack sources, public static mirror, regenerated
`ratchet-guide-v1.2.zip`, copy blurbs. Hub module grid, version mechanism, and
unrelated pages unchanged.

## Per-criterion results (live post-deploy)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Hub reachable, no auth redirect | PASS | `GET /vibe-coding` → 200 HTTPS |
| 2 | No broken internal links in section | PASS | Crawl of hub + 4 stubs + 7 guide routes + discovered `/content/vibe-coding/*` links → 30 unique URLs, **0** 4xx/5xx; no `RATCHET-SYSTEM.md` href |
| 3 | Four coming-soon stubs public | PASS | All four stubs → 200 |
| 4 | Guide pages full article content | PASS | All seven guide routes → 200 with article body; sanitized content still complete |
| 5 | Zip downloads and unzips | PASS | `GET /content/vibe-coding/ratchet-guide-v1.2.zip` → 200 `application/zip` (103172 bytes); 21 entries; testzip clean |
| 6 | `/version` serves deployed SHA | PASS | Body `f3bb9a2e7cd05949d33a30c0cf45e303c13b8e4c` = pushed HEAD |
| 7 | Viewport meta + mobile nav toggle | PASS | Hub has `width=device-width` viewport + `mobile-nav-toggle` (layout/nav unchanged from iter 1) |
| 8 | No horizontal overflow @ 390px | PASS | Unchanged CSS/layout from iter 1 green run |
| 9 | Content audit (pages + zip) | PASS | See audit section |
| 10 | Hub main-content word count < 1250 | PASS | 758 words in `<main>` |
| 11 | Exactly one available module | PASS | Unique available topic: "Ratchet system guide" → `/vibe-coding/ratchet-guide`; remaining topics coming-soon (DOM duplicates count 2× for responsive markup) |
| 12 | Home page regression | PASS | `GET /` → 200 |
| 13 | Top-level pages regression | PASS | `/audit /method /security /why-vygo /pricing /waitlist` → 200 |

## Content audit detail (criterion 9)

Scope: live rendered hub/stubs/guides (crawl), live pack markdown under
`/content/vibe-coding/ratchet-guide/`, and all files inside the live zip.

Forbidden patterns scanned: `/opt/sandbox`, `/srv/ratchet`, `systemctl`
recipes, `ops-heal`, operator-sidecar / production-SSH prompts,
`../../RATCHET-SYSTEM`, credential shapes.

Findings: **none** on live HTML/markdown crawl or zip extract.

Removed in this iteration (repo + zip): production-over-SSH / heal / babysit
prompts; process-manager day-to-day recipes; operator-console runbook;
sidecar cadence docs; absolute `/srv/ratchet/…` path roots (now
`RATCHET_ROOT/…` placeholders).

## Fix history this iteration

- `f3bb9a2` — sanitize guide pack + fix CHANGELOG link + regenerate zip +
  TESTLOG (this iteration’s product fix).
- Follow-up TESTLOG commit records live re-verification against deployed HEAD.

## Notes

- `version.txt` / `/version` mechanism not modified.
- No vault/consumer conditions (`vault_locked`, `consumer_not_armed`,
  `vault_access_denied`).
- No secrets in commits, logs, or this report.
- Unrelated site content/structure left as-is.
