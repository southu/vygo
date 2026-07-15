-- Durable apply-form submissions for the public /apply page.
-- Separate from waitlist_entries: the apply form is a lighter intake surface
-- (full name, work email, optional product URL + message) with its own source tag.
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"work_email" text NOT NULL,
	"product_url" text,
	"message" text,
	"source" text NOT NULL DEFAULT 'apply',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "applications_created_at_idx" ON "applications" ("created_at");
CREATE INDEX IF NOT EXISTS "applications_work_email_idx" ON "applications" ("work_email");
