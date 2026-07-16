-- Readiness Check (internal: readiness) data foundation.
-- Tables: sessions (draft + resumable token), submissions (redacted paste + scores),
-- question bank, and scoring config (rules/weights as data with seed rows).
--
-- Retention: readiness_submissions.retention_expires_at encodes a 90-day retention
-- intent for stored submissions. A purge job may be a stub until scheduled; raw
-- pastes must be redacted before insert (application layer — never store secrets).

CREATE TABLE IF NOT EXISTS "readiness_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"stage" text DEFAULT 'intake' NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "readiness_sessions_token_uidx" ON "readiness_sessions" ("token");
CREATE INDEX IF NOT EXISTS "readiness_sessions_updated_at_idx" ON "readiness_sessions" ("updated_at");

CREATE TABLE IF NOT EXISTS "readiness_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"parsed_report" jsonb,
	"raw_paste_redacted" text,
	"scores" jsonb,
	"bucket" text,
	"discrepancy_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_expires_at" timestamp with time zone DEFAULT (now() + interval '90 days') NOT NULL,
	CONSTRAINT "readiness_submissions_session_id_fk"
		FOREIGN KEY ("session_id") REFERENCES "readiness_sessions"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "readiness_submissions_session_id_idx" ON "readiness_submissions" ("session_id");
CREATE INDEX IF NOT EXISTS "readiness_submissions_retention_idx" ON "readiness_submissions" ("retention_expires_at");
CREATE INDEX IF NOT EXISTS "readiness_submissions_created_at_idx" ON "readiness_submissions" ("created_at");

CREATE TABLE IF NOT EXISTS "readiness_question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_key" text NOT NULL,
	"prompt" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "readiness_question_bank_key_uidx" ON "readiness_question_bank" ("question_key");
CREATE INDEX IF NOT EXISTS "readiness_question_bank_category_idx" ON "readiness_question_bank" ("category", "sort_order");

CREATE TABLE IF NOT EXISTS "readiness_scoring_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "readiness_scoring_config_key_version_uidx"
	ON "readiness_scoring_config" ("config_key", "version");

-- Seed scoring rules/weights as data (not hardcoded in application code).
INSERT INTO "readiness_scoring_config" ("config_key", "version", "rules", "weights", "active")
SELECT
	'default',
	1,
	'{"buckets":["not_ready","partial","ready"],"minConfidence":0.4,"version":1}'::jsonb,
	'{"auth":1.5,"authorization":1.5,"row_level_security":1.2,"tests":1.0,"deploys":1.0,"secrets_pattern":1.3,"error_handling":0.8,"logging":0.6,"confidence":1.0}'::jsonb,
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "readiness_scoring_config"
	WHERE "config_key" = 'default' AND "version" = 1
);

-- Minimal question bank seed (keys align with report-schema field families).
INSERT INTO "readiness_question_bank" ("question_key", "prompt", "category", "sort_order", "active")
SELECT v.question_key, v.prompt, v.category, v.sort_order, true
FROM (VALUES
	('summary', 'Summarize the product and primary user journey.', 'overview', 10),
	('languages', 'Which languages and runtimes power the product?', 'stack', 20),
	('structure', 'Describe the high-level system structure (monolith, services, packages).', 'stack', 30),
	('auth', 'How do users authenticate?', 'security', 40),
	('authorization', 'How is authorization enforced across tenants and roles?', 'security', 50),
	('row_level_security', 'Is row-level security (or equivalent) used for multi-tenant data isolation?', 'security', 60),
	('tests', 'What automated tests exist (unit, integration, e2e) and how are they run?', 'quality', 70),
	('deploys', 'How is the product deployed (CI/CD, environments, rollback)?', 'ops', 80),
	('secrets_pattern', 'How are secrets managed (vault, env injection, rotation)?', 'security', 90),
	('pii_categories', 'What categories of PII or sensitive data does the product process?', 'compliance', 100)
) AS v(question_key, prompt, category, sort_order)
WHERE NOT EXISTS (
	SELECT 1 FROM "readiness_question_bank" q WHERE q."question_key" = v.question_key
);
