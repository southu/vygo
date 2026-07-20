-- Analyses collection: default-project data migration.
--
-- Replaces the single-analysis-per-user model with a collection keyed by
-- (user, project). Every pre-existing analysis was stored under the legacy
-- `unspecified` placeholder (or a blank project) because the old model had no
-- project concept. This migration wraps each such analysis as the first history
-- entry of a project named 'Default project', preserving the `submission`
-- content byte-for-byte — only the project label changes, so nothing a legacy
-- consumer reads (status, created_at, or the verbatim submission payload) is
-- altered.
--
-- Idempotent: after this runs the WHERE clause matches nothing, and new inserts
-- already default to 'Default project'. Legacy result retrieval resolves to the
-- latest COMPLETED analysis of this project, which — until a newer run
-- completes — is exactly the migrated single analysis.

UPDATE "analyses"
SET "project_identifier" = 'Default project'
WHERE "project_identifier" IS NULL
   OR btrim("project_identifier") = ''
   OR "project_identifier" = 'unspecified';
