# Guide pack scope

← [Projects & deploy](./projects-and-deploy.md) · [Index](./README.md) · Next: [Rebuild](./rebuild.md)

This pack is **product design documentation** for an AI build-and-verify control plane. It is not a host operations runbook, not a process-manager cookbook, and not a production recovery guide.

---

## What you will find here

- How a human goal becomes missions, builds, deploy gates, and live tests
- Contracts that make the loop honest (live version signal, proof-of-work, streaks)
- Credentials boundary ideas (broker secrets; never put them in builder env)
- Greenfield rebuild outline at product-concept level and paste-ready educational prompts

## What you will not find here

- Day-to-day host operations or process-manager recipes
- Production recovery or admin playbooks for a running install
- SSH, deploy-host diagnostics, cloud provisioning steps, or vault unlock procedures
- Install-private topology, module maps, storage layouts, or environment key catalogs
- Queue-admin procedures, monitoring workflows, or babysitting runbooks

Private install notes belong outside this share pack.

---

## Product pieces (roles only)

| Piece | Product role |
| ----- | ------------ |
| **Composer** | Human UI: goals, product shells, mission queue |
| **Ratchet loop** | Build → deploy gate → live test per mission |
| **Vault** | Encrypted credentials; brokered access for harness actions |
| **Optional helpers** | Observe and report only; never implement product features |
| **Product live app** | The deployed app the tester grades; must expose an honest version signal |

Names in this pack use only illustrative placeholders. Rename freely when rebuilding.

Continue → [Rebuild](./rebuild.md)
