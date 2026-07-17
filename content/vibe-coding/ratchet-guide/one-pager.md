# Ratchet — one-pager

**Print tip:** For best results open [`one-pager-print`](./one-pager-print) and use **File → Print** (or Save as PDF). This Markdown page is the same content for editors that don’t open HTML.

---

## What it is

Self-hosted **AI build-and-verify control plane**. Human types a goal → system queues missions → AI **builder** pushes code → **deploy gate** waits for live `/version` SHA → AI **tester** grades the **live** site → repeat until a **streak** of passes. Name = contract: only moves forward.

---

## Happy path

```mermaid
flowchart LR
  H[Goal] --> C[Composer]
  C --> Q[Queue]
  Q --> B[Build]
  B --> D[Deploy gate]
  D --> T[Test]
  T -->|FAIL| B
  T -->|PASS streak| OK[Done]
```

---

## Stack (loopback)

| Piece        | Port / place            | Job                      |
| ------------ | ----------------------- | ------------------------ |
| Composer     | `:8377`                 | UI, queue, admin         |
| Lazy / Medic | `:8378`                 | Overnight ops / recovery |
| Vault        | `:8379`                 | Secrets + cloud broker   |
| Ratchet CLI  | `/srv/ratchet/harness`  | Loop orchestration       |
| Projects     | `/srv/ratchet/projects` | `project.json` shells    |
| Edge         | nginx TLS + basic auth  | Public face only         |

---

## Non‑negotiables

1. **Live is truth** — tester hits `live_url`, not local tree
2. **`/version`** — product must return deployed git SHA (no basic auth on that path for the gate)
3. **Proof of work** — harness checks git; ignore agent claims
4. **Streak** — usually 2 consecutive PASSes
5. **No secrets in builder env** — Vault consumer only
6. **`KillMode=process`** on Composer so restarts don’t kill builds
7. **Team git author** — bot authors may be blocked by Vercel etc.
8. **Multi-step goals** → about **4–8** queue items for real product work; bind cloud project UUIDs
9. **Vault arm persists** across consumer restart (still unlock after full DEK loss / reboot)

---

## Loop exits

| Code | Meaning               |
| ---- | --------------------- |
| 0    | Success (streak)      |
| 2    | Max iterations        |
| 3    | Deploy timeout        |
| 4    | Tester contract       |
| 5    | Builder proof-of-work |
| 6    | Budget                |

---

## Mental model

**Composer** = factory office · **Ratchet** = factory floor · **Vault** = key cabinet · **Lazy/Medic/Sentinel** = night watch · **Sidecar** = Grok Build CLI (2 min until clean, 10 min until done) · **Product `/version`** = time clock.

---

## Rebuild in one breath

Host + Claude/Grok CLIs → trees `/srv/ratchet/control` `/srv/ratchet/harness` `/srv/ratchet/projects` → systemd (KillMode=process) → nginx → Vault arm → mock loop → product with `/version` → tiny real mission → harden (Sentinel, Lazy, docs).

---

## Share / go deeper

| Need          | Open                             |
| ------------- | -------------------------------- |
| Full guide    | [README.md](./README.md)         |
| All diagrams  | [diagrams.md](./diagrams.md)     |
| Agent prompts | [ai-prompts.md](./ai-prompts.md) |
| Footguns      | [footguns.md](./footguns.md)     |
| Guide history | [CHANGELOG.md](./CHANGELOG.md)   |

_No secrets in this pack. Guide pack **v1.2** · ~2026 production reference layout._
