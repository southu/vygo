-- Readiness analyses lead store.
--
-- Purpose: retain MANY readiness analyses per user, keyed/indexed by
-- (user_identifier, project_identifier) plus created_at, so a single user can
-- run analyses across multiple projects and sales reps can do lead follow-up
-- against the FULL submission payload retained verbatim in `submission` (jsonb).
--
-- This is NOT an upsert-on-user store: every submission inserts a new row, so a
-- second analysis for the same user with a different project (or the same
-- project again) coexists with the first rather than overwriting it. Created
-- defensively with IF NOT EXISTS to match the lazy ensureAnalysesTable bootstrap
-- used by the API/edge handlers on deploys that have not run this migration yet.

CREATE TABLE IF NOT EXISTS "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_identifier" text NOT NULL,
	"project_identifier" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"submission" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Primary lookup: newest analyses for a given (user, project).
CREATE INDEX IF NOT EXISTS "analyses_user_project_created_idx"
	ON "analyses" ("user_identifier", "project_identifier", "created_at" DESC);

-- All analyses for a user across projects (proves many-per-user).
CREATE INDEX IF NOT EXISTS "analyses_user_created_idx"
	ON "analyses" ("user_identifier", "created_at" DESC);

-- Time-ordered scans for ops export / retention jobs.
CREATE INDEX IF NOT EXISTS "analyses_created_at_idx"
	ON "analyses" ("created_at");
