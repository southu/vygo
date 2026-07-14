# Content operations

Marketing copy lives in centralized typed modules under `apps/web/src/content/`, not scattered across one-off components.

## Content modules

| File                                     | Purpose                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `site.ts`                                | Brand metadata, primary/footer navigation      |
| `ctas.ts`                                | Approved CTA vocabulary and hrefs              |
| `flags.ts`                               | Commercial feature flags                       |
| `homepage.ts`                            | Homepage section copy                          |
| `audit.ts` / `method.ts` / `security.ts` | Interior page copy                             |
| `pricing.ts`                             | Audit, build tiers, Ops plans                  |
| `faq.ts`                                 | FAQ items                                      |
| `waitlist.ts`                            | Waitlist + thank-you copy                      |
| `insights.ts`                            | Insight articles (`draft` \| `published`)      |
| `legal.ts`                               | Published Privacy Policy and Terms of Use copy |

## Principles

- Customer-facing language only — no fundraising or confidential deck content.
- No invented customers, testimonials, certifications, or capacity numbers.
- Availability / next-opening values are operational data controlled via `pnpm availability:set` once the database is live — not hard-coded marketing fiction.
- Prefer the approved CTA labels in `ctas.ts` site-wide.
- Claims about **real availability, pricing, timelines, U.S.-based staffing, senior-only delivery, and SLA language** are **owner-supplied and unverified** unless the owner records evidence. See [credentials-and-decisions.md](./credentials-and-decisions.md). Do not invent or approve them in code reviews without owner sign-off.

## Commercial feature flags

Edit `apps/web/src/content/flags.ts`:

```ts
showPublicPricing: true;
showOpsPricing: true;
showUsBasedClaim: true;
showSeniorOnlyClaim: true;
```

When a commercial capability is disabled, it must disappear from both navigation and page CTAs (no dead links).

Equity deals are not marketed or offered in-product; they are handled case-by-case offline. Flipping `showUsBasedClaim` or `showSeniorOnlyClaim` is an **owner operational decision** — only enable while true.

## Insights publishing

1. Author or revise the article in `apps/web/src/content/insights.ts`.
2. Keep `status: "draft"` until editorial review is complete.
3. Set `status: "published"` and a real `publishedAt` only after review.
4. Public Insights navigation appears only when at least one article is published.
5. The static export postbuild step removes draft slug HTML so unpublished URLs 404.
6. Deploy web (Vercel) after merge; verify the public URL and that drafts 404.

## Legal pages

`/privacy` and `/terms` render the published VYGO LLC legal pack from `apps/web/src/content/legal.ts` (effective date in `legalMeta`). Markdown mirrors live in `docs/vygo/` and `apps/web/public/docs/vygo/`. When counsel or the owner updates the pack, edit those sources together and redeploy web.

## Metadata

Page titles and descriptions are centralized in `site.ts` (`metadata` object). Update there first, then verify rendered `<title>` tags.

## Content change procedure (repeatable)

1. Edit the relevant module under `apps/web/src/content/`.
2. Run `pnpm --filter @vygo/web typecheck` and `pnpm --filter @vygo/web build` locally if the change is non-trivial.
3. Open a PR; ensure CI is green.
4. Merge to `main` and deploy web to **staging** first.
5. Visual QA on staging (navigation, CTAs, flags, legal draft markers).
6. Promote/deploy to production only after owner approval for claim-sensitive copy.
7. Record what changed if it affects pricing, availability messaging, or legal pages.

---

## Availability updates (repeatable)

Availability is a **database singleton**, not static content. Public read path:
`GET /v1/public/availability` (neutral safe fallback if missing/stale).

### Preview (no write)

```bash
export DATABASE_URL='postgresql://…'  # target environment
pnpm availability:set --status waitlist --date 2026-08-17 --type audit \
  --note "Owner-approved note only" --updated-by ops@example.com --dry-run
```

### Apply (staging)

```bash
DATABASE_URL='…staging…' pnpm availability:set --status open --date 2026-08-17 \
  --type audit --updated-by ops@example.com
```

### Apply (production)

```bash
DATABASE_URL='…production…' NODE_ENV=production pnpm availability:set \
  --status waitlist --date 2026-08-17 --type audit \
  --updated-by ops@example.com --confirm-production
```

### Verify

```bash
curl -sS "https://<api-host>/v1/public/availability"
# Confirm status / nextOpeningDate / engagementType / displayNote match intent
# Marketing UI should reflect API data when wired; otherwise waitlist fallback copy remains safe
```

### Rules

- Do not invent capacity numbers or opening dates without owner approval.
- `displayNote` is public — keep it accurate and non-confidential.
- `--updated-by` is stored for audit; not returned on the public API.
- After pausing intake (`--status paused`), confirm the waitlist page UX gates enrollment as designed.

---

## Waitlist export (repeatable)

There is no public export HTTP API (by design). Export is an **owner admin** operation against Postgres with least privilege and encryption at rest for the artifact.

### 1. Authorize

Only operators authorized to handle applicant PII. Log who exported and why.

### 2. Export (CSV example)

```bash
export DATABASE_URL='postgresql://…'  # environment being exported
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT
    id,
    email,
    full_name,
    company_name,
    role,
    product_url,
    stage,
    primary_blocker,
    desired_start,
    budget_range,
    commercial_deadline,
    status,
    priority_score,
    marketing_consent,
    privacy_accepted_at,
    created_at,
    last_submitted_at,
    deleted_at
  FROM waitlist_entries
  WHERE deleted_at IS NULL
  ORDER BY created_at ASC
) TO STDOUT WITH CSV HEADER" > "waitlist-export-$(date -u +%Y%m%dT%H%M%SZ).csv"
```

### 3. Handle the file

- Encrypt or store only in an access-controlled location.
- Do **not** commit exports to git, attach to public tickets, or paste into LLMs without policy approval.
- Delete local copies when the operational need ends.

### 4. Evidence fields

| Field            | Recorded value |
| ---------------- | -------------- |
| Date (UTC)       |                |
| Environment      |                |
| Operator         |                |
| Row count        |                |
| Purpose          |                |
| Storage location |                |
| Deletion date    |                |

---

## Waitlist deletion (repeatable)

Schema includes `deleted_at` for soft-delete. Outbox rows reference waitlist entries with `ON DELETE cascade` for hard deletes — prefer soft-delete unless legal requires purge.

### Soft-delete (preferred default)

```sql
-- Identify
SELECT id, email, created_at, deleted_at
FROM waitlist_entries
WHERE email = lower(trim('applicant@example.com'));

-- Soft-delete
UPDATE waitlist_entries
SET deleted_at = now(), updated_at = now()
WHERE email = lower(trim('applicant@example.com'))
  AND deleted_at IS NULL;
```

Confirm application code paths ignore soft-deleted rows for operational lists (verify in current `packages/db` waitlist queries before relying on soft-delete alone for “invisible to ops”). If a hard legal erasure is required, proceed carefully:

### Hard-delete (legal erasure — owner/counsel approved)

```sql
-- This cascades to email_outbox rows for the entry
BEGIN;
DELETE FROM waitlist_entries
WHERE email = lower(trim('applicant@example.com'));
-- Review related submission_idempotency / email_events if counsel requires broader purge
COMMIT;
```

Also delete or restrict any CSV exports containing that person.

### Evidence fields

| Field                | Recorded value |
| -------------------- | -------------- |
| Date (UTC)           |                |
| Environment          |                |
| Operator             |                |
| Subject email / id   |                |
| Soft vs hard         |                |
| Legal basis / ticket |                |
| Verification query   |                |

---

## Failed email recovery

See the full runbook in [email-and-resend.md](./email-and-resend.md#failed-email-recovery-procedures). Summary:

1. Detect via outbox statuses / worker health / Resend dashboard.
2. Fix root cause (DNS, API key, worker process).
3. Re-queue dead-letter jobs one at a time after fix.
4. Verify `sent` status and inbox delivery.
5. Record ops evidence.

## Lead notification inbox

Change `LEAD_NOTIFICATION_EMAIL` on API and worker environment variables (staging and production separately), redeploy/restart services, and submit a staging test lead.

## Related

- [Deployment](./deployment.md)
- [Incident response](./incident-response.md)
- [Credentials & decisions](./credentials-and-decisions.md)
