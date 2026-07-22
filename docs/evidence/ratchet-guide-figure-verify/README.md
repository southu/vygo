# Ratchet guide — figure verification evidence

Mission: **vygo-ratchet-guide-figure-verify** — verify (and, where needed, refresh)
every figure/screenshot on the published guide at
<https://www.vygo.ai/vibe-coding/ratchet-guide>, then commit a verification
evidence bundle to the repo.

**Verified against the LIVE site on 2026-07-22** (deployed SHA
`e4691432f7b14f71da90f2d3b57cec3c7467fefa`, which matches this checkout's HEAD at
verification time). See `live-verification-probe.txt` for the raw, reproducible
probe output.

## Outcome — no figure re-capture needed

Every figure on the live guide already passes verification. The four captured
figures were refreshed to optimized WebP by the immediately preceding commits
(`a710424`, `c8257e9`, `e469143`) and this mission **confirms** them against the
live page rather than replacing them:

- **6 figure slots** on the guide, matching the 6 rows in
  `docs/ratchet-guide-image-inventory.ts` (single source of truth).
- **4 captured slots** (`fig-01`–`fig-04`) each render exactly one `<img>` — all
  four return **HTTP 200** with **`Content-Type: image/webp`**, all decode to a
  single shared **1440×900**, all carry a **`Last-Modified` of 2026-07-22** (fresh,
  no stale file), and all have a **non-empty `alt`**.
- **2 flagged slots** (`fig-05`, `fig-06`) render the frame-only placeholder (no
  `<img>`, no served asset) because the UI the guide describes no longer exists
  1:1 on the live dashboard. These are recorded in `follow-ups.md` for a separate
  guide-text revision mission — this mission does **not** rewrite guide text.

Because no figure failed, **no figure was replaced**; guide title, headings, body
text, captions, and asset filenames are unchanged. The "before" and "after"
full-page renders are therefore byte-identical — that identity is itself the
evidence that the figures were already fresh and valid.

## Contents

| File | What it is |
| ---- | ---------- |
| `validation-checklist.md` | Per-screenshot validation checklist — all captured rows PASS; flagged rows deferred as follow-ups. |
| `capture-log.json` / `capture-log.md` | Machine- and human-readable log of every route visited and every file written during this verification. |
| `pii-review.md` | Full-resolution PII review notes confirming no sensitive data appears in any screenshot. |
| `follow-ups.md` | The two flagged slots (UI no longer exists), recorded for a separate guide-text revision mission. |
| `live-verification-probe.txt` | Raw output of the reproducible live probe (endpoints + per-image headers). |
| `guide-page-source.pre-mission.html` | Snapshot of the live guide page HTML at mission start (pre-mission page source, for filename/`<img>` comparison). |
| `renders/guide-page.before.webp` | Full-page render of the guide (pre-mission live state). |
| `renders/guide-page.after.webp` | Full-page render of the guide (post-verification) — byte-identical to `before` because no figure was replaced. |

## How to reproduce

```sh
# Endpoints + per-image headers (HTTP status, Content-Type, Last-Modified, ETag):
curl -sSI https://www.vygo.ai/content/ratchet-guide-assets/<asset>.webp

# Decoded pixel dimensions of each served WebP:
webpinfo <asset>.webp   # or: dwebp <asset>.webp -o out.png && identify out.png

# Full-page render (headless Chromium, 1440-wide viewport, fullPage):
#   see capture-log.md for the exact driver invocation.
```

## Constraints honored

- `version.txt` untouched.
- No change to the guide's textual content (title, headings, body, captions).
- No tokens, secrets, email addresses, or operator PII in any commit, log, or
  artifact (see `pii-review.md`).
