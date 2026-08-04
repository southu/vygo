-- Purge seeded/demo readiness + analysis data.
--
-- Production accumulated only seeded/demo readiness runs and analysis history:
-- the app's own GET /v1/analyses/demo fixture route (demo@vygo.ai,
-- legacy-single@vygo.ai), prior live-acceptance test runs
-- (acceptance-api+...@vygo.ai), and the vygo_demo_fixture submissions. No real
-- user has ever used readiness, so every existing row across the four run/history
-- tables is seed/demo data and is removed outright rather than pattern-matched.
--
-- Scope is exactly the run/history tables:
--   * analyses                (project-scoped lead/run history)
--   * readiness_briefs         (FK submission_id -> readiness_submissions, CASCADE)
--   * readiness_submissions    (FK session_id -> readiness_sessions, SET NULL)
--   * readiness_sessions
-- App configuration/scoring data (readiness_question_bank,
-- readiness_scoring_config) and every unrelated table are intentionally left
-- untouched. Only pre-existing rows are removed; the tables, indexes, FKs and the
-- readiness feature itself remain fully functional.
--
-- FK-safe order: briefs (child) before submissions before sessions; analyses is
-- independent. Deleting submissions would cascade to briefs anyway, but briefs
-- are cleared explicitly first for clarity.
--
-- Idempotent: plain unconditional DELETEs. On any later re-run the tables are
-- already empty, so each DELETE removes zero rows — a no-op, never an error. The
-- legitimate /v1/analyses/demo route may re-seed demo rows afterward; that is
-- intentional existing app behavior and unrelated to this one-time purge.

DELETE FROM "readiness_briefs";

DELETE FROM "readiness_submissions";

DELETE FROM "readiness_sessions";

DELETE FROM "analyses";
