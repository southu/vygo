# Capture log — figure verification

Human-readable companion to `capture-log.json`.

- **Tool:** headless Chromium driven via Playwright. Chrome MCP was **not
  available** in this environment, so the same documented headless-Chromium
  fallback used by the original figure capture was used here. Viewport
  **1440×900 @ deviceScaleFactor 1**, waiting for network-idle + settle before
  capture.
- **Deployed SHA at verification:** `e4691432f7b14f71da90f2d3b57cec3c7467fefa`.

## Figure re-capture: NOT performed

All six figure slots passed live verification, so **no figure was re-captured or
replaced**. No `dash.saniorem.com` routes were driven this mission. The original
figure-source capture log (which dashboard routes were driven and which asset
files were written when the figures were first captured) remains committed at
`apps/web/public/content/ratchet-guide-assets/capture-log.json` and is served at
<https://www.vygo.ai/content/ratchet-guide-assets/capture-log.json>.

## Routes visited with headless Chrome (this mission)

| # | Route | HTTP | Purpose | File(s) written |
| - | ----- | :--: | ------- | --------------- |
| 1 | `https://www.vygo.ai/vibe-coding/ratchet-guide` | 200 | Full-page render (rendered page 1440×14250) for before/after evidence + figure-slot enumeration | `renders/guide-page.before.webp`, `renders/guide-page.after.webp` (byte-identical — no figure replaced) |

Driver invocation (Playwright, `playwright-core`):

```js
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-gpu','--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('https://www.vygo.ai/vibe-coding/ratchet-guide', { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });   // -> guide-page render
```

## Asset URLs probed (headers only — no file written to the repo)

| Served asset | HTTP | Content-Type | Last-Modified | Dimensions |
| ------------ | :--: | ------------ | ------------- | ---------- |
| `ratchet-guide-composer-product-shell-setup-opt.webp` | 200 | image/webp | Wed, 22 Jul 2026 12:14:17 GMT | 1440×900 |
| `ratchet-guide-composer-goal-capture-opt.webp` | 200 | image/webp | Wed, 22 Jul 2026 12:02:46 GMT | 1440×900 |
| `ratchet-guide-composer-draft-queue-opt.webp` | 200 | image/webp | Wed, 22 Jul 2026 12:02:46 GMT | 1440×900 |
| `ratchet-guide-composer-run-limits-opt.webp` | 200 | image/webp | Wed, 22 Jul 2026 12:02:47 GMT | 1440×900 |

## Regression endpoints probed

| Route | HTTP | Body |
| ----- | :--: | ---- |
| `https://www.vygo.ai/` | 200 | — |
| `https://www.vygo.ai/version` | 200 | `e4691432f7b14f71da90f2d3b57cec3c7467fefa` |

## Files written to the repo by this verification

- `renders/guide-page.before.webp`
- `renders/guide-page.after.webp`
- `guide-page-source.pre-mission.html`
- `live-verification-probe.txt`
