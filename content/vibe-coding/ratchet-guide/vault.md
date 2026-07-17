# Vault (credentials boundary)

← [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md) · [Index](./README.md) · Next: [Projects & deploy](./projects-and-deploy.md)

---

## Role

A credentials boundary for a Ratchet-style control plane — outside Build/Queue:

- Encrypt secrets at rest
- Give humans a place to manage access
- Let the harness request **named broker actions** without putting long-lived tokens into builder or tester environments

**Lost master password ⇒ data unrecoverable.** Any recovery process stays offline and private — not in this pack.

---

## Design idea: consumer plane

Humans hold long-lived cloud credentials inside the vault. The harness holds only a short-lived ability to request **brokered actions**. Builder and tester processes never receive the underlying tokens.

Illustrative action *families* (names are not a public API catalog):

| Family | Purpose |
| ------ | ------- |
| Identity | Confirm credentials are usable before optional infra steps |
| List / resolve projects | Prefer reuse over create; honor bound project identities |
| Configure host variables from vault | Set values without printing them into logs |

The product rule is **broker, don’t export**. Exact action names, key formats, and storage layouts are install-private.

---

## Crypto & storage (concept only)

- Strong password-based key derivation + authenticated encryption
- Ciphertext lives in a private data area (never in this share pack)
- No master passwords, consumer keys, or cloud tokens appear here

---

## Optional infra steps (product rules)

Some missions may consult the credentials boundary before build. Keep blast radius small:

1. Prefer binding a known cloud project identity on the product shell; when bound, do not create new projects.
2. Fail closed when identity checks fail — do not hang forever.
3. Treat planner output as untrusted input to an allowlist.
4. Broker responses never include secret values.

Optional ensure is powerful; leave it **off** unless you intentionally need stack bootstrap.

---

## What this pack does not include

- Master passwords, consumer keys, or cloud tokens
- Key-file paths, unlock sequences, or arm procedures
- Host-private vault administration runbooks
- Day-to-day rebuild or recovery procedures

Those stay in private install notes. This document is the portable **shape** of the credentials boundary.

Continue → [Projects & deploy](./projects-and-deploy.md)
