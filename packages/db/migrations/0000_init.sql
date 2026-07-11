CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "public"."availability_status" AS ENUM('open', 'waitlist', 'paused');
CREATE TYPE "public"."engagement_type" AS ENUM('audit', 'launch', 'scale', 'enterprise', 'general');
CREATE TYPE "public"."lead_stage" AS ENUM('prototype', 'private_beta', 'live_users', 'revenue', 'enterprise_pipeline');
CREATE TYPE "public"."lead_blocker" AS ENUM('reliability_scale', 'security', 'security_compliance', 'identity_access', 'maintainability', 'infrastructure', 'data_migration', 'other');
CREATE TYPE "public"."desired_start_window" AS ENUM('asap', 'within_30_days', 'within_60_days', 'this_quarter', 'later');
CREATE TYPE "public"."lead_status" AS ENUM('new', 'qualified', 'contacted', 'scheduled', 'waitlisted', 'declined', 'converted', 'unsubscribed');
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'dead_letter');

CREATE TABLE "site_availability" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"status" "availability_status" DEFAULT 'waitlist' NOT NULL,
	"next_opening_date" date,
	"engagement_type" "engagement_type" DEFAULT 'audit' NOT NULL,
	"display_note" text,
	"available_starts" integer,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_availability_singleton_id" CHECK ("id" = 'main'),
	CONSTRAINT "site_availability_available_starts_nonneg" CHECK ("available_starts" IS NULL OR "available_starts" >= 0)
);

CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"company_name" text NOT NULL,
	"role" text,
	"product_url" text NOT NULL,
	"prototype_platform" text,
	"stage" "lead_stage" NOT NULL,
	"primary_blocker" "lead_blocker" NOT NULL,
	"desired_start" "desired_start_window" NOT NULL,
	"budget_range" text,
	"commercial_deadline" boolean DEFAULT false NOT NULL,
	"message" text NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"privacy_accepted" boolean NOT NULL,
	"privacy_accepted_at" timestamp with time zone NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"landing_page" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"submission_count" integer DEFAULT 1 NOT NULL,
	"last_submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"internal_notification_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE "submission_idempotency" (
	"idempotency_key" uuid PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"response_code" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_entry_id" uuid,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"recipient" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "waitlist_entries_email_uidx" ON "waitlist_entries" USING btree ("email");
CREATE INDEX "waitlist_status_created_idx" ON "waitlist_entries" USING btree ("status","created_at");
CREATE INDEX "waitlist_priority_idx" ON "waitlist_entries" USING btree ("priority_score","created_at");
CREATE UNIQUE INDEX "email_outbox_idempotency_uidx" ON "email_outbox" USING btree ("idempotency_key");
CREATE INDEX "email_outbox_poll_idx" ON "email_outbox" USING btree ("status","next_attempt_at");
CREATE UNIQUE INDEX "email_events_provider_event_uidx" ON "email_events" USING btree ("provider_event_id");
