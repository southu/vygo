# Email and Resend (owner-managed)

> Live production email domain authentication and webhooks were **not**
> configured or claimed by this repository work. Owner supplies Resend account,
> domain DNS, API keys, and webhook secrets.

## Purpose

- Applicant confirmation emails (transactional outbox kind `applicant_confirmation`)
- Internal lead notifications (`internal_lead_notification`)
- Readiness Check: diagnostic prompt + resume link (`readiness_prompt`)
- Readiness Check: applicant snapshot copy on score completion (`readiness_snapshot`)
- Readiness Check: internal ops lead brief on score completion (`readiness_ops_brief`)
- Provider delivery events via Resend webhooks (Svix signatures)
- Worker drains `email_outbox` with retries, exponential backoff + jitter, and dead-letter

### Readiness completion side-effects

On successful `POST /v1/readiness/score`:

1. Persist the scored submission row.
2. Build a **template-first** internal lead brief (company/contact/source, product one-liner,
   build tool, blockers, deadline, five-dimension score summary + bucket + reasoning,
   parsed tech report summary, follow-up answers/budget, discrepancy flags, 3 talking points).
3. Optionally LLM-polish talking points **only** when `ANTHROPIC_API_KEY` or `LLM_API_KEY` is
   present in the environment; missing key fails closed to the pure template and **never**
   blocks scoring or email enqueue.
4. Store the brief as a durable `readiness_briefs` row linked to the submission.
5. Enqueue applicant snapshot + ops brief outbox jobs (queryable via
   `GET /v1/readiness/submission?token=` → `outbox` / `brief`, or `GET /v1/readiness/brief`).

Non-production / empty `RESEND_API_KEY`: worker uses mock transport; jobs remain
visible in `email_outbox` with status `sent` (mock) or `pending` until drained.

## Accounts and sender

1. Create a Resend account owned by the business.
2. Add and verify the sending domain (e.g. `vygo.ai`) **separately for staging**
   if you use a subdomain (e.g. `staging.vygo.ai` or `mail.staging.…`).
3. Configure the sender used by the worker/API:

   | Env var                   | Example                  | Notes                        |
   | ------------------------- | ------------------------ | ---------------------------- |
   | `EMAIL_FROM`              | `Vygo <hello@vygo.ai>`   | Must use a verified domain   |
   | `LEAD_NOTIFICATION_EMAIL` | `hello@vygo.ai`          | Internal inbox for new leads |
   | `RESEND_API_KEY`          | `re_…` (owner-generated) | Server-only; API + worker    |

4. Never commit real API keys. Use Railway/Vercel secret stores (or equivalent).

## Domain authentication and DNS

In the Resend dashboard, add the domain and publish the **exact** DNS records
Resend shows (values are owner-specific; placeholders below illustrate types only):

| Type  | Host (example)                | Purpose                                       |
| ----- | ----------------------------- | --------------------------------------------- |
| TXT   | `@` or Resend host            | Domain verification / SPF as Resend instructs |
| MX    | Resend host                   | Optional inbound / bounce handling if shown   |
| CNAME | `resend._domainkey` (example) | DKIM signing                                  |
| TXT   | `_dmarc`                      | DMARC policy (owner legal/ops decision)       |

Steps:

1. Copy each record from Resend’s domain setup UI into the DNS provider for that domain.
2. Wait for DNS propagation; click **Verify** in Resend until status is verified.
3. Send a test message from the Resend UI or via a staging waitlist submission.
4. Confirm messages are not bulk-foldered; adjust SPF/DKIM/DMARC only with DNS/email expertise.

**Unresolved owner decisions:** production From-address identity, DMARC policy
strictness, and whether marketing mail shares the same domain — see
[credentials-and-decisions.md](./credentials-and-decisions.md). Do not invent them here.

## Webhook endpoint and signing secret

### Endpoint

```text
POST https://<api-host>/v1/webhooks/resend
```

- Staging: staging API host
- Production: production API host
- Implemented in `apps/api` (`POST /v1/webhooks/resend`)
- Requires Svix-style headers: `svix-id`, `svix-timestamp`, `svix-signature`
- Secret format: `whsec_<base64>` in env `RESEND_WEBHOOK_SECRET`

### Setup steps

1. In Resend → Webhooks, create a webhook pointing at the environment’s API URL path above.
2. Subscribe to delivery-relevant events (owner chooses; typically delivery, bounce, complaint, failed, opened if needed for ops — minimize if not required for privacy).
3. Copy the **signing secret** into Railway API service env as `RESEND_WEBHOOK_SECRET` (and worker only if it verifies webhooks; API is the HTTP receiver).
4. Deploy API with the secret set **before** enabling live traffic that depends on event persistence.
5. Trigger a test event from Resend (or a signed test in staging).
6. Confirm HTTP 2xx and a row in `email_events` keyed by `provider_event_id` (idempotent).

### Signature behavior

| Condition                           | Result                            |
| ----------------------------------- | --------------------------------- |
| Missing/invalid signature           | 4xx; **no** event persistence     |
| Valid signature, new event id       | 2xx; one `email_events` row       |
| Valid signature, duplicate event    | 2xx; no second row (deduplicated) |
| Clock skew beyond tolerance (~300s) | Rejected as invalid / skew        |

Never log raw webhook bodies containing PII at info level in production without a redaction policy.

## Event handling (application)

- Events are stored idempotently by `provider_event_id`.
- Non-production inspection: `GET /v1/test-support/events?providerEventId=` when test surface is enabled.
- Worker send path stamps waitlist confirmation / internal notification timestamps when outbox jobs succeed.
- Public waitlist success responses do **not** wait for provider delivery; emails are queued transactionally with the lead write.

## Worker and outbox states

| Status        | Meaning                                               |
| ------------- | ----------------------------------------------------- |
| `pending`     | Eligible to claim when `next_attempt_at` ≤ now        |
| `processing`  | Claimed by a worker (`SKIP LOCKED`)                   |
| `failed`      | Retry scheduled (`next_attempt_at` in the future)     |
| `sent`        | Provider accept / mock send completed                 |
| `dead_letter` | Attempts exhausted (`WORKER_MAX_ATTEMPTS`, default 5) |

Stale `processing` locks are reclaimed after the stale lock window (~5 minutes).

## Failed-email recovery procedures

### 1. Detect

- API `GET /health` shows email worker not ready (heartbeat stale/missing).
- Query dead-letter / failed jobs (read-only first):

```sql
-- Counts by status
SELECT status, count(*) FROM email_outbox GROUP BY status ORDER BY status;

-- Recent failures / dead letters (no need to SELECT full payload in logs)
SELECT id, kind, recipient, status, attempt_count, last_error, next_attempt_at, updated_at
FROM email_outbox
WHERE status IN ('failed', 'dead_letter')
ORDER BY updated_at DESC
LIMIT 50;
```

- Check Resend dashboard for bounces/complaints and DNS/auth failures.
- Confirm `RESEND_API_KEY` and `EMAIL_FROM` domain verification.

### 2. Fix root cause

- Invalid API key → rotate key in Railway env; restart worker.
- Unverified domain / bad From → fix DNS and `EMAIL_FROM`.
- Worker down → restart worker service; confirm heartbeat.
- Recipient bounce → do not blindly resend; correct address or contact applicant out-of-band if appropriate.

### 3. Re-queue a dead-lettered job (safe pattern)

Only after root cause is fixed. Prefer re-queue **one** job first.

```sql
-- Inspect one job
SELECT id, kind, recipient, status, attempt_count, last_error, idempotency_key
FROM email_outbox
WHERE id = '<job-uuid>';

-- Re-queue dead letter for another attempt cycle
UPDATE email_outbox
SET
  status = 'pending',
  attempt_count = 0,
  next_attempt_at = now(),
  locked_at = NULL,
  locked_by = NULL,
  last_error = NULL,
  updated_at = now()
WHERE id = '<job-uuid>'
  AND status = 'dead_letter';
```

Notes:

- Provider **idempotency keys** are stable per entry/kind (`applicant-confirmation:{id}`, etc.). Re-sends may be de-duplicated by Resend if the provider already accepted the message — inspect provider UI before forcing.
- Do not create duplicate outbox rows for the same kind/entry unless ops intentionally wants a new idempotency key (schema enforces unique `idempotency_key`).
- Soft-failed (`status = 'failed'`) jobs will retry automatically when `next_attempt_at` elapses; usually no manual action.

### 4. Verify recovery

1. Worker logs show claim + send without error.
2. Job status becomes `sent`; `sent_at` set.
3. Applicant or internal inbox receives the message (staging: use test inboxes).
4. Optional: Resend webhook events appear for the message id.

### 5. Record evidence (ops log)

| Field           | Value                |
| --------------- | -------------------- |
| Date/time (UTC) |                      |
| Environment     | staging / production |
| Job id          |                      |
| Kind            |                      |
| Root cause      |                      |
| Action taken    |                      |
| Verification    |                      |
| Operator        |                      |

## Local development

- Leave `RESEND_API_KEY` empty to use mock transport in the worker (no live email).
- Local live harness may set `INLINE_EMAIL_WORKER=true` on the API.
- Webhook secret optional locally; production/staging must set it before relying on events.

## Related

- [API contracts — Resend webhook](./api.md)
- [Turnstile](./turnstile.md)
- [Deployment](./deployment.md)
- [Credentials inventory](./credentials-and-decisions.md)
