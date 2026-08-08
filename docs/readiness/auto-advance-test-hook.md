# Readiness auto-advance — dev/test simulation hook

The Readiness Check flow (`apps/web/src/components/readiness/ReadinessFlow.tsx`)
auto-advances once the backend confirms the readiness report is **received AND
persisted**. The confirmation is the single ingest **status poll** —
`getReadinessSubmissionStatus()` → `GET /api/readiness/status?token=…` — that
already drives the "readiness report received" indicator. There is **no second
poller/websocket/fetch**; the auto-advance listener is wired to that same poll.

## What auto-advances

While the tailored prompt / "waiting for your AI to send results…" screen
(Stage 2) is up, the poll runs every ~4s. On each tick:

- **Persisted / validated** — the status response carries the machine-readable
  `received: true` boolean (durably persisted in `readiness_ingest_submissions`,
  or an equivalent matured/linked run). The flow runs the **same parse+confirm
  the manual paste runs**, on the server-persisted report text, and lands
  directly on the **Confirm-findings step** — no manual paste. The subsequent
  "Looks right → continue" gate (name/email) stays user-driven.
- **Landed but not yet persisted** (`received` absent/false but a `received`
  status string with results) — advances only to the paste step; the user pastes
  and confirms their own report. This is the legacy/real-AI path.
- **In-flight / unpersisted** (bytes mid-upload, nothing persisted) — the poll
  reports the token as still waiting; the listener **does not advance**.

The advance therefore fires **only** on the persisted/validated confirmation,
never on an in-flight or optimistic receipt. It happens within one poll interval
(≈4s, well under 15s).

## Triggering it on the live app

The tester only has browser/HTTP access and cannot make a real external AI POST a
report back. Use the gated query param below on `/readiness`. It is **dev/test
only** and **non-production-affecting**: the override is purely in-memory, scoped
to the current tab, and a real end user never types it in normal use. The poll
still issues its real `GET /api/readiness/status` request every tick (so the
same-source wiring stays visible in the network panel); the param only
substitutes the signal the flow reacts to.

Steps:

1. Open `/readiness?new=1&e2e_readiness_sim=persisted` (the `e2e_readiness_sim`
   param is preserved across the intake steps because it stays in the URL).
2. Walk the short intake to the Stage 2 waiting screen (the same screen the poll
   watches).
3. Within one poll interval the flow auto-advances to **Confirm findings** —
   structured findings render, the "Looks right → continue" control appears — and
   **no paste was required**.

### Param values

| `e2e_readiness_sim=`                                    | Simulated signal                                               | Expected result                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `persisted` (aliases: `received`, `persisted_received`) | status ready + valid `VYGO-READINESS-REPORT` + `received=true` | Auto-advance to Confirm findings, no manual paste |
| `inflight` (aliases: `in_flight`, `unpersisted`)        | bytes received but not persisted                               | **No advance** — stays on the waiting screen      |

Anything else (or no param) → the real poll result is used unchanged.

## Acceptance mapping

- **Advances on persisted signal** — `e2e_readiness_sim=persisted`.
- **Does NOT advance on in-flight/unpersisted** — `e2e_readiness_sim=inflight`.
- **Same source, no new poller** — the auto-advance lives inside the existing
  `getReadinessSubmissionStatus` poll loop; the network panel shows only the
  repeated `GET /api/readiness/status` request.
- **Manual paste fallback** — still works for reports that require it (the paste
  step and its parse/confirm path are unchanged).
