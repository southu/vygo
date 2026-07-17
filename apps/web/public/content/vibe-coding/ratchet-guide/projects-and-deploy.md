# Projects & product deploys

← [Vault](./vault.md) · [Index](./README.md) · Next: [Operations](./operations.md)

---

## Project shells

Each product is a folder under `COMPOSER_PROJECTS_ROOT` (default `RATCHET_ROOT/projects/<slug>`) with a `project.json` (see [layout.md](./layout.md)).

Composer **Projects** UI creates/edits these shells and can clone repos into the projects tree.

### Folder vs product

| Folder               | Typical use                    |
| -------------------- | ------------------------------ |
| `acme` (example)     | Example product app            |
| `composer`           | Control-plane self-improvement |
| `sandbox` / fixtures | Experiments                    |

**Never** enqueue product acceptance against Composer’s repo while pointing `live_url` at the product domain. That mismatch is a classic deploy-timeout poison pill.

---

## Product requirements for version-endpoint strategy

1. A git remote the builder can push to with harness credentials
2. Hosted deploy on push to `main` (any host that deploys from git)
3. **`GET /version`** (or configured path) returns the **currently deployed** SHA
4. Version path is **public** to the gate (no control-plane basic auth)
5. Optional but recommended: bind cloud project UUID in `project.json` when using a cloud host

### Implementing `/version` (any stack)

Minimal static/export idea:

```text
// write at build time from your host's commit SHA env
// or git rev-parse HEAD in CI → public/version.txt
```

Docker/image deploys: embed a build-arg SHA into a tiny route.

Acceptance for the endpoint itself:

- 200 response
- Body matches what `git rev-parse HEAD` was at the deploy that is live
- Updates when a new deploy finishes

---

## Git identity

Set globally on the build host **and** in non-secret service config:

```bash
git config --global user.name "YourTeamBotOrHuman"
git config --global user.email "you@example.com"
```

Also set `GIT_AUTHOR_*` / `GIT_COMMITTER_*` for non-interactive commits from helpers.

Some host platforms block commits from unknown bot authors. Symptom pattern: push to GitHub succeeds; live `/version` never moves; deploy gate times out. Fix is product/process design: use a team author allowlisted on the host.

---

## Cloud hosts (concept)

### Prefer reuse over create

1. Create one project in your cloud host UI
2. Copy the project UUID from the dashboard
3. Set it on `project.json` under deploy
4. When bound, provision should not create new projects

### Token health (design rule)

Workspace tokens need API queries that workspace tokens can call. Broken list queries look like “no match” and can spam create. Prefer bound UUIDs and fail-closed identity checks before any ensure step.

Optional provision is powerful; leave it off unless you intentionally need stack bootstrap.

---

## Deploy gate vs edge auth

If the **product** is behind basic auth, the version poll gets 401 forever.

- Product sites are usually public
- Control-plane (dash) may be basic-auth’d — then open only product `/version`, `/version.txt`, `/health` for the gate

---

## Multi-step product work

Example goal: “Update homepage CTA, refresh the banner copy, fix pricing page text.”

Expected queue:

1. CTA + API
2. Banner UI
3. Pricing copy

Not: one mission with twelve acceptance lines and thrashing deploys.

Continue → [Operations](./operations.md)
