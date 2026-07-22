# TESTLOG — vygo-guide-screenshot-optimize, iteration 1

Optimize the validated screenshots embedded in the Ratchet guide page
(`https://www.vygo.ai/vibe-coding/ratchet-guide`) and rewire the guide source
to the new optimized assets. Only images, image `src` references, captions, and
alt text change; no guide prose is edited. `version.txt` / the version endpoint
are untouched.

**Deploy SHA baseline (pre-change):** `7c043b86e7732f8c484dc1bf0bbfe42ba5ebe8e3`
(matched `GET /version` and `origin/main` HEAD when this baseline was recorded).

## Iteration-1 baseline recorded from the live guide page (AC6, AC8)

### Legacy screenshot filenames referenced by the live guide page (before the change)

Captured from `GET https://www.vygo.ai/vibe-coding/ratchet-guide` HTML, served
under `/content/ratchet-guide-assets/`:

- `ratchet-guide-composer-product-shell-setup.png`
- `ratchet-guide-composer-goal-capture.png`
- `ratchet-guide-composer-draft-queue.png`
- `ratchet-guide-composer-run-limits.png`

On the passing run, none of these legacy filenames appear anywhere in the live
guide page source, and each legacy URL
(`https://www.vygo.ai/content/ratchet-guide-assets/<name>.png`) returns 404 /
is no longer served as a referenced figure. The four PNG files are deleted from
the repo in this iteration.

### Pre-existing guide section headings (must remain verbatim — AC8 regression)

Captured from the same live HTML (anchor `#` suffixes are rendered decoration,
not part of the heading text):

1. Ratchet system guide
2. Get set up
3. Understand what Ratchet does
4. Run your first mission
5. Run the build, deploy, and test loop
6. Build real, provable changes
7. Wait for the deploy gate to confirm your push
8. Test only the live, deployed app
9. Know what "done" means at every layer
10. Go further with advanced usage
11. Plan multi-step campaigns instead of one mega-mission
12. Turn on infrastructure provisioning carefully
13. Avoid the common design pitfalls
14. Know the core components
15. Read the full system guide
16. Browse every file in the pack
17. Troubleshooting & FAQ
18. I can't start a run — Composer says a field is missing
19. My deploy never finishes and the gate looks stuck
20. My version endpoint isn't returning the new SHA after I push
21. The tester keeps failing the same criterion every iteration
22. My mission stopped before reaching a pass streak
23. Changelog
24. Revision history
25. Incorporated improvements

## Change applied this iteration

Four validated figure screenshots were recompressed from 1440×900 PNG to
optimized WebP at the identical 1440×900 pixel dimensions (so every figure keeps
the shared 1.6:1 viewport aspect ratio and uniform sizing), each saved under a
NEW asset filename, and the guide figure slots were repointed to them with
explicit descriptive alt text.

| Guide figure slot        | New optimized asset (`/content/ratchet-guide-assets/`)         | Dimensions | Size    | Alt text |
| ------------------------ | -------------------------------------------------------------- | ---------- | ------- | -------- |
| Create a product shell   | `ratchet-guide-composer-product-shell-setup-opt.webp`          | 1440×900   | ~33 KB  | "Composer product shell setup page showing the Git remote, Live URL, and Version endpoint fields" |
| Describe your goal       | `ratchet-guide-composer-goal-capture-opt.webp`                 | 1440×900   | ~26 KB  | "Composer goal capture page showing the Goal and Constraints input fields" |
| Accept the draft queue   | `ratchet-guide-composer-draft-queue-opt.webp`                  | 1440×900   | ~64 KB  | "Composer draft queue page showing the proposed step list and the Accept draft button" |
| Set your limits          | `ratchet-guide-composer-run-limits-opt.webp`                   | 1440×900   | ~25 KB  | "Composer run limits page showing the Max iterations, Pass streak, and Spend cap fields" |

All four new files are well under the 1,048,576-byte cap (largest ~64 KB) and
share the same width:height ratio. The four legacy `.png` files were deleted.
The "Start the run" mission-control slot remains an intentional frame-only
placeholder (no `<img>`), unchanged.

## Acceptance criteria (verified against live by the separate tester)

| #   | Criterion                                                        | Notes for verification |
| --- | ---------------------------------------------------------------- | ---------------------- |
| 1   | Guide page loads over HTTPS with HTTP 200                         | `GET /vibe-coding/ratchet-guide` |
| 2   | Every figure `<img>` src (and srcset) → 200, image/png or image/webp | Four `-opt.webp` assets served `image/webp` |
| 3   | Every figure image < 1,048,576 bytes                             | Largest ~64 KB |
| 4   | All figure images share same width:height within 1%             | All 1440×900 (1.6:1) |
| 5   | Every figure `<img>` has ≥4-word descriptive alt naming page + a control | See alt column above |
| 6   | Legacy filenames absent from live source; legacy URLs 404        | Four PNGs deleted; baseline listed above |
| 7   | Zero broken image references on the guide page                   | Only the four `-opt.webp` assets referenced |
| 8   | Guide prose unchanged — all headings above still present verbatim | No prose edits |
| 9   | Home `https://www.vygo.ai/` 200 and nav still links to guide     | No home/nav edits |
| 10  | `https://www.vygo.ai/version` 200 serving deployed SHA           | `version.txt` untouched |
