# Architecture

← [Overview](./overview.md) · [Index](./README.md) · Next: [Principles](./principles.md)

---

## System map

```mermaid
flowchart TB
  subgraph edge [Public edge · proxy + basic auth]
    DASH[dash.*]
    FILES[files.*]
    BOT[bot.*]
  end

  subgraph loopback [Loopback only]
    C[Composer :8377]
    L[Lazy/Medic :8378]
    V[Vault :8379]
    H[Ratchet harness<br/>runs · queue · missions]
  end

  subgraph outside [Outside]
    GH[GitHub product repo]
    LIVE[Live app · host of your choice]
  end

  DASH --> C
  FILES --> L
  BOT --> V
  C -->|spawn workers| H
  L -->|observe / salvage| C
  V -->|consumer broker| H
  H -->|commit + push| GH
  GH -->|host deploy| LIVE
  H -->|poll GET /version| LIVE
```

ASCII fallback:

```
edge (dash / files / bot)
   → Composer :8377 · Lazy :8378 · Vault :8379
        → Ratchet harness → GitHub → Live (/version)
```

Gallery: [diagrams.md](./diagrams.md)

---

## Trust boundaries

| Zone                       | Who                     | Trust rules                                                          |
| -------------------------- | ----------------------- | -------------------------------------------------------------------- |
| **Browser (human)**        | Human                   | Basic auth at edge; treat as privileged                              |
| **Loopback control plane** | Composer / Lazy / Vault | Bind `127.0.0.1` only; edge is the only public face                  |
| **Builder workspace**      | Coding agent CLI        | Can edit product repo; **no** vault secrets in env                   |
| **Tester workspace**       | Tester CLI              | Prefer read-only; only **live_url**, not local builder tree as truth |
| **Vault consumer**         | Harness                 | Short-lived arm + key file; never log secret values                  |
| **Product live**           | Public users            | Must expose `/version` without control-plane basic auth              |

**Edge detail (Composer admin):** some write APIs treat “loopback peer” as trusted. If you put Composer behind a reverse proxy, do not make remote clients look local _if_ your code keys off peer address — or redesign auth properly.

---

## End-to-end data flow

```mermaid
flowchart LR
  subgraph intent [1 Intent]
    UI[Build / Composer]
    QB[Queue builder]
  end
  subgraph mat [2 Materialize]
    MY[Mission YAML]
    RD[runs/name-ts]
  end
  subgraph loop [3 Iterate]
    BL[Build]
    DG[Deploy gate]
    TE[Test]
  end
  subgraph done [4 Finish]
    EX[Exit + report]
    OPS[Sentinel / Lazy]
  end
  UI --> QB --> MY --> RD --> BL --> DG --> TE
  TE -->|FAIL| BL
  TE -->|PASS streak| EX
  EX --> OPS
```

### 1. Intent capture

1. Human opens Build (`/`) or Composer (`/composer`).
2. Types a goal (optional image attachments on Build).
3. **Queue builder** turns prose into one or more queue items scoped to a **project folder**.

### 2. Mission materialization

1. Queue item → mission YAML (name, repo, live_url, acceptance, models, limits).
2. Optional: architect / provision steps may consult Vault for infra (prefer off until core loop is solid).
3. Run directory created: `runs/<name>-<timestamp>/`.

### 3. Loop iteration

1. **Build** — agent works in `builder/` checkout; commits; pushes `deploy.branch`.
2. **Deploy gate** — poll `live_url` + `version_endpoint` until SHA matches (or fixed-delay / command strategy).
3. **Test** — agent exercises live site; writes `shared/verdict.json`.
4. **PASS** → streak++; **FAIL** → streak=0, next build prompt = tester’s `builder_prompt`.

### 4. Completion

1. Exit code + `shared/report.md` + cost JSON.
2. Queue item marked succeeded / failed / hard-fail.
3. Sentinel / Lazy may surface stuck state or alerts — **without** implementing product features themselves.

---

## Process model (roles)

| Role                        | Typical role in the design                    | Notes                                             |
| --------------------------- | --------------------------------------------- | ------------------------------------------------- |
| Composer server             | Human UI + queue API                          | Restarts must leave detached workers alive        |
| Detached harness worker     | Child of the launch path                      | Must outlive control-plane restarts               |
| Sentinel                    | Optional supervisor                           | Can be armed/disarmed                             |
| Lazy / Medic                | Overnight observe / recovery surfaces         | CORS to dash origin for header toggle             |
| Vault                       | Credentials + consumer broker                 | Encrypted data dir                                |

---

## Adapter matrix

The harness roles are pluggable:

```yaml
adapters: mock # all simulated
# or
adapters:
  builder: real
  tester: real
  deploy: real
```

| Role    | Mock                 | Real (typical)                           |
| ------- | -------------------- | ---------------------------------------- |
| builder | scripted “work”      | Coding CLI + git proof-of-work           |
| deploy  | instant / scenario   | version-endpoint / fixed-delay / command |
| tester  | scenario file line N | Tester CLI against live_url + verdict    |

Mix roles while rolling out (e.g. real builder + mock tester).

---

## Where state lives

Paths use the illustrative root `RATCHET_ROOT` — rename to match your install.

| State                     | Location                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| Queue items               | `RATCHET_ROOT/harness/composer-queue/<folder>-*.json`                 |
| Run workspaces            | `RATCHET_ROOT/harness/runs/<name>-<ts>/`                              |
| Mission templates / seeds | `RATCHET_ROOT/harness/missions/`                                      |
| Project shells            | `RATCHET_ROOT/projects/<slug>/project.json`                           |
| Sentinel state            | `RATCHET_ROOT/harness/composer-sentinel/`                             |
| Vault ciphertext          | vault-mode `data/` (0700, gitignored)                                 |
| Service env               | `RATCHET_ROOT/control/composer.env` + `secrets.env`                   |

Continue → [Principles](./principles.md)
