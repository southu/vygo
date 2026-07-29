# Change summary — vibe-coding v1 → v2

Section-by-section disposition between the live v1 `/vibe-coding` article
(`drafts/vibe-coding-v1-baseline.md`) and the v2 draft
(`drafts/vibe-coding-v2.md`), plus a checklist confirming each new-system
component is present in v2 with generic naming.

## Section-by-section disposition

| v1 section                     | Disposition          | Notes                                                                                                                                                                                              |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero                           | Rewritten            | Same "moves forward" framing, reworded around the control loop / goal-intake dashboard / read-only ops tooling breakdown instead of naming products                                                |
| Get set up first               | Dropped              | Product-specific download-and-paste-prompt onboarding; not applicable to a generic reader-facing article                                                                                           |
| Get the guide (download offer) | Dropped              | Product download CTA, out of scope for a technical draft article                                                                                                                                   |
| What it is / what it is not    | Kept, rewritten      | Same definitional contrast; product/team-specific phrasing removed                                                                                                                                 |
| The loop                       | Rewritten, split     | Expanded into two v2 sections — "Deploy gating" and "The self-healing loop" — with concrete mechanics (SHA polling strategies, streak-reset rule, timeout-and-retry rule) that v1 only gestured at |
| Non-negotiables                | Rewritten, folded in | Its four rules are folded into the "Deploy gating" mistake table and the "self-healing loop" contract bullets rather than kept as a separate list                                                  |
| The mental model               | Rewritten            | The three-piece breakdown survives ("The three pieces" section) with generic names instead of product names                                                                                        |
| Topics grid                    | Dropped              | Internal doc links (guide pack, case studies, etc.); not applicable outside the live site's own navigation                                                                                         |
| Final CTA                      | Dropped              | Marketing/sales CTA; out of scope — this draft adds no new marketing content per the mission constraints                                                                                           |
| —                              | New                  | "Read-only ops tooling" — not present in v1 at all; v1 only referenced "Optional helpers" implicitly inside the guide pack, never on the article page itself                                       |
| —                              | New                  | "Learnings from running this in production" — three concrete failure-and-fix accounts; v1 had no learnings content                                                                                 |
| —                              | New                  | "What to steal for your own project" — practical takeaway checklist; v1 had no equivalent                                                                                                          |

## New-system component checklist

Confirms each new-system component appears in the v2 draft, described in
generic terms (no private product names, hostnames, or org/usernames):

- [x] **Deploy gating** — present. Section "Deploy gating: don't grade
      what isn't live" describes the SHA-verified version endpoint, the
      three gate strategies (version-endpoint polling, fixed-delay
      fallback, command-based gate), and the common-mistakes table — all
      generic.
- [x] **Self-healing loop** — present. Section "The self-healing loop"
      describes the automatic build → gate → test → retry cycle, the
      streak-of-passes rule, the proof-of-work requirement, and the
      per-invocation timeout-and-retry rule — all generic.
- [x] **Read-only ops tooling** — present. Section "Read-only ops
      tooling" describes the observe-only helper, its separation-of-powers
      table, and the three properties (no product features, single-flight + respects holds, credentials never shared with builder/tester
      context) — all generic.

Cross-reference: `drafts/vibe-coding-privacy-audit.md` confirms none of
the five flagged private identifiers appear anywhere in the v2 draft that
these components are described in.
