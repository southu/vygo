# /vibe-coding CTA audit — top "Start free" vs. lower-page download CTA

**Mission:** `identify-vibe-coding-cta-links`
**Date (UTC):** 2026-07-18
**Repository:** `southu/vygo`
**Branch:** `main`
**Scope:** Identify the topmost visible "Start free" CTA on `/vibe-coding`, its
source file and resolved href, and confirm the lower-page download CTA is a
distinct, existing implementation that has not been consolidated with or
substituted for the top CTA. No application behavior or `version.txt` changed.

---

## Topmost "Start free" CTA (targets the apply form)

- **Page:** `apps/web/src/app/vibe-coding/page.tsx` — hero section (`data-section="hero"`, line 31).
- **Component:** `<CtaLink href={content.hero.primaryCta.href}>` →
  `apps/web/src/components/CtaLink.tsx`. `/apply` is not a waitlist href, not
  external, not a hash anchor, so `CtaLink` renders a plain Next.js
  `<Link href="/apply">`.
- **Content source:** `hero.primaryCta` in `apps/web/src/content/vibe-coding.ts`
  (line 84): `{ label: "Start free", href: "/apply" }`.
- **Resolved href (live):** `/apply` → `apps/web/src/app/apply/page.tsx`, the
  apply form.
- **Verified live:** `curl https://www.vygo.ai/vibe-coding` returns
  `<a class="btn-primary " href="/apply">Start free</a>` as the first "Start
  free" anchor on the page. A second instance of the same hero CTA is repeated
  in the page's final CTA section (line 171), also `href="/apply"`.

## Lower-page download CTA (distinct implementation, distinct href)

- **Component:** `apps/web/src/components/vibe-coding/GuideOffer.tsx`, rendered
  into `/vibe-coding` at line 57 (`<GuideOffer />`, `data-section="guide-offer"`,
  below the hero and "Get set up first" sections).
- **Content source:** `guideOffer.ctas.startFree` in
  `apps/web/src/content/guide-offer.ts`: `{ label: "Start free", href:
  "/content/vibe-coding/ratchet-guide-v1.2.zip" }` — a static zip build
  artifact, not a route.
- **Markup:** plain `<a href={guideOffer.ctas.startFree.href}
  data-offer-cta="start-free">` — no client-side navigation, no auth gate.
- **Verified live:** `curl https://www.vygo.ai/vibe-coding` returns
  `<a class="btn-primary" href="/content/vibe-coding/ratchet-guide-v1.2.zip"
  data-offer-cta="start-free">Start free</a>`.

## Finding

Both CTAs share the label "Start free" but are separate implementations with
different resolved hrefs:

| CTA                     | Component      | Resolved href                                        |
| ------------------------ | -------------- | ----------------------------------------------------- |
| Top hero CTA              | `CtaLink`      | `/apply` (apply form)                                  |
| Lower "Get the guide" CTA | `GuideOffer`   | `/content/vibe-coding/ratchet-guide-v1.2.zip` (zip download) |

The lower CTA has **not** been consolidated with or substituted for the top
CTA — it is a distinct, existing implementation (`GuideOffer.tsx` /
`guide-offer.ts`) with its own `data-offer-cta="start-free"` marker,
independent of the hero's `CtaLink` / `content/vibe-coding.ts` wiring.

## Live acceptance checks (verified via curl at time of writing)

1. `GET https://www.vygo.ai/vibe-coding` → `200`.
2. Topmost "Start free" anchor → `href="/apply"`.
3. Lower-page download "Start free" anchor → `href="/content/vibe-coding/ratchet-guide-v1.2.zip"` (differs from #2).
4. `GET https://www.vygo.ai/` → `200`.

No code changes were required: the live site already satisfies all four
acceptance criteria as implemented.
