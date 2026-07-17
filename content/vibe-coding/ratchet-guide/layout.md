# Directory layout & configuration

← [Principles](./principles.md) · [Index](./README.md) · Next: [Loop & missions](./loop-and-missions.md)

---

## Reference trees

Paths below are **illustrative**. Pick any install root and substitute for `RATCHET_ROOT`.

```text
RATCHET_ROOT/control/              # control-plane source + env
  AGENTS.md                        # rules for coding agents on the box
  docs/                            # optional private notes (not this pack)
  docs/ratchet-guide/              # this shareable guide (optional install)
  composer.env                     # non-secret service configuration
  secrets.env                      # secrets only (chmod 600)
  composer-live/                   # Composer UI + server + sentinel package
  lazy-mode/                       # Lazy + Medic
  vault-mode/                      # Vault server + SPEC
  bin/                             # helpers
  composer-origin.git/             # optional bare remote for self-missions / apply

RATCHET_ROOT/harness/              # harness runtime
  bin/ratchet                      # CLI entrypoint
  lib/                             # loop, config, state, adapters
  lib/adapters/real.sh             # builder + deploy gate + tester
  lib/adapters/mock.sh             # zero-cost loop tests
  mission.schema.yaml              # every mission field documented
  missions/                        # YAML missions (examples + generated)
  runs/                            # per-run workspaces (large; often gitignored)
  composer-queue/                  # per-folder queue JSON
  composer-sentinel/               # sentinel durable state
  templates/                       # builder/tester prompt templates
  fixtures/                        # local fake deploy + scenarios

RATCHET_ROOT/projects/             # COMPOSER_PROJECTS_ROOT
  <slug>/
    project.json                   # repo, live_url, version, cloud id, …
    (optional full git clone)
```

---

## Environment files

### `composer.env` (non-secret)

Typical keys (names only — values are site-specific):

| Variable                                     | Purpose                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `PUBLIC_BASE_URL`                            | Canonical Composer URL (e.g. `https://dash.example.com`) |
| `LAZY_URL` / `LAZY_PUBLIC_URL`               | Lazy base for UI + CORS                                  |
| `COMPOSER_PROJECTS_ROOT`                     | `RATCHET_ROOT/projects`                                  |
| `COMPOSER_RATCHET_DIR` / `RATCHET_RUNS_DIR`  | Under `RATCHET_ROOT/harness`                             |
| `COMPOSER_APP_REPO`                          | Path used for assist self-facts                          |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL`       | Team identity for harness commits                        |
| `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` | Match author                                             |
| `VAULT_URL`                                  | e.g. `http://127.0.0.1:8379`                             |
| `VAULT_CONSUMER_KEY_PATH`                    | Path to consumer key file (0600)                         |

### `secrets.env` (secret)

| Kind        | Examples (names)                                        |
| ----------- | ------------------------------------------------------- |
| Model / CLI | provider API keys if not using CLI login                |
| Lazy        | `LAZY_CONTROL_TOKEN`                                    |
| Cloud       | optional cloud tokens (prefer Vault for product work)   |

**Rules**

- `chmod 600`
- Loaded by services only — never by builder/tester agent env
- Never commit into git; never paste into chat
- Stale provider API keys can break CLI login — remove if using browser/CLI login instead

---

## `project.json` schema (practical)

```json
{
  "slug": "acme",
  "name": "Acme",
  "vision": "Short product description for humans and assist.",
  "repo": {
    "url": "https://git.example.com/you/acme.git",
    "default_branch": "main",
    "local_path": "RATCHET_ROOT/projects/acme"
  },
  "deploy": {
    "live_url": "https://www.example.com",
    "version_url": "https://www.example.com/version",
    "provider": "example-host",
    "cloud_project": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "cloud_env": ""
  },
  "defaults": {
    "builder_model": null,
    "tester_model": null,
    "writer_model": null,
    "lazy_babysit": false
  },
  "tags": ["product"]
}
```

| Field                    | Why it matters                    |
| ------------------------ | --------------------------------- |
| `repo.url`               | Builder clone/push target         |
| `deploy.live_url`        | Tester + deploy gate base         |
| `deploy.version_url`     | Must return deployed SHA          |
| `deploy.cloud_project`   | **Bind UUID** to stop create-spam |
| `defaults.lazy_babysit`  | Opt product into overnight watch  |

Field names may vary by install; the product idea is **one shell = one repo + one live truth**.

---

## Run workspace layout

```text
runs/<name>-<timestamp>/
  builder/          # agent checkout + work
  tester/           # tester scratch
  shared/
    state.json      # phase, pid, streak, cost, exit_reason
    verdict.json    # last tester output (contract)
    cost.json       # USD totals per iteration
    TESTLOG.md      # durable bug list
    report.md       # end-of-run summary
    history/        # archived prompts / outputs
  loop.out          # orchestrator log
```

---

## Queue files

Path pattern: `RATCHET_ROOT/harness/composer-queue/<folder>-<id>.json`

Items typically carry: `id`, `status` / `phase`, goal text, links to run dir, timestamps.

Statuses you will see: `queued`, `running`, `succeeded`, `failed`, `hard-fail`, `discarded`, `aborted`.

Continue → [Loop & missions](./loop-and-missions.md)
