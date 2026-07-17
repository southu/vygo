# Diagrams

← [Index](./README.md)

All major diagrams in one place (Mermaid). They render on GitHub and in many Markdown previews. The [printable one-pager HTML](./one-pager.html) carries the happy-path diagram as inline SVG so it prints with no external assets.

ASCII versions remain in [architecture.md](./architecture.md) for terminals that don’t render Mermaid.

---

## 1. Happy path (goal → done)

```mermaid
flowchart TD
  H[Human goal] --> B[Composer Build UI]
  B --> Q[Queue builder<br/>multi-step if needed]
  Q --> I[Queue item<br/>per project folder]
  I --> R[Ratchet run workspace]
  R --> BL[Build: Claude<br/>commit + push]
  BL --> DG[Deploy gate<br/>poll live /version]
  DG -->|SHA matches| T[Test: Grok<br/>live_url only]
  DG -->|timeout / blocked| X3[Exit 3 deploy-timeout]
  T -->|PASS| ST{Streak ≥ N?}
  T -->|FAIL| BL2[Next build uses<br/>builder_prompt]
  BL2 --> BL
  ST -->|no| BL
  ST -->|yes| OK[Exit 0 success]
```

---

## 2. Control plane & edge

```mermaid
flowchart TB
  subgraph edge [Public edge nginx + basic auth]
    DASH[dash.*]
    FILES[files.*]
    BOT[bot.*]
  end

  subgraph loopback [Loopback only]
    C[Composer :8377]
    L[Lazy/Medic :8378]
    V[Vault :8379]
    H[Ratchet harness<br/>/srv/ratchet/harness]
  end

  subgraph outside [Outside]
    GH[GitHub product repo]
    LIVE[Live app<br/>Railway / Vercel / …]
  end

  DASH --> C
  FILES --> L
  BOT --> V
  C -->|spawn workers| H
  L -->|ops / salvage| C
  V -->|consumer broker| H
  H -->|push| GH
  GH -->|host deploy| LIVE
  H -->|poll GET /version| LIVE
```

---

## 3. Trust boundaries

```mermaid
flowchart LR
  subgraph privileged [Privileged]
    OP[Operator browser]
    CP[Loopback control plane]
    VC[Vault consumer key]
  end

  subgraph agents [Agents — no secrets]
    BU[Builder workspace]
    TE[Tester workspace]
  end

  subgraph public [Public]
    PL[Product live + /version]
  end

  OP -->|basic auth| CP
  CP --> BU
  CP --> TE
  VC -.->|broker actions only| CP
  BU -->|push code| PL
  TE -->|HTTP checks only| PL
```

---

## 4. Single loop iteration

```mermaid
stateDiagram-v2
  [*] --> Setup
  Setup --> Build
  Build --> ProofOfWork: push branch
  ProofOfWork --> DeployGate: git checks pass
  ProofOfWork --> BuilderFail: exit 5 after retry
  DeployGate --> Test: live SHA == HEAD
  DeployGate --> DeployTimeout: exit 3
  Test --> Pass: verdict PASS
  Test --> Fail: verdict FAIL
  Test --> TesterFail: bad verdict exit 4
  Pass --> Done: streak reached
  Pass --> Build: streak incomplete
  Fail --> Build: builder_prompt
  Done --> [*]
  BuilderFail --> [*]
  DeployTimeout --> [*]
  TesterFail --> [*]
```

---

## 5. Who does what (ops vs product)

```mermaid
flowchart TB
  subgraph product [Product path]
    QB[Queue builder]
    BL[Builder]
    TS[Tester]
  end

  subgraph ops [Ops path — no product features]
    SN[Sentinel]
    LZ[Lazy]
    MD[Medic]
    HL[Heal timer]
    SC[Sidecar · Grok Build CLI]
  end

  QB --> BL --> TS
  SN -.->|watch / quarantine| QB
  LZ -.->|restart / zombie| QB
  MD -.->|allowlisted recovery| QB
  HL -.->|KillMode / version probe| SN
  SC -.->|2 min clean · 10 min done| QB
```

---

## 5b. Operator sidecar cadence

```mermaid
stateDiagram-v2
  [*] --> Stabilize: enqueue / wake sidecar
  Stabilize --> Stabilize: poll ~2 min\nnot clean yet
  Stabilize --> Cruise: plant clean
  Cruise --> Cruise: poll ~10 min\ncampaign running
  Cruise --> Stabilize: flap / hard-fail / outage
  Cruise --> [*]: queue done · stop
```

---

## 6. Secrets path (Vault)

```mermaid
sequenceDiagram
  participant Hum as Human
  participant V as Vault UI
  participant H as Harness
  participant B as Broker
  participant R as Railway API
  participant A as Builder agent

  Hum->>V: unlock + arm + Access ON
  Hum->>H: consumer key path only
  H->>B: railway.whoami / provision
  B->>R: token never leaves Vault process
  R-->>B: ok / projects
  B-->>H: result without secrets
  Note over A: Builder env has NO Railway token
  H->>A: mission + repo only
```

---

## 7. Rebuild phases

```mermaid
flowchart LR
  A[A Host + CLIs] --> B[B Config + systemd]
  B --> C[C Vault]
  C --> D[D First product]
  D --> E[E Harden + docs]
  D --> M[Mock loop first]
  M --> Real[Real tiny mission]
```

---

## Print / export tips

| Goal               | Use                                                         |
| ------------------ | ----------------------------------------------------------- |
| Share on GitHub    | This file + others with Mermaid fences                      |
| One sheet of paper | Open [`one-pager.html`](./one-pager.html) → Print           |
| Terminal-only      | ASCII maps in architecture / overview                       |
| Slide paste        | Copy a single Mermaid block into Notion / Obsidian / slides |
