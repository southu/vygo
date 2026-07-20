/**
 * Readiness analyses store — MANY analyses per user, keyed/indexed by
 * (user_identifier, project_identifier) plus created_at.
 *
 * Every submission INSERTs a new row (never upsert on user), so a user can hold
 * multiple analyses across projects and sales reps can follow up against the
 * full submission payload retained verbatim in `submission` (jsonb).
 *
 * All SQL is raw/parameterized via the shared `postgres` client (mirrors the
 * readiness-sessions repository). `ensureAnalysesTable` is a defensive lazy
 * bootstrap so handlers work even on a deploy that has not yet run the
 * 0011_analyses migration.
 */
import type { Sql } from "postgres";

/**
 * Canonical home for a user's legacy single analysis. A submission created
 * without an explicit project lands here, and the 0012 data migration re-homes
 * every pre-existing analysis (previously stored under the `unspecified`
 * placeholder or a blank project) into this project as its first history entry.
 * Legacy result retrieval defaults to the latest COMPLETED analysis of this
 * project.
 */
export const DEFAULT_PROJECT_IDENTIFIER = "Default project";

/** Placeholder project values the pre-collection model wrote — re-homed by 0012. */
export const LEGACY_UNSPECIFIED_PROJECTS = ["unspecified", ""] as const;

/**
 * Canonical status for a finished analysis. A submitted readiness analysis
 * carries its scored results, so it is a completed run; new analyses store this
 * status, and the 0012 migration rewrites every legacy single analysis (which
 * the pre-collection model stored under the default `received`) to `completed`
 * so it resolves as the completed result byte-for-byte.
 */
export const COMPLETED_ANALYSIS_STATUS = "completed";

/** Legacy default status the pre-collection model wrote for a completed run. */
export const LEGACY_COMPLETED_STATUS = "received";

/**
 * Statuses that count as a COMPLETED run for default result retrieval — a
 * strict allowlist. Result selection returns ONLY these, so a newer
 * `pending`/`failed`/`received` run never shadows (nor is ever returned as) the
 * latest completed one. The legacy `received` status is intentionally excluded:
 * such rows are rewritten to `completed` by the migration/backfill.
 */
const COMPLETED_STATUSES = new Set<string>([
  "completed",
  "complete",
  "done",
  "finished",
  "success",
  "succeeded",
  "ready",
  "scored",
  "closed",
]);

function normalizeStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** True when a status denotes a finished (completed) run for result retrieval. */
export function isCompletedStatus(status: unknown): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(status));
}

/** Resolve the project a new analysis should be stored under. */
export function resolveProjectIdentifier(project?: string | null): string {
  const trimmed = typeof project === "string" ? project.trim() : "";
  if (!trimmed) return DEFAULT_PROJECT_IDENTIFIER;
  if ((LEGACY_UNSPECIFIED_PROJECTS as readonly string[]).includes(trimmed)) {
    return DEFAULT_PROJECT_IDENTIFIER;
  }
  return trimmed.slice(0, 512);
}

export type AnalysisRow = {
  id: string;
  user_identifier: string;
  project_identifier: string;
  status: string;
  submission: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

export type AnalysisPublic = {
  id: string;
  user: string;
  project: string;
  status: string;
  submission: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type InsertAnalysisInput = {
  user: string;
  /** Missing/placeholder resolves to 'Default project' (see resolveProjectIdentifier). */
  project?: string | null;
  status?: string;
  submission: Record<string, unknown>;
};

export type ListAnalysesFilters = {
  user?: string | null;
  project?: string | null;
  limit?: number;
};

/** Idempotent table + index creation, matching migrations/0011_analyses.sql. */
export async function ensureAnalysesTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS analyses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_identifier text NOT NULL,
      project_identifier text NOT NULL,
      status text DEFAULT 'received' NOT NULL,
      submission jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analyses_user_project_created_idx
      ON analyses (user_identifier, project_identifier, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analyses_user_created_idx
      ON analyses (user_identifier, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analyses_created_at_idx
      ON analyses (created_at)
  `;
  await backfillDefaultProject(sql);
}

let defaultProjectBackfilled = false;

/**
 * Data migration (mirrors migrations/0012_analyses_default_project.sql): re-home
 * every pre-existing analysis stored under the legacy `unspecified`/blank
 * project placeholder into the 'Default project' history AND rewrite the legacy
 * completed status `received` to the canonical `completed`, preserving the
 * `submission` content byte-for-byte (only the project label and status marker
 * change). A legacy single analysis represents an existing completed result, so
 * marking it `completed` lets strict latest-completed retrieval return it while
 * a newer non-completed run does not shadow it. Runs at most once per process
 * from the lazy bootstrap so the collection model takes effect on serverless
 * deploys even when the one-off `db:migrate` step has not run. Idempotent: the
 * WHERE clauses match nothing after the first pass.
 */
export async function backfillDefaultProject(sql: Sql): Promise<void> {
  if (defaultProjectBackfilled) return;
  await sql`
    UPDATE analyses
    SET project_identifier = ${DEFAULT_PROJECT_IDENTIFIER}
    WHERE project_identifier IS NULL
       OR btrim(project_identifier) = ''
       OR project_identifier = 'unspecified'
  `;
  // A legacy completed run was stored under the default `received`; rewrite it
  // to the canonical `completed` so strict latest-completed retrieval resolves
  // it. The submission payload is untouched (byte-for-byte identical).
  await sql`
    UPDATE analyses
    SET status = ${COMPLETED_ANALYSIS_STATUS}
    WHERE status = ${LEGACY_COMPLETED_STATUS}
  `;
  defaultProjectBackfilled = true;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toSubmissionObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Public projection — never leaks internal column names or connection details. */
export function toAnalysisPublic(row: AnalysisRow): AnalysisPublic {
  return {
    id: row.id,
    user: row.user_identifier,
    project: row.project_identifier,
    status: row.status,
    submission: toSubmissionObject(row.submission),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function insertAnalysis(sql: Sql, input: InsertAnalysisInput): Promise<AnalysisRow> {
  const status =
    input.status && input.status.trim()
      ? input.status.trim().slice(0, 64)
      : COMPLETED_ANALYSIS_STATUS;
  // A missing/placeholder project lands in 'Default project' rather than
  // overwriting anything: every insert is a new history row.
  const project = resolveProjectIdentifier(input.project);
  // jsonb is passed as a pre-stringified parameter with an explicit cast: the
  // drizzle postgres-js driver overrides this handle's jsonb serializers with an
  // identity fn, so `sql.json()` parameters reach the wire unserialized and
  // throw. This mirrors the readiness ingest insert in apps/api.
  const rows = await sql<AnalysisRow[]>`
    INSERT INTO analyses (user_identifier, project_identifier, status, submission)
    VALUES (
      ${input.user},
      ${project},
      ${status},
      ${JSON.stringify(input.submission ?? {})}::jsonb
    )
    RETURNING id, user_identifier, project_identifier, status, submission, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw new Error("analysis insert returned no row");
  return row;
}

export async function listAnalyses(
  sql: Sql,
  filters: ListAnalysesFilters = {},
): Promise<AnalysisRow[]> {
  const user = filters.user && filters.user.trim() ? filters.user.trim() : null;
  const project = filters.project && filters.project.trim() ? filters.project.trim() : null;
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500));

  if (user && project) {
    return sql<AnalysisRow[]>`
      SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
      FROM analyses
      WHERE user_identifier = ${user} AND project_identifier = ${project}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }
  if (user) {
    return sql<AnalysisRow[]>`
      SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
      FROM analyses
      WHERE user_identifier = ${user}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }
  if (project) {
    return sql<AnalysisRow[]>`
      SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
      FROM analyses
      WHERE project_identifier = ${project}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }
  return sql<AnalysisRow[]>`
    SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
    FROM analyses
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function findAnalysisById(sql: Sql, id: string): Promise<AnalysisRow | null> {
  const rows = await sql<AnalysisRow[]>`
    SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
    FROM analyses
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Default result retrieval for a (user, project): the latest COMPLETED analysis
 * by created_at. A newer non-completed (pending/failed) run never shadows the
 * last completed one. `project` defaults to 'Default project' so a legacy
 * result lookup with only a user resolves the migrated single analysis. Returns
 * null when the user/project has no completed analysis yet.
 */
export async function findLatestCompletedAnalysis(
  sql: Sql,
  input: { user: string; project?: string | null },
): Promise<AnalysisRow | null> {
  const user = input.user.trim();
  if (!user) return null;
  const project = resolveProjectIdentifier(input.project);
  const rows = await sql<AnalysisRow[]>`
    SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
    FROM analyses
    WHERE user_identifier = ${user} AND project_identifier = ${project}
    ORDER BY created_at DESC
    LIMIT 200
  `;
  for (const row of rows) {
    if (isCompletedStatus(row.status)) return row;
  }
  return null;
}
