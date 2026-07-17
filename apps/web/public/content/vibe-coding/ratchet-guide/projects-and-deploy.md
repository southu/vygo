# Projects & product deploys

← [Vault](./vault.md) · [Index](./README.md) · Next: [Operations](./operations.md)

---

## Project shells

Each product is a folder under `COMPOSER_PROJECTS_ROOT` (default `/srv/ratchet/projects/<slug>`) with a `project.json` (see [layout.md](./layout.md)).

Composer **Projects** UI creates/edits these shells and can clone repos onto the VPC.

### Folder vs product

| Folder               | Typical use                    |
| -------------------- | ------------------------------ |
| `acme` (example)     | Example product app            |
| `composer`           | Control-plane self-improvement |
| `sandbox` / fixtures | Experiments                    |

**Never** enqueue product acceptance against Composer’s repo while pointing `live_url` at the product domain. That mismatch is a classic deploy-timeout poison pill.

---

## Product requirements for version-endpoint strategy

1. **GitHub (or other) remote** the builder can push to with harness credentials
2. **Hosted deploy** on push to `main` (Railway, Vercel, …)
3. **`GET /version`** (or configured path) returns the **currently deployed** SHA
4. Version path is **public** to the gate’s curl (no basic auth)
5. Optional but recommended: bind cloud project UUID in `project.json`

### Implementing `/version` (any stack)

Minimal static/export idea:

```text
// write at build time
process.env.VERCEL_GIT_COMMIT_SHA
// or git rev-parse HEAD in CI → public/version.txt
```

Railway/Docker: embed `SOURCE_VERSION` or build arg SHA into a tiny route.

Acceptance for the endpoint itself:

- 200 response
- Body matches what `git rev-parse HEAD` was at the deploy that is live
- Updates when a new deploy finishes

---

## Git identity

Set globally on the build host **and** in `composer.env`:

```bash
git config --global user.name "YourTeamBotOrHuman"
git config --global user.email "you@example.com"
```

Also set `GIT_AUTHOR_*` / `GIT_COMMITTER_*` for non-interactive commits from Python/shell helpers.

### Vercel “Deployment was blocked”

| Signal                          | Meaning              |
| ------------------------------- | -------------------- |
| GitHub shows new commit         | Push worked          |
| `gh` deployment status: blocked | Host rejected author |
| Live `/version` stuck           | Gate will timeout    |

**Unblock:** empty commit as an allowed author and push; or fix allowlist / identity permanently.

Production short-circuit: after first version mismatch, check GitHub deployment statuses for “blocked” and fail fast instead of waiting 600s.

---

## Railway

### Prefer reuse over create

1. Create one project in Railway UI
2. Copy the project UUID from the dashboard URL (e.g. `https://cloud.example.com/project/<uuid>`)
3. Set `deploy.railway_project` in `project.json`
4. Provisioner: `allow_create=false` when set

### Token health

- Workspace tokens need GraphQL queries that **workspace tokens can call**
- Broken pattern: `me { projects { … } }` → 400 → name match fails → **create spam**
- Fixed pattern: top-level `projects { edges … }` (or equivalent) + bound UUID

Preflight every day you care about provision:

```text
vault consumer → railway.whoami → ok:true
```

If not ok: **do not** requeue provision-enabled missions.

### Cleanup

Delete orphan same-name projects in Railway UI; keep the bound UUID only.

---

## Deploy gate vs edge auth

If the **product** is behind basic auth, the version poll gets 401 forever.

- Product sites usually public
- Control-plane (dash) may be basic-auth’d — then open only `/version`, `/version.txt`, `/health`

---

## Multi-step product work

Example goal: “Update homepage CTA, refresh the banner copy, fix pricing page text.”

Expected queue:

1. CTA + API
2. Banner UI
3. Pricing copy

Not: one mission with twelve acceptance lines and thrashing deploys.

Continue → [Operations](./operations.md)
