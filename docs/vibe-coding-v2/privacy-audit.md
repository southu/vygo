# /vibe-coding v2 privacy audit

Scope: every concrete identifier that (a) the live v1 `/vibe-coding` hub
article exposed, and (b) any concrete identifier found in adjacent repo
material that a v2 rewrite could plausibly be tempted to pull in while adding
the new "what changed" / "ops tooling" content. For each, the generic
replacement adopted in the v2 article is listed.

## 1. v1 hub article itself — findings

Checked the live-rendered HTML (`GET https://www.vygo.ai/vibe-coding`,
2026-07-29) and every string field in `apps/web/src/content/vibe-coding.ts` /
`vibe-coding-modules.ts` that feeds it. Every `href` on the page is a
site-relative route (`/apply`, `/vibe-coding/ratchet-guide`,
`/content/vibe-coding/ratchet-guide-v1.2.zip`, etc.) or an in-page anchor
(`#main-content`).

**Result: the v1 hub article contained zero concrete external identifiers** —
no real hostnames, no repo slugs, no usernames, no absolute filesystem paths,
no dashboard links. It was already written at a generic, product-level tone.

This means the privacy risk for v2 isn't "clean up what v1 leaked" — it's
"don't introduce a leak while adding new content about the ratchet system,"
since the new sections (deploy gating, the babysit loop, ops tooling)
describe infrastructure concepts that _do_ have real, private counterparts
elsewhere in this repository. Section 2 documents those and the replacement
chosen for each, so the v2 draft never copies one in verbatim.

## 2. Real identifiers found elsewhere in the repo (must not appear in v2)

These were found while researching the current ratchet system for v2 content
(in `docs/learning-cycle.md`, `deploy/railway/README.md`,
`docs/deployment.md`, `docs/railway-backend-readiness.md`, and
`QUEUE-BUILDER-GOAL-readiness-check.md`) — none are in the current v1 article,
but are exactly the kind of concrete detail the new v2 sections could
accidentally repeat.

| Real identifier                                                                                                                                                                                                                       | Where found                                                                                                                                              | Generic replacement used in v2                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `https://dash.saniorem.com` (operator console / mission composer)                                                                                                                                                                     | `docs/learning-cycle.md`                                                                                                                                 | `https://dashboard.example.com`                                                                                          |
| `southu/vygo` (GitHub repo slug)                                                                                                                                                                                                      | `deploy/railway/README.md`, `docs/deployment.md`, `docs/railway-backend-readiness.md`, `docs/learning-cycle.md`, `QUEUE-BUILDER-GOAL-readiness-check.md` | `your-org/your-repo`                                                                                                     |
| `https://api-production-7f2d.up.railway.app` (backend hostname)                                                                                                                                                                       | `docs/railway-backend-readiness.md`                                                                                                                      | `https://api.example.com`                                                                                                |
| `https://www.vygo.ai/version`, `https://www.vygo.ai/api/guide/learnings` (real production URLs)                                                                                                                                       | `docs/learning-cycle.md`                                                                                                                                 | `https://example.com/version`, env-var reference `$DEPLOY_VERSION_URL`                                                   |
| `southu` (git/GitHub username)                                                                                                                                                                                                        | git remote, `deploy/railway/README.md`                                                                                                                   | not used; where an actor needs naming, generic role names are used ("the builder", "the operator") instead of a username |
| Machine-local paths (none found with a real leading `/Users/` or `/home/` root — internal docs already use the `RATCHET_ROOT/{control,harness,projects}` placeholder convention per `content/vibe-coding/ratchet-guide/CHANGELOG.md`) | n/a                                                                                                                                                      | v2 follows the same placeholder-root convention wherever a path is illustrated                                           |

## 3. New v2 content — placeholder conventions adopted

Every inline example added to the v2 article uses one of:

- **Domains:** `example.com` / `dashboard.example.com` / `api.example.com` —
  never a real vygo.ai subdomain or third-party SaaS hostname.
- **Repo slugs:** `your-org/your-repo` — never `southu/vygo` or any real
  GitHub org.
- **Env-var references:** `$DEPLOY_VERSION_URL`, `${COMMIT_SHA}` — standing in
  for any config value that would otherwise be a real URL or token.
- **Paths:** generic relative names (`project/`, `your-app/`) — no absolute,
  machine-rooted paths.

## 4. Secrets / credentials

No API keys, tokens, or credential-shaped strings appear anywhere in the v1
article or in any file added for v2. `pnpm secret-scan` was run against the
full working tree before commit (see change-summary.md) as a second check.

## 5. Conclusion

v1 required no redaction — it never named real infrastructure. The audit's
value for this mission is forward-looking: it fixes the exact replacement
table (section 2) used while drafting v2, so the new "what changed since v1"
and "ops tooling" content stays at the same generic, product-contract level
v1 already established, instead of regressing to concrete internal names.
