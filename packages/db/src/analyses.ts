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
  project: string;
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
    input.status && input.status.trim() ? input.status.trim().slice(0, 64) : "received";
  // jsonb is passed as a pre-stringified parameter with an explicit cast: the
  // drizzle postgres-js driver overrides this handle's jsonb serializers with an
  // identity fn, so `sql.json()` parameters reach the wire unserialized and
  // throw. This mirrors the readiness ingest insert in apps/api.
  const rows = await sql<AnalysisRow[]>`
    INSERT INTO analyses (user_identifier, project_identifier, status, submission)
    VALUES (
      ${input.user},
      ${input.project},
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
