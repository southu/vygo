# Guide pack scope

← [Projects & deploy](./projects-and-deploy.md) · [Index](./README.md) · Next: [Rebuild](./rebuild.md)

This pack is **product design documentation** for an AI build-and-verify control plane. It is not a host operations runbook, not a process-manager cookbook, and not a production recovery guide.

---

## What you will find here

- How a human goal becomes missions, builds, deploy gates, and live tests
- Contracts that make the loop honest (`/version`, proof-of-work, streaks)
- Credentials boundary ideas (broker secrets; never put them in builder env)
- Greenfield rebuild outline and paste-ready coding-agent prompts

## What you will not find here

- Day-to-day host operations or process-manager recipes
- Production recovery or admin playbooks for a running install
- SSH, deploy-host diagnostics, cloud provisioning steps, or vault unlock procedures
- Install-private topology or network binding details

Private install notes belong outside this share pack.

---

## Product pieces (roles only)

| Piece | Product role |
| ----- | ------------ |
| **Composer** | Human UI: goals, project shells, mission queue |
| **Ratchet harness** | Build → deploy gate → test loop per mission |
| **Vault** | Encrypted credentials; short-lived consumer access for harness actions |
| **Lazy / Medic / Sentinel** | Optional overnight helpers — observe and report only; never implement product features |
| **Product live app** | The deployed app the tester grades; must expose honest `/version` |

Names and layouts in this pack use the placeholder root `RATCHET_ROOT`. Rename freely when rebuilding.

Continue → [Rebuild](./rebuild.md)
