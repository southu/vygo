# Ratchet guide refresh — verification evidence

Refresh of the Ratchet system guide (`/vibe-coding/ratchet-guide`) so it reflects
recent Ratchet improvements, plus a seeded learnings log.

## Files here

- `guide-index.before.tsx` — copy of the guide index page source **before** editing.
- `loop-and-missions.before.md` — copy of the pack's loop/missions doc **before** editing.
- `ratchet-learnings.before.json` — the learnings-log data store **before** seeding (`{ "entries": [] }`).
- `../ratchet-guide-refresh.diff` — unified **before/after** diff of every content change in this refresh.

## Improvement source

Ratchet's git history in this checkout is a shallow private mirror (2 commits, both
2026-07-18); its `README.md` is the release-note-equivalent source of truth. The
improvements folded into the guide are sourced to that README's section anchors and
the mirror's commit history:

| Date       | Improvement                                                        | Source                                    | Status       |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------ |
| 2026-07-18 | Three deploy-gate strategies (version-endpoint, fixed-delay, command) | README#deploy-strategies               | incorporated |
| 2026-07-18 | CI-gated deploys with the command strategy                         | README#deploy-strategies                  | incorporated |
| 2026-07-18 | Structurally sandboxed live tester (three-pass protocol)           | README#the-real-tester                    | incorporated |
| 2026-07-18 | Append-only TESTLOG bug ledger                                     | README#testlogmd                          | incorporated |
| 2026-07-18 | Per-invocation wall-clock timeouts with one retry                  | README#guardrails                         | incorporated |
| 2026-07-22 | Single-flight overnight helpers that respect operator holds        | commit 1caad24                            | pending      |
| 2026-07-18 | Run-state heartbeat + `ratchet status`/`report`/`kill`             | README#run-state--monitoring              | pending      |

Pending items are deliberately excluded from the public product-design pack (host-ops /
operator surface) and carry a one-line reason in the learnings log.

## Where it lands on the live site

- Guide index Changelog section: `/vibe-coding/ratchet-guide#changelog`
- Learnings log: `/vibe-coding/ratchet-guide/learnings-log`
- Learnings data store: `data/ratchet-learnings.json` (append-only; validated by
  `packages/validation/src/learnings-log.ts`)

## Local checks run before commit

- `tsx --test packages/validation/src/learnings-log.test.ts` — 9/9 pass
- `@vygo/web` + `@vygo/validation` `typecheck` — clean
- `eslint` on changed files — clean
- `prettier --check` on changed files — clean
- `next build` — succeeds; `/vibe-coding/ratchet-guide` and
  `/vibe-coding/ratchet-guide/learnings-log` prerender, and the built HTML contains the
  Changelog, the incorporated entries (dated 2026-07-22 with source links), and the
  pending entries with reasons.
