-- Analyses collection: default-project data migration.
--
-- Replaces the single-analysis-per-user model with a collection keyed by
-- (user, project). Every pre-existing analysis was stored under the legacy
-- `unspecified` placeholder (or a blank project) because the old model had no
-- project concept. This migration wraps each such analysis as the first history
-- entry of a project named 'Default project', preserving the `submission`
-- content byte-for-byte — only the project label changes, so nothing a legacy
-- consumer reads (the verbatim submission payload or created_at) is altered.
--
-- It also rewrites the legacy completed status. The pre-collection model stored
-- a completed single analysis under the default `received`, but default result
-- retrieval now strictly selects the latest analysis with status `completed`.
-- A legacy single analysis represents an existing completed result, so its
-- status is normalized to `completed` (payload untouched, byte-for-byte) — this
-- lets strict latest-completed retrieval keep returning it while a newer
-- non-completed run never shadows it.
--
-- Idempotent: after this runs the WHERE clauses match nothing, and new inserts
-- already default to 'Default project' + `completed`. Legacy result retrieval
-- resolves to the latest COMPLETED analysis of this project, which — until a
-- newer run completes — is exactly the migrated single analysis.

UPDATE "analyses"
SET "project_identifier" = 'Default project'
WHERE "project_identifier" IS NULL
   OR btrim("project_identifier") = ''
   OR "project_identifier" = 'unspecified';

UPDATE "analyses"
SET "status" = 'completed'
WHERE "status" = 'received';
