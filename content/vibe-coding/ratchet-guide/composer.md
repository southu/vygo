# Composer (control plane UI)

← [Loop & missions](./loop-and-missions.md) · [Index](./README.md) · Next: [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md)

---

## Role

Composer is the human-facing factory:

- Capture goals
- Draft / split missions
- Manage projects and queues
- Show run status
- Host settings and links to Vault

Implementation: Python `server.py` + static HTML/JS under `composer-live/`.

---

## Primary surfaces

| Path | Purpose |
| ---- | ------- |
| `/` | **Build** home — natural language goal → multi-step queue draft |
| `/composer` | Classic mission form + enqueue |
| `/projects` | Create / manage shells under `COMPOSER_PROJECTS_ROOT` |
| `/queue` | Per-folder queue |
| `/dashboard` | Runs overview |
| `/admin` | Models, settings |
| `/api/*` | Queue, assist, runs, settings, … |

---

## Goal → queue → run

1. **Build** (`home.html` / `home.js` + `queue_builder_mod.py`)
   - Human describes work; optional images
   - Writer/planner produces a **multi-step draft** (target about **4–8** executable steps for real product goals)
2. **Enqueue** into folder-scoped queue JSON under `RATCHET_ROOT/harness/composer-queue/`
3. **Worker** materializes mission YAML and invokes `bin/ratchet`
4. UI polls state; costs land in `shared/cost.json`

### Queue builder rules

- Multi-part goals **must** expand to several steps — not one mega-mission
- Prefer **~4–8** steps: small enough to verify live, large enough to make progress
- Thin drafts (single vague step) may be **resplit** by the planner path before enqueue
- Planner must return real multi-step JSON; pure affirmations / non-JSON → force draft / retry, never silent junk prose as a “mission”
- Folder must match product (`acme`), not accidentally `composer`
- Repo/live_url must come from **project.json**, not control-plane APP_FACTS
- Tests live alongside code (e.g. `tests/test_queue_builder_split.py`)

### Queue clear

Bulk clear on Build / Queue supports variants such as **All (keep running)**:

- Stops or drops queued/active work according to the chosen filter
- **Keeps the on-screen draft steps** so you can re-load or re-enqueue without re-planning

Other clear modes may wipe more aggressively — read the button label before confirming.

---

## Models & settings

- Registry: `models.json` (builder / tester / assist / writer roles)
- Defaults: Admin form → `POST /api/settings` → `load_settings()` single store
- Assist can route to registered model ids
- CLI adapters must use flags the binary actually supports
- Invalid or unknown model names should surface **real CLI errors**, not synthetic success prose

Claude-style CLIs often use **CLI login** rather than a long-lived API key in secret env.

---

## Unified header nav

Every page should show the **same** primary links so humans never get lost:

```text
Build · Projects · Composer · Queue · Dashboard · Admin · Vault
```

Implementation pattern:

- HTML fallback `<nav class="site-nav">` on each page
- Shared `site-nav.js` rewrites links for current host
- Collapse under hamburger below ~1100px so links never clip

---

## Assist (draft help)

`POST /api/assist` turns plain language into a draft mission payload (name, mission text, acceptance). Used from Compose UI and as a building block for enqueue.

Self-facts for “edit Composer itself” come from env (`PUBLIC_BASE_URL`, `COMPOSER_APP_REPO`) — **not** machine-specific laptop paths.

---

## Self-hosting Composer as a product

Composer can be improved _by_ Ratchet:

- Needs a **cloneable** git remote for the control-plane tree
- Live version endpoint must be reachable by the deploy gate

---

## Key source files (orientation)

| File | Role |
| ---- | ---- |
| `server.py` | HTTP API + static serving |
| `queue_builder_mod.py` | Goal → multi-step queue |
| `projects_mod.py` | Project shells + git identity for commits |
| `home.html` / `home.js` | Build UX |
| `models.json` | Model registry |
| `styles.css` / `site-nav.js` / `mobile-nav.js` | Shell UI |

Continue → [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md)
