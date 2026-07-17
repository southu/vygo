# Diagrams

← [Index](./README.md)

All major diagrams in one place (Mermaid). They render on GitHub and in many Markdown previews. The [printable one-pager HTML](./one-pager-print) carries the happy-path diagram as inline SVG so it prints with no external assets.

ASCII versions remain in [architecture.md](./architecture.md) for terminals that don’t render Mermaid.

---

## 1. Happy path (goal → done)

```mermaid
flowchart TD
  H[Human goal] --> B[Composer Build UI]
  B --> Q[Queue builder<br/>multi-step if needed]
  Q --> I[Queue item<br/>per project folder]
  I --> R[Ratchet run workspace]
  R --> BL[Build: coding agent<br/>commit + push]
  BL --> DG[Deploy gate<br/>poll live /version]
  DG -->|SHA matches| T[Test: live_url only]
  DG -->|timeout| X3[Exit 3 deploy-timeout]
  T -->|PASS| ST{Streak ≥ N?}
  T -->|FAIL| BL2[Next build uses<br/>builder_prompt]
  BL2 --> BL
  ST -->|no| BL
  ST -->|yes| OK[Exit 0 success]
```

---

## 2. Product path vs helpers

```mermaid
flowchart TB
  subgraph product [Product path]
    QB[Queue builder]
    BL[Builder]
    TS[Tester]
    LIVE[Live app · /version]
  end

  subgraph helpers [Optional helpers]
    V[Vault consumer]
    NW[Overnight observe only]
  end

  QB --> BL --> TS --> LIVE
  V -.->|broker actions · no tokens to builder| BL
  NW -.->|report stuck state| QB
```

---

## 3. Trust boundaries

```mermaid
flowchart LR
  subgraph privileged [Privileged]
    OP[Human + Composer]
    VC[Vault consumer key]
  end

  subgraph agents [Agents — no secrets]
    BU[Builder workspace]
    TE[Tester workspace]
  end

  subgraph public [Public]
    PL[Product live + /version]
  end

  OP --> BU
  OP --> TE
  VC -.->|broker actions only| OP
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

## 5. Secrets path (Vault)

```mermaid
sequenceDiagram
  participant Hum as Human
  participant V as Vault UI
  participant H as Harness
  participant B as Broker
  participant C as Cloud API
  participant A as Builder agent

  Hum->>V: store credentials + grant consumer access
  Hum->>H: consumer key path only
  H->>B: identity / resolve
  B->>C: token never leaves Vault
  C-->>B: ok / projects
  B-->>H: result without secrets
  Note over A: Builder env has NO cloud token
  H->>A: mission + repo only
```

---

## 6. Rebuild phases

```mermaid
flowchart LR
  A[A Foundations] --> B[B Config]
  B --> C[C Credentials boundary]
  C --> D[D First product]
  D --> E[E Harden + docs]
  D --> M[Mock loop first]
  M --> Real[Real tiny mission]
```

---

## Print / export tips

| Goal | Use |
| ---- | --- |
| Share on GitHub | This file + others with Mermaid fences |
| One sheet of paper | Open [`one-pager-print`](./one-pager-print) → Print |
| Terminal-only | ASCII maps in architecture / overview |
| Slide paste | Copy a single Mermaid block into Notion / Obsidian / slides |
