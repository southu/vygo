# Projects & product deploys

← [Vault](./vault.md) · [Index](./README.md) · Next: [Operations](./operations.md)

---

## Product shells

Each product is a **shell**: a named binding of git remote, live URL, and version signal. Composer’s product UI creates and edits these shells.

### Folder vs product (design)

| Shell kind | Typical use |
| ---------- | ----------- |
| Product app | The shipped app the tester grades |
| Control plane | Optional self-improvement of the factory itself |
| Sandbox / fixtures | Experiments and local fake deploys |

**Never** enqueue product acceptance against the control-plane repo while pointing the live URL at a different product domain. That mismatch is a classic deploy-gate poison pill.

---

## Product requirements for a version-based gate

1. A git remote the builder can push to
2. Hosted deploy on push to the deploy branch (any host that deploys from git)
3. A **version signal** that returns the **currently deployed** commit
4. That signal is reachable by the deploy gate without control-plane login
5. Optional: bind a cloud project identity on the shell when using a cloud host (prefer reuse over create)

### Implementing a version signal (any stack)

At product level:

- Write the deploy SHA at build or image-bake time into whatever the public route returns
- Acceptance: HTTP success, body matches the commit that is actually live, updates when a new deploy finishes

Stack-specific recipes stay out of this pack.

---

## Git identity (product rule)

Harness commits need an author identity the host accepts. Unknown bot authors may be ignored by some platforms.

Symptom pattern: push appears to succeed; live version never moves; deploy gate times out. The design fix is team identity (or host allowlisting) — not “retry harder.”

---

## Cloud hosts (concept)

### Prefer reuse over create

1. Create one project in your cloud host’s UI when you mean to
2. Bind that project identity on the product shell
3. When bound, optional ensure should not create new projects

### Token health (design rule)

Broken list queries can look like “no match” and tempt create-spam. Prefer bound identities and fail-closed identity checks before any ensure step.

Optional provision is powerful; leave it off unless you intentionally need stack bootstrap.

---

## Multi-step product work

Example goal: “Update homepage CTA, refresh the banner copy, fix pricing page text.”

Expected queue shape:

1. CTA
2. Banner UI
3. Pricing copy

Not: one mission with a dozen acceptance lines and thrashing deploys.

Continue → [Operations](./operations.md)
