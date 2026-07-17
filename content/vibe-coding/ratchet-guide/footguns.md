# Footguns (production lessons)

← [AI prompts](./ai-prompts.md) · [Index](./README.md) · Next: [Examples](./examples.md)

Symptom → likely cause → fix direction. Re-verify live; dates refer to when we learned them (~2026-07).

---

## Deploy & host

| Symptom                                | Likely cause                               | Fix direction                                                    |
| -------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Deploy-timeout forever                 | Live `/version` not updating               | Check host deploy; not the tester                                |
| Vercel “Deployment was blocked”        | Commit author not allowlisted              | Team git identity; empty commit as allowed author; allowlist bot |
| Version poll 401 forever               | Auth on product version path               | Leave `/version` (and optional `/health`) public for the gate    |
| Gate waits full 600s on blocked deploy | No short-circuit                           | Check host deployment statuses after first mismatch              |
| GitHub ahead of live                   | Host pipeline stuck                        | Host dashboard — Ratchet only waits                              |

---

## Composer process model

| Symptom                      | Likely cause                                      | Fix direction                                  |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| ABORTED mid-build storms     | Process manager kills the whole tree on restart   | Detached workers must survive Composer restart |
| Builds die after Admin Apply | Same                                              | Avoid restart during builds; seatbelt above    |
| Dual ad-hoc + managed start  | Port fight / orphans                              | One process manager owns the ports             |

---

## Queue & missions

| Symptom                                     | Likely cause                              | Fix direction                                           |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| deploy-timeout on product work              | `repo=composer-live` + `live_url=product` | Drafts must use project.json repo/live                  |
| One giant mission                           | Writer collapsed multi-part goal          | Multi-step expand (~4–8); resplit thin drafts; tests    |
| Draft is synthetic junk / cheerleading      | Planner returned affirmation or non-JSON  | Force-draft / retry path; fix model CLI flags           |
| Cleared queue lost my draft                 | Used a wipe-all clear mode                | Prefer **All (keep running)** when you want drafts kept |
| Product UI shows control-plane availability | Wrong folder on Build home                | Target product folder                                   |
| `running` forever, no PID                   | Zombie after crash                        | Close or requeue carefully via Medic / queue tools      |
| Abort storm after restarts                  | See process model                         | Close aborted items; fix restart policy                 |

---

## Railway / provision

| Symptom                               | Likely cause                             | Fix direction                                                       |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Many projects named `acme`/`composer` | list_projects failed → create every time | Fix GraphQL for workspace token; bind UUID; `allow_create=false`    |
| whoami Not Authorized / http_400      | Dead or wrong token type                 | Replace **account/workspace** token in Vault; fail-fast provisioner |
| 90s hangs on ensure                   | No fail-fast                             | Abort when whoami not ok                                            |
| Provision on every mission            | Provision left enabled                   | Prefer Provision OFF unless bootstrapping                           |

---

## Vault

| Symptom                                 | Likely cause                                      | Fix direction                                                 |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Actions fail after full reboot          | Locked (DEK not loaded) and/or arm window expired | Unlock with master password; re-arm if window gone            |
| Arm “lost” after short consumer restart | Expected old in-memory-only behavior              | Arm is **persisted**; unlock if needed, check remaining hours |
| Unlock always fails                     | Wrong password or foreign ciphertext              | vault-rebuild only with explicit OK                           |
| Secrets in logs                         | Mis-wired env into builder                        | Audit adapters; never export vault secrets                    |

---

## Claude / models

| Symptom                                   | Likely cause                             | Fix direction                                           |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| 401 Invalid API key for every Claude call | Stale `ANTHROPIC_API_KEY` in secrets.env | Prefer CLI login; comment out bad key                   |
| Kimi / assist draft fails oddly           | Wrong CLI flags for prompt mode          | Match flags to CLI (no incompatible yolo+prompt combos) |
| Unknown model → fake prose mission        | Error treated as model output            | Surface real CLI stderr; fix registry id                |
| Self-missions can’t clone                 | No bare origin                           | Seed `composer-origin.git` + checkout                   |
| Model Apply fails on missing origin       | Strict origin required                   | Local apply mode or set origin                          |

---

## Lazy / Medic

| Symptom                               | Likely cause               | Fix direction                                  |
| ------------------------------------- | -------------------------- | ---------------------------------------------- |
| “OK · applied” but still broken       | Only notes/lessons         | Check queue JSON + processes                   |
| ARG_MAX / prompt too long             | Screenshots in argv        | `--prompt-file`                                |
| Medic “fixes” product bugs            | Wrong tool                 | Builder implements product; Medic recovers ops |
| Header has duplicate Lazy/Medic links | Inject + site-nav both add | Dedupe; nav owns links, slot owns toggle       |

---

## Edge

| Symptom                 | Likely cause   | Fix direction                                |
| ----------------------- | -------------- | -------------------------------------------- |
| Admin weird from remote | IP trust model | Don’t pass client IP if code trusts loopback |

---

## Hygiene do / don’t

**Do**

- Restart control-plane services through one process manager
- Keep `PUBLIC_BASE_URL` and Lazy public URL set
- CORS Lazy ↔ dash
- Unified site nav on all pages
- Record durable behavior changes in your private changelog

**Don’t**

- Mix ad-hoc start scripts with a managed unit on the same ports
- Hardcode laptop paths in shared docs
- Blind-requeue deploy-timeouts
- Print `secrets.env` into chat
- Cancel healthy long builds only because wall clock is high

Continue → [Examples](./examples.md)
