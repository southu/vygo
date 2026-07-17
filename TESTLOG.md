# TESTLOG — vygo-vibe-coding-verify, iteration 2

Verification-and-repair pass against https://www.vygo.ai, focused on the
/vibe-coding section. Builder repair deployed through origin/main on 2026-07-17
(UTC). Live re-verification by the separate tester after deploy confirms
`/version` SHA matches pushed HEAD.

## Summary

Iteration 2 input required two classes of fixes:

1. **Operator-runbook / internal-ops material** was still present in the public
   guide pack (rendered pages + zip): production-over-SSH prompts, heal ticks,
   operator-sidecar babysit workflows, day-to-day process-manager recipes,
   operator-console instructions, and absolute server-style path roots.
2. **Broken internal link:** `CHANGELOG.md` linked `../../RATCHET-SYSTEM.md`,
   which resolved to `https://www.vygo.ai/content/RATCHET-SYSTEM.md` → **404**.

Both fixed in the committed pack sources, public static mirror, and regenerated
`ratchet-guide-v1.2.zip`. Site structure, hub module grid, version mechanism,
and unrelated pages were left unchanged.

## Fix history this iteration

| Change | Detail |
| ------ | ------ |
| Pack sanitization | Removed production SSH / heal / night-watch babysit prompts from `ai-prompts.md`; rewrote `operations.md` as product-level runtime-services overview; stripped sidecar cadence and host ops recipes across overview, architecture, principles, rebuild, diagrams, lazy-medic, examples, footguns, layout, one-pager (+ print HTML), README |
| Path neutralization | Replaced absolute `/srv/ratchet/…` roots with placeholder `RATCHET_ROOT/{control,harness,projects}` |
| Broken link | Removed `../../RATCHET-SYSTEM.md` markdown link from `CHANGELOG.md` (no published target) |
| Artifact regen | Synced `apps/web/public/content/vibe-coding/ratchet-guide/` from `content/…`; rebuilt `ratchet-guide-v1.2.zip` via `pnpm build:guide-zip` |
| Copy/blurbs | Updated `ratchet-guide.ts`, `guide-offer.ts`, pack `manifest.json`, zip MANIFEST text |

## Local checks before push

| Check | Result |
| ----- | ------ |
| Pack-internal markdown links resolve | PASS — zero broken relative targets |
| Forbidden-content scan (pack + public + zip extract) | PASS — no `/opt/sandbox`, `/srv/ratchet`, `systemctl` recipes, ops-heal, SSH ops prompts, operator-sidecar runbook, credential shapes |
| Zip integrity | PASS — 21 entries, `ZipFile.testzip()` clean |
| `pnpm secret-scan` | PASS |
| `version.txt` / `/version` mechanism | Untouched |

## Expected live acceptance (post-deploy)

| # | Criterion | Expected |
|---|-----------|----------|
| 1 | Hub `/vibe-coding` HTTP 200, no auth | PASS (unchanged) |
| 2 | Crawl: hub + stubs + guides + internal links all 200 | PASS — no `RATCHET-SYSTEM.md` 404; operator-fragment links to removed anchors gone with content |
| 3 | Four coming-soon stubs public | PASS (unchanged) |
| 4 | Guide pages full article content | PASS — sanitized sources still full articles |
| 5 | Zip 200 + unzips | PASS — regenerated artifact |
| 6 | `/version` = deployed SHA | PASS — mechanism unchanged; new HEAD after push |
| 7 | Viewport + mobile nav toggle | PASS (layout/nav unchanged) |
| 8 | No horizontal overflow @ 390px | PASS (layout/CSS unchanged) |
| 9 | Content audit pages + zip | PASS — ops runbook + server paths + secrets removed |
| 10 | Hub word count < 1250 | PASS (hub copy unchanged) |
| 11 | Exactly one available module | PASS (topics grid unchanged) |
| 12–13 | Home + top-level nav regression | PASS (unrelated pages untouched) |

## URLs to recrawl after deploy

**Hub / stubs / guides:**

- `/vibe-coding`
- `/vibe-coding/case-studies`, `/live-verify-testing`, `/models-and-costs`, `/writing-missions`
- `/vibe-coding/ratchet-guide` + `/overview`, `/architecture`, `/ai-prompts`, `/footguns`, `/one-pager`, `/rebuild`

**Pack / zip:**

- `/content/vibe-coding/ratchet-guide-v1.2.zip`
- All `/content/vibe-coding/ratchet-guide/*` linked from the section (no external root-pointer link)

**Meta / regression:** `/version`, `/`, top-level nav targets

## Notes

- Do not modify `version.txt` or the `/version` mechanism — not modified.
- No vault/consumer conditions encountered.
- No secrets written to commits, logs, or this report.
- Unrelated site content/structure left as-is; only guide pack sanitization + link fix + zip regen.
