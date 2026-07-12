# Incident response

Operational scaffold for owner-managed hosting. This is **not** a contractual
SLA and does not invent customer notification SLAs — those are owner/legal
decisions ([credentials-and-decisions.md](./credentials-and-decisions.md)).

## Severity

| Level | Examples                                                                         | Initial response                                              |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| SEV1  | Site fully down; confirmed data exposure; auth key leak in public git            | Immediate owner page; contain; consider rollback + key revoke |
| SEV2  | Waitlist submissions failing; email worker down; webhook failing; partial outage | Investigate within hours; disable intake if unsafe            |
| SEV3  | Degraded performance; non-critical copy bugs; single-region blip                 | Business-hours fix                                            |
| SEV4  | Cosmetic issues; docs typos                                                      | Backlog                                                       |

Owner may refine severity definitions; do not publish customer-facing “99.x%”
uptime promises without approval.

## Roles (owner fills names)

| Role                | Responsibility                       | Filled by owner |
| ------------------- | ------------------------------------ | --------------- |
| Incident lead       | Coordinates response                 |                 |
| Technical lead      | Mitigates / rolls back               |                 |
| Comms               | Internal (+ external if required)    |                 |
| Counsel (as needed) | Legal/privacy notification decisions |                 |

## Detection

| Signal                           | How                                                          |
| -------------------------------- | ------------------------------------------------------------ |
| Web down / bad deploy            | Vercel dashboard; `GET https://<web>/` and `/version`        |
| Readiness regression             | `GET https://<web>/api/readiness`                            |
| API process dead                 | Railway metrics; `GET https://<api>/healthz`                 |
| API not ready (DB/migrations)    | `GET https://<api>/readyz`                                   |
| Composite failure (DB or worker) | `GET https://<api>/health`                                   |
| Intake failures                  | Error rate on `POST /v1/waitlist`; Turnstile/config mistakes |
| Email backlog                    | `email_outbox` statuses; Resend dashboard; worker logs       |
| Webhook failures                 | Resend webhook delivery logs; API 4xx on signature mismatch  |
| Abuse / spike                    | Rate-limit metrics; Redis; anomalous lead volume             |
| Secret exposure                  | GitHub secret scanning; `pnpm secret-scan`; accidental paste |

Recommended: configure Railway/Vercel alerts to the owner’s on-call channel (owner supplies channel — not configured in-repo).

## Containment

1. **Declare** severity and incident lead; open a short timeline doc (clock in UTC).
2. **Preserve evidence**: relevant logs, deploy SHAs (`/version`, Railway deploy id), do not wipe databases before snapshot if data loss is suspected.
3. **Stop the bleeding**:
   - Bad web deploy → rollback Vercel to previous production deployment.
   - Bad API/worker → rollback Railway deploy or pin previous image/commit.
   - Unsafe intake → set availability to `paused` and/or scale API to zero / block route at edge if available.
   - Leaked credential → revoke/rotate immediately (Resend, Turnstile, DB, Redis, git tokens); never commit replacements.
4. **Scope**: staging vs production; whether PII may have left the system.

## Rollback

### Web (Vercel)

1. Read current SHA: `curl -sS https://<web>/version`
2. In Vercel → Deployments → promote/rollback to last known-good production deployment.
3. Re-check `/`, `/version`, `/api/readiness`.

### API / worker (Railway)

1. Identify last known-good deploy for **each** service (API and worker may differ).
2. Redeploy previous successful deployment.
3. Confirm `/healthz`, `/readyz`, `/health`.
4. If a bad migration shipped: restore from backup only with explicit owner approval ([backups.md](./backups.md)); prefer forward-fix migrations when possible.

### Data

- Prefer application-level fixes over restore.
- Production restore: incident-only procedure in [backups.md](./backups.md).

## Communications

| Audience                            | When                                                                | Guidance                                        |
| ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| Internal (owner/on-call)            | All SEV1–SEV2                                                       | Immediate status + next update time             |
| Applicants / public                 | Only if intake data exposure or prolonged public outage warrants it | Owner + counsel approve wording; no speculation |
| Providers (Resend, Railway, Vercel) | When vendor outage suspected                                        | Open support ticket with request ids            |

Do not invent regulatory notification timelines here — counsel decides.

## Recovery

1. Confirm root cause hypothesis with evidence.
2. Apply fix on **staging** first when possible; run verification commands.
3. Deploy to production; watch health endpoints and error logs for a soak period (owner chooses duration).
4. Re-enable intake if paused; send a staging test waitlist submission if email path was involved.
5. Re-queue dead-letter email jobs only after provider/config health is confirmed ([email-and-resend.md](./email-and-resend.md)).
6. Validate backups still succeeding.

## Post-incident

Within a few business days of SEV1/SEV2 resolution, record:

| Section              | Content                                  |
| -------------------- | ---------------------------------------- |
| Summary              | One paragraph                            |
| Timeline (UTC)       | Detect → contain → resolve               |
| Severity             | Final classification                     |
| Impact               | Users, data, duration                    |
| Root cause           | Technical + contributing process factors |
| What went well       |                                          |
| What went poorly     |                                          |
| Action items         | Owner, due date, tracking link           |
| Credential rotations | Which secrets rotated                    |

Store write-ups in the owner’s private ops space (not necessarily this public repo). If a postmortem is committed, strip secrets and PII.

## Quick reference commands

```bash
# Web
curl -sS -o /dev/null -w "%{http_code}\n" "https://<web>/"
curl -sS "https://<web>/version"
curl -sS "https://<web>/api/readiness"

# API
curl -sS "https://<api>/healthz"
curl -sS "https://<api>/readyz"
curl -sS "https://<api>/health"
curl -sS "https://<api>/v1/public/availability"

# Pause intake (production requires confirmation)
DATABASE_URL=… NODE_ENV=production pnpm availability:set --status paused \
  --updated-by incident-lead --confirm-production
```

## Related

- [Deployment](./deployment.md)
- [Backups](./backups.md)
- [Email & Resend](./email-and-resend.md)
- [Owner launch checklist](./owner-launch-checklist.md)
