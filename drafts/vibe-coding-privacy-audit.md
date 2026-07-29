# Privacy audit — vibe-coding v2 draft

This audit lists every private identifier that shows up in the v1 article
and the internal source material used while researching the v2 draft, the
generic replacement used in the public v2 draft, and grep evidence that the
final v2 draft contains none of them.

## Replacement table

| Private identifier | Where it appears in v1 / source material                                                                                                                                                    | Generic v2 replacement             | Appears in v2 draft                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `ratchet`          | Product/system name for the build → deploy-gate → test loop; used throughout the v1 `/vibe-coding` hub page (hero, loop, non-negotiables, mental model, topics) and the internal guide pack | `control loop`                     | Yes — "The control loop", "Deploy gating", "The self-healing loop" sections |
| `composer`         | Product name for the goal-intake / mission-queue UI; referenced in the v1 "mental model" section ("Composer is the factory office...") and the internal guide pack's component tables       | `goal-intake dashboard`            | Yes — "The three pieces" section                                            |
| `southu`           | GitHub org/username in internal source links (e.g. `github.com/southu/ratchet`, `github.com/southu/vygo`) cited in the internal learnings log and guide pack                                | `the project maintainer`           | Yes — closing line of the "What to steal for your own project" section      |
| `saniorem`         | Internal dashboard hostname (`dash.saniorem.com`) referenced in internal image-inventory and screenshot-capture source material                                                             | `harness dashboard`                | Yes — "The three pieces" section                                            |
| `grok`             | AI coding tool name listed among supported tools in internal FAQ/content source material                                                                                                    | `third-party AI coding assistants` | Yes — "What to steal for your own project" section                          |

Every replacement phrase in the right-hand column above appears verbatim in
the fetched `/drafts/vibe-coding-v2` body.

## Grep evidence

Reviewer pass run against the final v2 draft body, case-insensitive, one
term at a time:

```
$ grep -in ratchet drafts/vibe-coding-v2.md    -> 0 matches
$ grep -in saniorem drafts/vibe-coding-v2.md   -> 0 matches
$ grep -in southu drafts/vibe-coding-v2.md     -> 0 matches
$ grep -in composer drafts/vibe-coding-v2.md   -> 0 matches
$ grep -in grok drafts/vibe-coding-v2.md       -> 0 matches
```

Result: **0 matches for all five private identifiers** in the final v2
draft. Combined command and result:

```
$ grep -inoE 'ratchet|saniorem|southu|composer|grok' drafts/vibe-coding-v2.md
(no output — 0 matches)
```

## Method

1. Captured the live v1 article (`drafts/vibe-coding-v1-baseline.md`) and
   read the internal guide pack (`content/vibe-coding/ratchet-guide/*.md`)
   and learnings log (`data/ratchet-learnings.json`) as source material for
   the rewrite.
2. Wrote the v2 draft using only generic, placeholder names for every
   product, host, tool, and person named in the source material.
3. Ran a case-insensitive grep of the five flagged private identifiers
   against the finished v2 draft and recorded the zero-match result above.
4. Cross-checked that every replacement term listed in the table actually
   appears in the v2 draft text (not just intended, but present).

No access tokens, API keys, credentials, or secret-shaped strings were
found in, or added to, either the v1 baseline capture or the v2 draft.
