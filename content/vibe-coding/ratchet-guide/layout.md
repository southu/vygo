# Directory layout & configuration

← [Principles](./principles.md) · [Index](./README.md) · Next: [Loop & missions](./loop-and-missions.md)

---

## Reference trees

Paths below are **illustrative** for public docs (`/srv/ratchet/...`). Use any root you like on a real host.

```text
/srv/ratchet/control/                      # control-plane source + env
  AGENTS.md                        # rules for operator AIs on the box
  docs/operator/                   # ops knowledge (INDEX, LOCAL-GROK, runbooks)
  docs/ratchet-guide/              # this shareable guide (optional install)
  composer.env                     # non-secret service configuration
  secrets.env                      # secrets only (chmod 600); EnvironmentFile
  composer-live/                   # Composer UI + server.py + sentinel package
  lazy-mode/                       # Lazy + Medic
  vault-mode/                      # Vault server + SPEC
  bin/                             # healthcheck, ops-heal, console launcher
  composer-origin.git/             # optional bare remote for self-missions / apply

/srv/ratchet/harness/                      # harness runtime
  bin/ratchet                      # CLI entrypoint
  lib/                             # loop, config, state, adapters
  lib/adapters/real.sh             # claude + deploy gate + grok
  lib/adapters/mock.sh             # zero-cost loop tests
  mission.schema.yaml              # every mission field documented
  missions/                        # YAML missions (examples + generated)
  runs/                            # per-run workspaces (large; often gitignored)
  composer-queue/                  # per-folder queue JSON
  composer-sentinel/               # sentinel durable state
  templates/                       # builder/tester prompt templates
  fixtures/                        # local fake deploy + scenarios

/srv/ratchet/projects/                     # COMPOSER_PROJECTS_ROOT
  <slug>/
    project.json                   # repo, live_url, version, railway id, …
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
| `COMPOSER_PROJECTS_ROOT`                     | `/srv/ratchet/projects`                                  |
| `COMPOSER_RATCHET_DIR` / `RATCHET_RUNS_DIR`  | Under `/srv/ratchet/harness`                             |
| `COMPOSER_SYSTEMD_UNIT`                      | `ratchet-composer` (Sentinel/Medic prefer systemctl)     |
| `COMPOSER_APP_REPO`                          | Path used for assist self-facts (not a Mac path)         |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL`       | Team identity for harness commits                        |
| `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` | Match author in production                               |
| `VAULT_URL`                                  | e.g. `http://127.0.0.1:8379`                             |
| `VAULT_CONSUMER_KEY_PATH`                    | Path to consumer key file (0600)                         |

### `secrets.env` (secret)

| Kind        | Examples (names)                                        |
| ----------- | ------------------------------------------------------- |
| Model / CLI | provider API keys if not using CLI login                |
| Lazy        | `LAZY_CONTROL_TOKEN`                                    |
| Cloud       | optional `RAILWAY_API_TOKEN` (prefer Vault for product) |

**Rules**

- `chmod 600`
- Loaded via systemd `EnvironmentFile=-/srv/ratchet/control/secrets.env`
- Never rsync into git; never paste into chat
- Stale `ANTHROPIC_API_KEY` can **break** Claude CLI login — remove if using `claude` browser login

---

## `project.json` schema (practical)

```json
{
  "slug": "acme",
  "name": "Acme",
  "vision": "Short product description for humans and assist.",
  "repo": {
    "url": "https://github.com/you/acme.git",
    "default_branch": "main",
    "local_path": "/srv/ratchet/projects/acme"
  },
  "deploy": {
    "live_url": "https://www.example.com",
    "version_url": "https://www.example.com/version",
    "provider": "railway",
    "railway_project": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "railway_env": ""
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
| `deploy.railway_project` | **Bind UUID** to stop create-spam |
| `defaults.lazy_babysit`  | Opt product into overnight watch  |

---

## Run workspace layout

```text
runs/<name>-<timestamp>/
  builder/          # agent checkout + work
  tester/           # tester scratch (sandboxed)
  shared/
    state.json      # phase, pid, streak, cost, exit_reason
    verdict.json    # last tester output (contract)
    cost.json       # USD totals per iteration
    TESTLOG.md      # durable bug list
    report.md       # end-of-run summary
    history/        # archived prompts / outputs
  loop.out          # orchestrator log
```

Useful ops commands:

```bash
# latest runs
ls -lt /srv/ratchet/harness/runs | head

# active-looking state
python3 -c "import json,glob,os
for p in sorted(glob.glob('/srv/ratchet/harness/runs/*/shared/state.json'), key=os.path.getmtime)[-5:]:
  s=json.load(open(p)); print(s.get('phase'), s.get('exit_reason'), s.get('mission'), p)"
```

---

## Queue files

Path pattern: `/srv/ratchet/harness/composer-queue/<folder>-<id>.json`

Items typically carry: `id`, `status` / `phase`, goal text, links to run dir, timestamps.

Statuses you will see in the wild: `queued`, `running`, `succeeded`, `failed`, `hard-fail`, `discarded`, `aborted`.

Continue → [Loop & missions](./loop-and-missions.md)
