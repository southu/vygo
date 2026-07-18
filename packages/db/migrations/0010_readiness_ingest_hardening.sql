-- Readiness AI-ingest hardening: limited-resubmit token lifecycle.
-- Tables are created defensively (IF NOT EXISTS) to match the lazy bootstrap
-- in ensureReadinessTables for deploys that have not run this migration yet;
-- the ADD COLUMN is the substantive change for deploys that already have the
-- tables from that bootstrap path.

CREATE TABLE IF NOT EXISTS "readiness_ingest_tokens" (
	"token" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "readiness_ingest_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "readiness_ingest_tokens" ADD COLUMN IF NOT EXISTS "use_count" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "readiness_ingest_tokens_expires_at_idx"
	ON "readiness_ingest_tokens" ("expires_at");
