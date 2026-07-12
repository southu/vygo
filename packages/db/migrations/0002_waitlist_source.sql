-- Additive, backward-compatible: records the intake channel for a waitlist lead
-- (e.g. "web" for the public marketing edge form). Nullable with no default so it
-- applies cleanly to an empty database and to already-populated tables.
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "source" text;
