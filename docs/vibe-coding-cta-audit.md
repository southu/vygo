# /vibe-coding CTA audit — top "Start free" vs. lower-page download CTA

**Mission:** `vygo-vibe-coding-cta-verification`
**Date (UTC):** 2026-07-18
**Repository:** `southu/vygo`
**Branch:** `main`
**Scope:** Confirm the topmost visible "Start free" CTA on `/vibe-coding`
resolves to the guide zip download, and that the lower-page "Get the guide"
CTA retains its pre-existing zip destination. No `version.txt` changed.

---

## History

This audit originally recorded the top hero CTA as `/apply` (see git history
for the prior revision of this file). Commit `6b26758` ("point top Start free
CTA directly to guide zip") changed the hero CTA to route straight to the zip,
matching the lower-page download CTA. This revision documents the resulting
(current) state.

## Topmost "Start free" CTA (hero section — targets the guide zip)

- **Page:** `apps/web/src/app/vibe-coding/page.tsx` — hero section (`data-section="hero"`).
- **Markup:** plain anchor, `<a className="btn-primary" href={guideOffer.ctas.startFree.href}>{content.hero.primaryCta.label}</a>` —
  no client-side navigation, matching the lower-page GuideOffer download
  behavior for a static file.
- **Content source:** `guideOffer.ctas.startFree` in
  `apps/web/src/content/guide-offer.ts`: `{ label: "Start free", href:
"/content/vibe-coding/ratchet-guide-v1.2.zip" }`.
- **Resolved href (live):** `/content/vibe-coding/ratchet-guide-v1.2.zip` — a
  static zip build artifact, not a route.
- **Verified locally:** static export (`pnpm build:web`) served on
  `127.0.0.1:8380`; `apps/web/e2e/vibe-coding-cta.spec.ts` asserts the hero
  "Start free" link's `href` and that a `GET` of that href returns `200` with
  an `application/zip` content type.

## Lower-page download CTA (unchanged, distinct implementation)

- **Component:** `apps/web/src/components/vibe-coding/GuideOffer.tsx`, rendered
  into `/vibe-coding` (`<GuideOffer />`, `data-section="guide-offer"`, below
  the hero and "Get set up first" sections).
- **Content source:** same `guideOffer.ctas.startFree` entry in
  `apps/web/src/content/guide-offer.ts` — this component was not modified.
- **Markup:** plain `<a href={guideOffer.ctas.startFree.href}
data-offer-cta="start-free">` — no client-side navigation, no auth gate.
- **Verified locally:** `apps/web/e2e/vibe-coding-cta.spec.ts` asserts the
  `[data-offer-cta="start-free"]` anchor's `href` is unchanged and resolves to
  `200`.

## Finding

Both CTAs now resolve to the same zip download, by design — the hero CTA was
pointed directly at the existing download instead of the apply form, and the
lower-page CTA was left untouched:

| CTA                         | Component                  | Resolved href                                                           |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| Top hero CTA                | inline `<a>` in `page.tsx` | `/content/vibe-coding/ratchet-guide-v1.2.zip` (zip download)            |
| Lower "Get the guide" CTA   | `GuideOffer`               | `/content/vibe-coding/ratchet-guide-v1.2.zip` (zip download, unchanged) |
| Final-page "Start free" CTA | `CtaLink` in `page.tsx`    | `/apply` (apply form, unchanged)                                        |

## Automated coverage

`apps/web/e2e/vibe-coding-cta.spec.ts` (Playwright) covers:

1. `GET /` → `200`.
2. `GET /vibe-coding` → `200`.
3. Hero "Start free" anchor `href` is the guide zip; `GET` of that href → `200`, `content-type: application/zip`.
4. Lower-page `[data-offer-cta="start-free"]` anchor `href` is the same guide zip; `GET` → `200`, `content-type: application/zip`.
5. The final-CTA-section "Start free" anchor is unchanged and still targets `/apply`.

Run locally against a static export:

```
pnpm build:web
# out/ is a gitignored build artifact with no serve.json of its own; Vercel's
# cleanUrls:true (vercel.json) needs a local equivalent so /vibe-coding
# resolves to vibe-coding.html:
echo '{"cleanUrls": true}' > apps/web/out/serve.json
npx serve -l 8380 apps/web/out
cd apps/web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:8380 npx playwright test e2e/vibe-coding-cta.spec.ts --project=desktop
```

All 5 tests passed locally at time of writing.
