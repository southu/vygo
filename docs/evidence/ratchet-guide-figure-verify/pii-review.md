# PII / sensitive-data review — figure screenshots

Reviewed **at full resolution** (each served WebP decoded to PNG and inspected
pixel-for-pixel; the full-page guide render was also inspected). This file is
committed to the repo as evidence — it is **not** published as a linked public
page.

**Verdict: CLEAN.** No email addresses, personal names, session tokens, API keys,
bearer tokens, cookies, IP addresses, real repository URLs, or other operator PII
appear in any screenshot, asset filename, alt text, or caption.

## What each figure actually shows (full-resolution transcript)

All four captured figures depict the Ratchet Mission Composer form pre-filled with
**fabricated demo values only**:

| Field / element | Value shown | Sensitive? |
| --------------- | ----------- | :--------: |
| name | `demo-mission` | no — generic demo slug |
| repo | `https://github.com/acme/demo-app.git` | no — `acme/demo-app` is a placeholder org/repo |
| live_url | `https://demo.example.com` | no — reserved example domain |
| version_endpoint | `/version` | no — generic path |
| mission | "Add a /health endpoint that returns JSON uptime for the demo app." | no — generic example task |
| acceptance | "GET /health returns HTTP 200 with a JSON body containing an uptime field." | no — generic assertion |
| deploy | branch `main`, strategy `fixed-delay`, wait 600s, delay 90s | no — config values |
| builder / tester | model dropdowns (Claude Opus 4.8, Grok 4.5), max_turns, timeouts, read_only | no — non-secret config |
| queue items | "SKIPLINE: patch the login redirect", "Add a /health endpoint", "Refactor the queue module", "Update the README" | no — generic example queue rows |
| limits | max_iterations 10, consecutive_passes_required 2, max_budget_usd 25 | no — numeric config |
| chrome / footer | "Sentinel" status pill; "Ratchet guide changelog: Revision history … GR-2026-07-22-002" | no — public UI chrome / public changelog ref |

## Per-figure notes

- **fig-01 product-shell-setup** — Identity + Target project + Deploy fieldsets.
  Only demo repo/URL values; no secrets. ✅
- **fig-02 goal-capture** — Goal (mission + acceptance list) + Builder fieldset.
  Example mission text only; no secrets. ✅
- **fig-03 draft-queue** — Mission queue panel + AI assist + rendered
  `mission.yaml` preview. The YAML is fully composed of the demo values above; no
  secrets, no tokens. ✅
- **fig-04 run-limits** — Tester + Harness + Limits fieldsets. Config values only. ✅

## Method

```sh
# decode each served WebP to PNG at native resolution, then inspect
dwebp <asset>-opt.webp -o <asset>.png
# full-page guide render inspected: renders/guide-page.before.webp (1440×14250)
```

No redaction was required because the source screens were already captured from a
sanitized demo state (composer pre-filled with fake example values), per the
original capture log.
