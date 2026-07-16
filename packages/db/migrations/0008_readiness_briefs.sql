-- Internal lead briefs for completed readiness submissions.
-- Template-generated structured brief stored durably, linked to readiness_submissions.
-- Ops email is enqueued via email_outbox (kind readiness_ops_brief); never blocks scoring.

CREATE TABLE IF NOT EXISTS "readiness_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"brief" jsonb NOT NULL,
	"talking_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_summary" jsonb,
	"bucket" text,
	"discrepancy_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_polished" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "readiness_briefs_submission_id_fk"
		FOREIGN KEY ("submission_id") REFERENCES "readiness_submissions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "readiness_briefs_submission_uidx"
	ON "readiness_briefs" ("submission_id");
CREATE INDEX IF NOT EXISTS "readiness_briefs_created_at_idx"
	ON "readiness_briefs" ("created_at");
