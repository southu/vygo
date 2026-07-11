# Incident response (scaffold)

## Severity

| Level | Examples                                | Initial response                                           |
| ----- | --------------------------------------- | ---------------------------------------------------------- |
| SEV1  | Site fully down, data exposure          | Immediate page; rollback web deploy; revoke keys if needed |
| SEV2  | Waitlist submissions failing            | Investigate API/worker; disable intake if unsafe           |
| SEV3  | Degraded performance, non-critical bugs | Business-hours fix                                         |

## Detection

- Vercel / Railway health checks and logs
- `GET /version` and `GET /api/readiness` on the web app
- API `GET /healthz` and `GET /readyz` (when deployed)

## Containment & rollback

1. Identify the last known-good git SHA via `/version` or the host dashboard.
2. Redeploy the previous production deployment on Vercel (web) or Railway (API/worker).
3. Rotate any exposed credentials; never commit replacements to git.

## Communications

- Internal: owner + on-call
- External: only if customer data or public intake is affected

## Post-incident

Record timeline, root cause, blast radius, and follow-up actions in a short write-up.
