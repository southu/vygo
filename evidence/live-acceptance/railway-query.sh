#!/usr/bin/env bash
#
# Credential-free HTTP read-only DB evidence for the vygo-live-acceptance-pass
# mission. Records the acceptance runs' analysis + submission rows from the
# provisioned Railway database (project 'composer') via the live, authenticated
# (allowlist-scoped) read-only endpoint GET /api/railway/query on www.vygo.ai.
#
# The endpoint serves rows from the same Railway Postgres the app reads through
# /api/analyses. It NEVER returns a connection string, token, or secret — only
# the analysis/submission row data the app already exposes to a scoped caller —
# and it is scoped to the documented acceptance identities only (omit `user` for
# all of them, or pass one). Run acceptance-pass.mjs first to create the runs.
#
# Usage:  evidence/live-acceptance/railway-query.sh > evidence/live-acceptance/output/railway-query.json
set -euo pipefail

BASE="${VYGO_BASE_URL:-https://www.vygo.ai}"

# Full evidence: all documented acceptance identities in one query-output payload.
curl -fsS -H 'accept: application/json' "${BASE}/api/railway/query"
