CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_outbox_claim_idx" ON "email_outbox" USING btree ("status","next_attempt_at","created_at");
