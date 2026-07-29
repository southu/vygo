# /vibe-coding v1 → v2 change summary

A reviewer's checklist: what actually changed on disk, and how to confirm
nothing private from v1 survives into v2 and that every new example is
generic. See [`inventory.md`](./inventory.md) for the full section-by-section
disposition and [`privacy-audit.md`](./privacy-audit.md) for the identifier
replacement table this change follows.

## Files changed

| File                                    | Change                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/content/vibe-coding.ts`   | Added two new content blocks: `whatsNew` (heading, intro, 3 items, 1 code example) and `learnings` (heading, intro, 6 items). No existing field was renamed, removed, or reworded.                                                                   |
| `apps/web/src/app/vibe-coding/page.tsx` | Added one import (`CodeBlock`) and two new `<section>` blocks (`data-section="whats-new"`, `data-section="learnings"`) between the existing `mental-model` and `topics` sections. No existing section, CTA, or `data-section` attribute was touched. |
| `docs/vibe-coding-v2/inventory.md`      | New — supporting artifact (deliverable 1).                                                                                                                                                                                                           |
| `docs/vibe-coding-v2/privacy-audit.md`  | New — supporting artifact (deliverable 2).                                                                                                                                                                                                           |
| `docs/vibe-coding-v2/change-summary.md` | New — this file (deliverable 4).                                                                                                                                                                                                                     |

Nothing else was modified. `apps/web/src/content/vibe-coding-modules.ts`,
`apps/web/src/components/vibe-coding/*`, `version.txt`, and every other route
are untouched.

## Before / after — page structure

```diff
   hero
   setup-first
   GuideOffer
   definition
   loop
   non-negotiables
   mental-model
+  whats-new       (NEW — "What changed since v1")
+  learnings       (NEW — "Learnings")
   topics
   cta
```

## Diff-review checklist

- [ ] `git diff apps/web/src/app/vibe-coding/page.tsx` shows only an added
      import and two added `<section>` blocks — no existing JSX removed or
      reordered.
- [ ] `git diff apps/web/src/content/vibe-coding.ts` shows only two new keys
      (`whatsNew`, `learnings`) added to the `vibeCodingContent` object — every
      pre-existing key (`hero`, `definition`, `loop`, `nonNegotiables`,
      `mentalModel`, `topics`, `finalCta`) is byte-identical to v1.
- [ ] The new `whatsNew.example.code` block contains `example.com`,
      `your-org/your-repo`, and `${COMMIT_SHA}` — no real hostname or repo
      slug.
- [ ] Neither new file, nor any file in this change, contains
      `dash.saniorem.com`, `southu/vygo`, `southu`, or any
      `*.up.railway.app` hostname (the real identifiers logged in
      `privacy-audit.md` section 2).
- [ ] `grep -rn "/Users/\|/home/\|C:\\\\" <changed files>` returns nothing.
- [ ] `grep -riE "sk-ant|AKIA|ghp_|api_key=|token=" <changed files>` returns
      nothing.
- [ ] `pnpm secret-scan`, `pnpm lint`, `pnpm format:check`, and
      `pnpm --filter @vygo/web typecheck` all pass.
- [ ] `apps/web/e2e/vibe-coding-cta.spec.ts` still passes — hero, GuideOffer,
      and final-CTA anchors are unmoved (this spec asserts their `href`s by
      `data-section` and are one of the sections explicitly left untouched
      above).

## What a reviewer does NOT need to check

Sections not listed in the "before/after" diagram above as new
(`hero` … `mental-model`, `topics`, `cta`) are unchanged from the live v1
article — see `inventory.md` row-by-row disposition for why each one was kept
verbatim rather than rewritten.
