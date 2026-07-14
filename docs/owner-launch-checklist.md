# Owner launch checklist (exact order)

Use this list when promoting Vygo from repository readiness to **owner-managed**
hosted staging and then production.

**This repository work did not configure or claim live Vercel or Railway
production deployment.** Check each box only when the owner (or delegated ops)
has completed the step with real accounts and evidence.

Legend: `[ ]` pending · complete in your private ops tracker (do not need to
commit checked boxes with secrets).

---

## Phase 0 — Preconditions

1. `[ ]` Confirm git default branch `main` is the intended deploy source and CI is green on the launch commit.
2. `[ ]` Confirm `pnpm-lock.yaml` and `.github/workflows/ci.yml` are present on `main`.
3. `[ ]` Read [credentials-and-decisions.md](./credentials-and-decisions.md); list owner decision blockers (legal, pricing, claims).
4. `[ ]` Assign incident lead and backup contact ([incident-response.md](./incident-response.md)).
5. `[ ]` Confirm privacy/terms legal review status (draft vs counsel-approved) before presenting as final.

---

## Phase 1 — Accounts

6. `[ ]` GitHub access for deploy integrations (Vercel, Railway) scoped to least privilege.
7. `[ ]` Vercel team/account created (owner-controlled billing).
8. `[ ]` Railway team/account created (owner-controlled billing).
9. `[ ]` Resend account created (owner-controlled).
10. `[ ]` Cloudflare account + Turnstile enabled.
11. `[ ]` DNS provider access for the production (and staging) domain(s).
12. `[ ]` Secure secret storage chosen (1Password/Vault/etc.) — not git.

---

## Phase 2 — DNS (staging then production)

13. `[ ]` Choose staging hostnames (web + API) — record in private inventory.
14. `[ ]` Choose production hostnames (web + API) — record in private inventory.
15. `[ ]` Add Resend domain DNS records for staging sender domain; verify in Resend.
16. `[ ]` Add Resend domain DNS records for production sender domain; verify in Resend.
17. `[ ]` Plan DMARC/SPF/DKIM as Resend instructs (owner email policy decision).
18. `[ ]` Do **not** point production apex at unverified staging experiments without intent.

---

## Phase 3 — Credentials and environment values

Generate and store **separately** for staging and production:

19. `[ ]` Postgres credentials (from Railway plugins).
20. `[ ]` Redis URL.
21. `[ ]` `IP_HASH_SALT` (+ version); plan rotation values.
22. `[ ]` Resend API key(s).
23. `[ ]` Resend webhook signing secret(s) (`whsec_…`).
24. `[ ]` Turnstile site + secret for **staging**.
25. `[ ]` Turnstile site + secret for **production** (distinct from staging).
26. `[ ]` `EMAIL_FROM` and `LEAD_NOTIFICATION_EMAIL` per environment.
27. `[ ]` `CORS_ORIGINS` listing exact web origins per environment.
28. `[ ]` Confirm production `ENABLE_TEST_SURFACE=false` and no test Turnstile secrets.

---

## Phase 4 — Staging services

29. `[ ]` Create Railway **staging** project: PostgreSQL service.
30. `[ ]` Create Railway staging Redis service.
31. `[ ]` Create Railway staging **API** service; set env; deploy.
32. `[ ]` Create Railway staging **worker** service; set env; deploy (`INLINE_EMAIL_WORKER` unset).
33. `[ ]` Run migrations: `DATABASE_URL=<staging> pnpm db:migrate`.
34. `[ ]` Optional: `pnpm seed:local` only if appropriate for staging data policy.
35. `[ ]` Create Vercel **staging** project/environment; set web env; deploy.
36. `[ ]` Attach staging domains (web + API) and wait for TLS.
37. `[ ]` Configure Resend webhook → `https://<staging-api>/v1/webhooks/resend`.
38. `[ ]` Set availability on staging via `pnpm availability:set` (dry-run then apply).

---

## Phase 5 — Staging verification

39. `[ ]` `GET <staging-web>/` → 200.
40. `[ ]` `GET <staging-web>/version` → expected SHA.
41. `[ ]` `GET <staging-web>/api/readiness` → ready structure.
42. `[ ]` `GET <staging-api>/healthz`, `/readyz`, `/health` → 200 / ready.
43. `[ ]` `GET <staging-api>/v1/public/availability` → expected payload.
44. `[ ]` Submit waitlist with real staging Turnstile; confirm outbox + email (or mock policy).
45. `[ ]` Deliver Resend test webhook; confirm 2xx and idempotent `email_events`.
46. `[ ]` Exercise failed-email recovery once on staging ([email-and-resend.md](./email-and-resend.md)).
47. `[ ]` Practice waitlist export + soft-delete on staging sample data ([content-operations.md](./content-operations.md)).
48. `[ ]` Take staging DB backup and run restore-test evidence once ([backups.md](./backups.md)).

---

## Phase 6 — Production services

49. `[ ]` Create Railway **production** project: PostgreSQL (separate from staging).
50. `[ ]` Create production Redis.
51. `[ ]` Create production API + worker with production env only.
52. `[ ]` Run production migrations: `DATABASE_URL=<production> pnpm db:migrate`.
53. `[ ]` Create Vercel production project/environment; production web env; deploy.
54. `[ ]` Attach production domains; confirm TLS and redirects (www/apex owner choice).
55. `[ ]` Production Resend webhook → production API path.
56. `[ ]` Production Turnstile hostnames match production web only.
57. `[ ]` Set production availability with `--confirm-production` only after content approval.
58. `[ ]` Enable automated Postgres backups + retention ([backups.md](./backups.md)).

---

## Phase 7 — Production verification

59. `[ ]` Web `/`, `/version`, `/api/readiness` on production hosts.
60. `[ ]` API `/healthz`, `/readyz`, `/health`, `/v1/public/availability`.
61. `[ ]` Controlled waitlist test (owner email) with production Turnstile.
62. `[ ]` Confirm worker heartbeat and email delivery.
63. `[ ]` Confirm test-support routes are **not** exposed in production-strict mode.
64. `[ ]` Confirm no secrets in git (`pnpm secret-scan` / GitHub scanning).
65. `[ ]` Production backup exists; restore-test evidence recorded (at least one successful test before public launch).

---

## Phase 8 — Monitoring and ops readiness

66. `[ ]` Vercel + Railway alerts routed to owner on-call channel.
67. `[ ]` Bookmark incident runbook and severity table.
68. `[ ]` Confirm backup schedule + next restore-test calendar date.
69. `[ ]` Confirm content ops know how to update availability and publish insights.
70. `[ ]` Confirm failed-email and waitlist export/deletion procedures are accessible to authorized ops only.

---

## Phase 9 — Launch approval (owner)

71. `[ ]` **Owner decision:** real availability status and any public dates/notes are accurate.
72. `[ ]` **Owner decision:** public pricing display flags and numbers are approved (or disabled).
73. `[ ]` **Owner decision:** timelines / capacity language is accurate.
74. `[ ]` **Owner decision:** U.S.-based claim enabled only if operationally true.
75. `[ ]` **Owner decision:** senior-only claim enabled only if operationally true.
76. `[ ]` **Owner decision:** no customer-facing SLA language unless counsel-approved.
77. `[ ]` **Owner decision:** equity deals are handled case-by-case offline and are not marketed or offered in-product.
78. `[ ]` **Owner decision:** privacy & terms pages approved for public presentation (or remain clearly draft).
79. `[ ]` Legal review acknowledged for remaining open items.
80. `[ ]` **Launch approval:** named owner signs off date/time (UTC) in private ops log to open production marketing/intake.

---

## Explicit non-claims

- Completing engineering checklist items does **not** by itself mean production was configured by the repository authors.
- Hosting remains **owner-managed** until the owner completes Phases 1–9.
- Unresolved legal and commercial decisions stay flagged in [credentials-and-decisions.md](./credentials-and-decisions.md).
