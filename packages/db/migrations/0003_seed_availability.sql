-- Seed the availability singleton so a freshly-migrated Railway Postgres already
-- serves the next available audit start date (August 24, 2026) from the database
-- itself — not from a hardcoded API/edge fallback. This is the DB source of truth
-- the canonical API (`GET /v1/public/availability` → getSiteAvailability) reads.
--
-- ON CONFLICT (id) DO NOTHING: idempotent and safe to re-run. It only ever creates
-- the row when absent; an operator's later value (set via `pnpm availability:set`
-- / the admin path) is never overwritten by a migration, so the date stays
-- admin-updatable without a redeploy of static copy.
INSERT INTO "site_availability" (
	"id", "status", "next_opening_date", "engagement_type", "display_note", "updated_by"
) VALUES (
	'main', 'waitlist', DATE '2026-08-24', 'audit',
	'Senior-only pods. Limited concurrent engagements.', 'migration-seed'
)
ON CONFLICT ("id") DO NOTHING;
