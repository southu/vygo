# Job-board happy-path — verification notes

Mission: verify the full happy path of the Vygo job board on the live site and
fix only small gaps.

## What was verified on live (www.vygo.ai)

Exercised end to end against the deployed edge function before making changes:

- `GET /` → 200, `GET /version` → 200 (deployed SHA), `GET /careers` → 200.
- Admin auth: `/admin` and `/api/internal/*` return 401 anonymously and 200 with
  the eval-default Basic-Auth credential (`ops` / `ops`, used only when no
  `OPS_BASIC_AUTH_PASSWORD` is configured — see `api/_lib/ops-auth.ts`).
- `POST /api/internal/roles` creates a role; it then appears in `GET /api/roles`
  and is readable via `GET /api/roles/:id` across repeated requests (the warm
  serverless instance keeps the in-memory store between invocations).
- `POST /api/roles/:id/applications` creates an application; it is listed by
  `GET /api/internal/applications?role_id=…`, and `PATCH
  /api/internal/applications/:id` persists a status change.

## Gap found and fixed (small)

The public marketing site is a **static export** (`apps/web`, `output: "export"`)
whose careers list and role-detail pages were rendered purely from the build-time
seed in `apps/web/src/content/careers.ts`. They did not reflect the live edge
job-board store, so a role an admin creates at runtime:

- never appeared on `/careers` (static list), and
- returned **404** on `/careers/:id` (no pre-rendered page for the new id —
  confirmed live).

That breaks acceptance steps 5, 6, 7 and 10. Because the apply flow is already
client-side-only (`RoleApplyForm` fetches the edge API), the fix is a minimal
client-side hydration against the same live API the admin writes to:

- `apps/web/src/components/CareersListLive.tsx` — the careers list refreshes from
  `GET /api/roles` on mount (server shell still renders the seed roles as the
  no-JS / SEO baseline). Admin-created roles appear; closed roles drop off.
- `apps/web/src/app/careers-role/page.tsx` — a client detail page that reads the
  id from the path and renders from `GET /api/roles/:id` (title + description +
  apply form for open roles, a graceful closed state otherwise, not-found for
  unknown ids). It reuses the existing detail DOM/test-ids and `RoleApplyForm`.
- `vercel.json` — rewrites `/careers/:id` → `/careers-role?id=:id`. Rewrites run
  after the filesystem, so pre-rendered seed detail pages still win; only
  runtime-created ids fall through to the client page. (The design is robust even
  if precedence were reversed: seed ids are also in the live store, so the client
  page would render them correctly too.)

No schema, auth, or infra changes; no new serverless function.

## FOLLOWUPS (larger — intentionally NOT built this run)

1. **Durable job-board storage.** `api/_lib/jobs.ts` keeps roles/applications in a
   process-local in-memory `Map` seeded at module load. It survives only while a
   serverless instance stays warm and is wiped on every deploy and whenever
   Vercel spins up a fresh/parallel instance. Applicant data can silently vanish
   and concurrent instances can diverge. Needs real persistence (e.g. the Railway
   Postgres the rest of the app uses, or a KV store) behind the same edge API.
   This is a schema/infra change and out of scope for a small fix.

2. **Static site ↔ live board coupling.** The list/detail pages now hydrate from
   the live API on the client, but the static shell still ships the seed roles.
   A cleaner design would render the public board from the live store server-side
   (ISR / a dynamic route / an edge-rendered surface) so raw HTML — not just the
   hydrated DOM — reflects live roles. Larger change touching the export strategy.

3. **Admin status vocabulary.** Application statuses are `new` / `reviewed` /
   `decided`. If richer lifecycle states are wanted (e.g. `rejected`, `hired`),
   that is a deliberate schema/UX change, not a bug.
