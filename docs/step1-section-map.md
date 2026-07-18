# Homepage "STEP 1 — Get set up for vibe coding first" section: ownership map

Documentation-only map of the homepage section that renders the **STEP 1**
eyebrow, the **Get set up for vibe coding first** headline, the vibe-coding
kick-start intro paragraph, and the numbered cards beneath it. Nothing in the
rendered output is changed by this file — it is documentation only.

## Source verification (iteration 1)

Verified in the checkout that the shipped source already carries the reworded
vibe-coding kick-start copy, in the correct section and position:

- Headline is **"Get set up for vibe coding first"** (`apps/web/src/app/page.tsx:70`–`72`).
- Intro paragraph mentions **vibe coding**, the **kick-start Ratchet system**,
  and **leapfrog**ing everyone still using **CLIs** (`apps/web/src/app/page.tsx:73`–`77`).
- The old intro beginning **"Do this once, before reading anything else…"** is
  gone from the source.
- The section is still `data-section="setup-first"`, the **first content section
  immediately after the hero**, with the numbered step cards and the guide
  download links following it (unchanged).

Shipped to production at commit `9e30157` ("deploy(homepage): ship STEP 1
vibe-coding copy to production"). Live verification is performed by the tester
against https://www.vygo.ai/.

## Owning file

The entire section is authored inline in the homepage server component:

- **`apps/web/src/app/page.tsx`** — `HomePage()` (default export). The section
  is the JSX `<section … data-section="setup-first">` block at
  **`apps/web/src/app/page.tsx:67`–`128`**.

The numbered cards are the only piece not literally inline in `page.tsx`; they
are rendered by a shared component from a content module (see the cards row
below).

## Piece-by-piece ownership

| Piece                           | File · location                                                                  | Owner (component / element)                                                                                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Section container           | `apps/web/src/app/page.tsx:67`–`128`                                             | `<section className="section-pad border-t border-border bg-surface" data-section="setup-first">` wrapping a `<div className="container-page max-w-3xl">`                                                                                                                                                 |
| (b) "STEP 1" eyebrow label      | `apps/web/src/app/page.tsx:69`                                                   | `<p className="eyebrow">Step 1</p>`                                                                                                                                                                                                                                                                      |
| (c) "Get set up for vibe coding first" headline | `apps/web/src/app/page.tsx:70`–`72`                             | `<h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Get set up for vibe coding first</h2>`                                                                                                                                                                                                 |
| (d) Intro paragraph             | `apps/web/src/app/page.tsx:73`–`77`                                              | `<p className="mt-4 text-lg text-muted">Have you started vibe coding yet? … kick-start Ratchet system … leapfrog everyone still using CLIs …</p>`                                                                                                                                                          |
| (e) Numbered cards              | Rendered at `apps/web/src/app/page.tsx:78` via `<StepList steps={setupSteps} />` | Card markup/numbering: `StepList` in `apps/web/src/components/vibe-coding/StepCard.tsx:16`–`32` (renders `<ol className="step-list">` → one `<li className="step-card">` per step, with the visible number from `index + 1`). Card copy: `setupSteps` in `apps/web/src/content/guide-setup.tsx:35`–`72`. |

### Note on the eyebrow's letter-case

The eyebrow's **text node is inline as `Step 1`** (mixed case) in the markup.
It displays as **STEP 1** because the `.eyebrow` utility applies
`text-transform: uppercase` — see `apps/web/src/app/globals.css:75`–`77`
(`@apply … uppercase …`). So the visible "STEP 1" label is inline copy
uppercased by CSS, not a separately stored string.

## Inline vs. sourced (content/data file)

- **Eyebrow "Step 1" → inline.** Hard-coded text node in `page.tsx:69`.
- **Headline "Get set up for vibe coding first" → inline.** Hard-coded in the
  `<h2>` at `page.tsx:70`–`72`.
- **Intro paragraph → inline.** Hard-coded in the `<p>` at `page.tsx:73`–`77`
  (the vibe-coding kick-start copy).
- **Numbered cards → sourced from a content/data file.** The list is not inline
  in `page.tsx`; it is imported from a content module and passed to a shared
  component:
  - Data/copy source: **`apps/web/src/content/guide-setup.tsx`**, exported const
    **`setupSteps`** (imported at `page.tsx:19` as
    `import { setupSteps } from "@/content/guide-setup"`). Each entry supplies a
    card `title` and `body`; the three card titles are
    "Download the system zip into your project folder",
    "Open your AI coding tool in that same folder", and "Run the setup prompt".
    The setup prompt shown in card 3 is the `setupPrompt` const in the same
    file (`apps/web/src/content/guide-setup.tsx:15`–`28`).
  - Presentation/markup + the visible step numbers: **`StepList`** in
    `apps/web/src/components/vibe-coding/StepCard.tsx` (imported at `page.tsx:17`
    as `import { StepList } from "@/components/vibe-coding/StepCard"`).

In short: the eyebrow, headline, and intro paragraph are **inline in the
`page.tsx` markup**; only the numbered cards are **sourced from a content/data
file** (`apps/web/src/content/guide-setup.tsx`, key `setupSteps`), with markup
from `StepCard.tsx`.

## Position on the homepage: just below the fold, immediately after the hero

In `apps/web/src/app/page.tsx`, the `<main id="main-content">` renders its
sections in this source order:

1. **Hero** — `<section … data-section="hero">` at `page.tsx:29`–`64`
   (the page's opening/above-the-fold section: `hero.eyebrow`, `hero.headline`
   `<h1>`, hero body, CTAs, and the architecture diagram).
2. **This section** — `<section … data-section="setup-first">` at
   `page.tsx:67`–`128` (STEP 1 / Get set up for vibe coding first).
3. **Growing pains** — `<section className="section-pad …">` at
   `page.tsx:131`, which begins with `homepage.pains.heading`.

So the STEP 1 / "Get set up for vibe coding first" section **sits just below the
fold on the homepage, immediately after the hero** — it is the very first section after the
hero and its markup occurs later in the document than the hero, before the
"Growing pains" section. This ordering is preserved byte-for-byte in the live
HTML at https://www.vygo.ai/.

## Related surface (not the homepage)

A near-identical setup-first section exists on the `/vibe-coding` landing page
at `apps/web/src/app/vibe-coding/page.tsx:49`–`…` (also `data-section="setup-first"`,
reusing the same `StepList` + `setupSteps`). That is a **separate page**; the
homepage owner is `apps/web/src/app/page.tsx` as mapped above.
