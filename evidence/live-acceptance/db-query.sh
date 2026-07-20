#!/usr/bin/env bash
#
# Read-only database evidence for the vygo-live-acceptance-pass mission.
#
# Confirms the submission + analysis records created by acceptance-pass.mjs are
# queryable in the provisioned Railway database (project 'composer' → reused
# Railway project, folder 'vygo'). It uses the vault provisioner read-path
# (`vault-provisioner-query sql`): register_run(folder) → short-lived lease →
# Railway GraphQL → psql DATABASE_PUBLIC_URL → release. The tool runs
# allowlisted SELECT statements only and NEVER prints connection strings or
# credentials (secrets_in_output: False). No secrets are stored in this repo.
#
# Non-secret Railway resource identifiers (project/environment/Postgres service)
# are read from the run's provision summary when present, else the documented
# defaults below (these are resource UUIDs, not credentials). Override via env.
#
# Usage:  evidence/live-acceptance/db-query.sh > evidence/live-acceptance/output/db-query.txt
set -euo pipefail

SUMMARY="${PROVISION_SUMMARY:-$RATCHET_SHARED_DIR/provision.json}"
read_id() { [ -f "$SUMMARY" ] && jq -r "$1 // empty" "$SUMMARY" 2>/dev/null || true; }

# Vault-provisioner folder for the mission's allowlisted project. The mission's
# provisioning project_name is 'composer' (allowlist ['composer']); it maps to
# the reused Railway project whose non-secret ids are below. Overridable via env.
FOLDER="${VAULT_PROVISIONER_FOLDER:-composer}"

PROJECT_ID="${RAILWAY_PROJECT_ID:-$(read_id '.project_id')}"
ENV_ID="${RAILWAY_ENVIRONMENT_ID:-$(read_id '.environment_id')}"
# Postgres service that backs the live app (has DATABASE_PUBLIC_URL).
SERVICE_ID="${RAILWAY_PG_SERVICE_ID:-7e3b44d3-f9d4-4afd-a367-2fde98bd510f}"
PROJECT_ID="${PROJECT_ID:-1b8abe52-f665-4e07-9a99-f6aa36a62610}"
ENV_ID="${ENV_ID:-39b57aef-2574-4d8e-bbd2-673e91eb9768}"

q() {
  echo "----- SQL: $1"
  vault-provisioner-query sql \
    --folder "$FOLDER" \
    --project-id "$PROJECT_ID" \
    --environment-id "$ENV_ID" \
    --service-id "$SERVICE_ID" \
    --sql "$1"
  echo
}

echo "# vygo-live-acceptance-pass — provisioned Railway DB evidence"
echo "# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) via vault-provisioner-query (read-only SELECT; no secrets in output)."
echo "# provisioner_folder=$FOLDER (mission project 'composer') project_id=$PROJECT_ID environment_id=$ENV_ID postgres_service_id=$SERVICE_ID"
echo

echo "## Provisioner status (armed/unlocked; no secrets)"
vault-provisioner-query status
echo

echo "## Analysis records for the acceptance runs (analyses table)"
q "SELECT left(id::text,8) AS run_id, user_identifier AS \"user\", project_identifier AS project, status, created_at, (submission->>'snapshotId') AS snapshot_id FROM analyses WHERE user_identifier IN ('demo@vygo.ai','acceptance-api@vygo.ai','legacy-single@vygo.ai') ORDER BY user_identifier, created_at"

echo "## Submission payloads stored with each analysis record (demo A & B)"
q "SELECT left(id::text,8) AS run_id, project_identifier AS project, status, left(submission::text,180) AS submission_preview FROM analyses WHERE user_identifier='demo@vygo.ai' AND project_identifier IN ('A','B') ORDER BY project_identifier, created_at"

echo "## Legacy single-analysis user — original result retained"
q "SELECT left(id::text,8) AS run_id, project_identifier AS project, status, (submission->>'results_text') AS results_text FROM analyses WHERE user_identifier='legacy-single@vygo.ai' ORDER BY created_at"

echo "## Per-project run counts + current (latest completed) run"
q "SELECT project_identifier AS project, count(*) FILTER (WHERE status='completed') AS completed_runs, count(*) AS total_runs, left((array_agg(id::text ORDER BY created_at DESC) FILTER (WHERE status='completed'))[1],8) AS current_run FROM analyses WHERE user_identifier='demo@vygo.ai' AND project_identifier IN ('A','B') GROUP BY project_identifier ORDER BY project_identifier"

echo "## Related submission records (readiness ingest submissions table exists)"
q "SELECT count(*) AS ingest_submission_rows FROM readiness_ingest_submissions"

echo "# End of DB evidence."
