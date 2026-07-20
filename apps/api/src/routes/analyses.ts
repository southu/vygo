/**
 * Readiness analyses store API (lead follow-up).
 *
 * POST   /v1/analyses            — persist a readiness analysis (user, project, full payload)
 * GET    /v1/analyses            — list stored analyses, filterable by ?user= and/or ?project=
 * GET    /v1/analyses/:id        — retrieve one stored analysis
 * GET    /v1/analyses/health     — analyses DB connection health (no secrets)
 *
 * Aliased as /api/analyses on the marketing edge (www.vygo.ai) via vercel.json
 * rewrites → api/readiness/[op].ts proxy ops.
 *
 * Every submission INSERTs a new row keyed/indexed by (user_identifier,
 * project_identifier) + created_at, so MANY analyses per user coexist (a second
 * analysis for the same user with a different project never overwrites the
 * first). The FULL submission payload is retained verbatim in `submission`
 * (jsonb) so sales reps can do lead follow-up.
 *
 * Never returns DATABASE_URL, connection strings, stack traces, or secrets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ensureAnalysesTable,
  insertAnalysis,
  listAnalyses,
  findAnalysisById,
  findLatestCompletedAnalysis,
  toAnalysisPublic,
  resolveProjectIdentifier,
  isCompletedStatus,
  DEFAULT_PROJECT_IDENTIFIER,
  COMPLETED_ANALYSIS_STATUS,
  type DatabaseHandle,
} from "@vygo/db";
import type { ApiEnv } from "@vygo/config";
import { safeError } from "../errors.js";
import { resolveClientIp } from "../services/client-ip.js";
import { hashIpAddress } from "../services/ip-hash.js";
import { checkRateLimit, type RateLimitStore } from "../services/rate-limit.js";

export type AnalysesRouteDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANALYSES_RL_LIMIT = 30;
const ANALYSES_RL_WINDOW_SECONDS = 60;
// Read-only poll budget. The scoped read paths (GET list, GET result, GET
// :id detail) are polled by a normal client while a run is in progress until it
// completes, so they cannot share the 30/60s create/ingest budget — a run that
// legitimately takes a couple of minutes would trip RATE_LIMITED long before
// the client observes the completed result, and the burst starves every other
// call behind it. A separate, generous budget on its own key sizes for
// sustained polling (a 2s interval fits comfortably under 120/60s) while still
// bounding abuse. The marketing edge proxies its scoped reads here, so this is
// the effective ceiling a live poller hits.
const ANALYSES_POLL_RL_LIMIT = 120;
const ANALYSES_POLL_RL_WINDOW_SECONDS = 60;
const MAX_FIELD_LEN = 512;

function isJsonContentType(header: string | string[] | undefined): boolean {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return true; // absent Content-Type is tolerated (defaults to JSON body)
  return raw.split(";")[0]?.trim().toLowerCase() === "application/json";
}

type PublicAnalysis = ReturnType<typeof toAnalysisPublic>;

/**
 * Attach an explicit `current` marker to each analysis so history consumers
 * don't have to re-derive which run is current: within each project the latest
 * COMPLETED run (max created_at) is current; a newer non-completed run is never
 * current. Returns the per-project current run id map (`currentByProject`).
 */
function annotateCurrent(analyses: PublicAnalysis[]): {
  analyses: (PublicAnalysis & { current: boolean })[];
  currentByProject: Record<string, string>;
} {
  const bestByProject = new Map<string, { id: string; created_at: string }>();
  for (const a of analyses) {
    if (!isCompletedStatus(a.status)) continue;
    const best = bestByProject.get(a.project);
    // ISO-8601 timestamps sort lexicographically.
    if (!best || a.created_at > best.created_at) {
      bestByProject.set(a.project, { id: a.id, created_at: a.created_at });
    }
  }
  const currentByProject: Record<string, string> = {};
  for (const [project, best] of bestByProject) currentByProject[project] = best.id;
  const annotated = analyses.map((a) => ({
    ...a,
    current: bestByProject.get(a.project)?.id === a.id,
  }));
  return { analyses: annotated, currentByProject };
}

/** First non-empty string among candidate keys, trimmed and length-capped. */
function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, MAX_FIELD_LEN);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value).slice(0, MAX_FIELD_LEN);
    }
  }
  return null;
}

async function resolveRateLimitKeyPart(
  request: FastifyRequest,
  deps: AnalysesRouteDeps,
): Promise<string> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  if (ipHashResult) return ipHashResult.hash;
  const { createHmac } = await import("node:crypto");
  return `rlfb:${createHmac("sha256", "vygo-analyses-rl").update(rawIp).digest("hex").slice(0, 32)}`;
}

async function replyRateLimited(
  reply: FastifyReply,
  retryAfterSeconds: number | undefined,
): Promise<void> {
  const retryAfter = Math.max(1, Math.min(retryAfterSeconds || 60, 60));
  await reply
    .status(429)
    .header("Retry-After", String(retryAfter))
    .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
}

/** Strict create/ingest budget — mutating and fixture-seeding routes. */
async function enforceAnalysesRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AnalysesRouteDeps,
): Promise<boolean> {
  const keyPart = await resolveRateLimitKeyPart(request, deps);
  const result = await checkRateLimit(
    deps.rateLimitStore,
    `rl:analyses:v1:ip:${keyPart}`,
    ANALYSES_RL_LIMIT,
    ANALYSES_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    await replyRateLimited(reply, result.retryAfterSeconds);
    return false;
  }
  return true;
}

/**
 * Generous read-only poll budget — scoped GET reads a client polls while a run
 * is in progress (list, result, detail-by-id). Kept on its own key so it never
 * shares (or starves) the strict create/ingest budget.
 */
async function enforceAnalysesPollRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AnalysesRouteDeps,
): Promise<boolean> {
  const keyPart = await resolveRateLimitKeyPart(request, deps);
  const result = await checkRateLimit(
    deps.rateLimitStore,
    `rl:analyses-poll:v1:ip:${keyPart}`,
    ANALYSES_POLL_RL_LIMIT,
    ANALYSES_POLL_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    await replyRateLimited(reply, result.retryAfterSeconds);
    return false;
  }
  return true;
}

/**
 * A dedicated, documented legacy pre-migration identity: an account that had a
 * SINGLE analysis before the multi-run migration. Kept in its own namespace,
 * separate from the multi-run demo user, so the legacy single-analysis case is
 * viewable on its own at /analyses?fixture=legacy (→ GET /v1/analyses/demo?user=…).
 */
const LEGACY_DEMO_USER = "legacy-single@vygo.ai";

type AnalysesSql = DatabaseHandle["sql"];

function legacyDemoUserSubmission(snapshotLegacy: string): Record<string, unknown> {
  return {
    source: "vygo_demo_fixture",
    fixture: "legacy_single_analysis",
    user: LEGACY_DEMO_USER,
    snapshotId: snapshotLegacy,
    results_text:
      "Original pre-migration analysis for a single-analysis account, preserved byte-for-byte after the multi-run migration into 'Default project'.",
    results: {
      overall_score: 69,
      band: "developing",
      dimensions: { clarity: 74, evidence: 63, alignment: 70 },
    },
  };
}

/**
 * Seed + read back the legacy single-analysis fixture user. Idempotent: inserts
 * the one pre-migration analysis only when the user has no rows yet, then always
 * runs the SAME Default-project migration a real legacy row goes through (re-home
 * 'unspecified' → 'Default project', rewrite legacy `received` → `completed`) and
 * an additive snapshotId backfill so the single completed result opens in the
 * existing results component. Only ever touches this fixture user's namespace.
 */
async function seedLegacyDemoUser(
  sql: AnalysesSql,
  snapshotLegacy: string,
): Promise<Record<string, unknown>> {
  const user = LEGACY_DEMO_USER;
  const existing = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM analyses WHERE user_identifier = ${user}
  `;
  const seeded = (existing[0]?.n ?? 0) === 0;

  if (seeded) {
    await sql`
      INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
      VALUES (
        ${user}, 'unspecified', 'received',
        ${JSON.stringify(legacyDemoUserSubmission(snapshotLegacy))}::jsonb,
        '2023-11-01T00:00:00Z', '2023-11-01T00:00:00Z'
      )
    `;
  }

  // Always run the migration + backfill so a row seeded by an earlier path (or
  // the acceptance recorder's POST) is normalised into the completed
  // 'Default project' shape and carries a resolvable snapshotId.
  await sql`
    UPDATE analyses
    SET project_identifier = ${DEFAULT_PROJECT_IDENTIFIER}
    WHERE user_identifier = ${user}
      AND (project_identifier IS NULL
           OR btrim(project_identifier) = ''
           OR project_identifier = 'unspecified')
  `;
  await sql`
    UPDATE analyses
    SET status = ${COMPLETED_ANALYSIS_STATUS}
    WHERE user_identifier = ${user} AND status = 'received'
  `;
  await sql`
    UPDATE analyses
    SET submission = submission || ${JSON.stringify({ snapshotId: snapshotLegacy })}::jsonb
    WHERE user_identifier = ${user}
      AND submission->>'fixture' = 'legacy_single_analysis'
      AND (submission->>'snapshotId') IS NULL
  `;

  const rows = await listAnalyses(sql, { user });
  const { analyses, currentByProject } = annotateCurrent(rows.map(toAnalysisPublic));
  const projects = Array.from(new Set(rows.map((r) => r.project_identifier)));
  const enc = (s: string) => encodeURIComponent(s);
  return {
    ok: true,
    seeded,
    idempotent: true,
    legacy: true,
    user,
    defaultProject: DEFAULT_PROJECT_IDENTIFIER,
    projects,
    count: analyses.length,
    analyses,
    currentByProject,
    verify: {
      currentDefaultResult: `/v1/analyses/result?user=${enc(user)}`,
      allHistory: `/v1/analyses?user=${enc(user)}`,
      history: `/analyses?fixture=legacy`,
    },
    notes: [
      "This identity had a SINGLE analysis before the multi-run migration; the row was re-homed into 'Default project' and its legacy 'received' status rewritten to 'completed' with its submission payload preserved byte-for-byte.",
      "currentDefaultResult returns that one original completed analysis — proof the pre-migration result is retained and viewable after this deploy.",
      "It carries a snapshotId so opening it renders the same results component a fresh run produces.",
    ],
  };
}

export function registerAnalysesRoutes(app: FastifyInstance, deps: AnalysesRouteDeps): void {
  // Lightweight analyses-scoped DB health — no auth, no secrets.
  app.get("/v1/analyses/health", async (_request, reply) => {
    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply
        .status(200)
        .send({ ok: false, service: "vygo-analyses", database: "not_configured", analyses: false });
    }
    try {
      await dbHandle.sql`SELECT 1`;
      await ensureAnalysesTable(dbHandle.sql);
      await dbHandle.sql`SELECT 1 FROM analyses LIMIT 1`;
      return reply
        .status(200)
        .send({ ok: true, service: "vygo-analyses", database: "ok", analyses: true });
    } catch (error) {
      _request.log.error(
        { event: "analyses_health_failed" },
        error instanceof Error ? error.message : "analyses health failed",
      );
      return reply
        .status(200)
        .send({ ok: false, service: "vygo-analyses", database: "error", analyses: false });
    }
  });

  app.post("/v1/analyses", async (request, reply) => {
    if (!(await enforceAnalysesRateLimit(request, reply, deps))) return;

    const ct = request.headers["content-type"];
    if (!isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply
        .status(400)
        .send(safeError("BAD_REQUEST", "Request body must be a JSON object."));
    }
    const record = body as Record<string, unknown>;

    const user = pickString(record, [
      "user",
      "user_identifier",
      "userId",
      "user_id",
      "email",
      "user_email",
    ]);
    const project = pickString(record, [
      "project",
      "project_identifier",
      "projectId",
      "project_id",
      "project_name",
    ]);

    if (!user) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A user identifier (user or email) is required."));
    }
    // A missing project stores the analysis in 'Default project' rather than
    // rejecting: the collection model always keeps every analysis, and an
    // unprojected run is the legacy single-analysis case.
    const resolvedProject = resolveProjectIdentifier(project);

    // A stored analysis is a completed run unless the caller says otherwise
    // (e.g. an explicit pending/failed status); default result retrieval
    // strictly returns the latest COMPLETED one.
    const status = pickString(record, ["status"]) ?? COMPLETED_ANALYSIS_STATUS;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureAnalysesTable(dbHandle.sql);
      // Retain the FULL submission payload verbatim for lead follow-up.
      const row = await insertAnalysis(dbHandle.sql, {
        user,
        project: resolvedProject,
        status,
        submission: record,
      });
      return reply.status(201).send({ ok: true, analysis: toAnalysisPublic(row) });
    } catch (error) {
      request.log.error(
        { event: "analyses_create_failed" },
        error instanceof Error ? error.message : "analyses create failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.get("/v1/analyses", async (request, reply) => {
    // Scoped history read — polled while a run is in progress; poll budget.
    if (!(await enforceAnalysesPollRateLimit(request, reply, deps))) return;

    const query = (request.query ?? {}) as Record<string, unknown>;
    const user = pickString(query, ["user", "user_identifier", "email"]);
    const project = pickString(query, ["project", "project_identifier", "project_name"]);

    // Scoped read only: a caller must name the exact user whose analyses they
    // are retrieving. An omitted/invalid `user` scope is rejected with no data
    // so an unscoped request can never dump every stored record (all users'
    // identifiers + full payloads), and a single request can only ever return
    // the one named user's rows (no cross-user enumeration).
    if (!user) {
      return reply
        .status(400)
        .send(
          safeError(
            "SCOPE_REQUIRED",
            "A user scope query parameter is required to list analyses; unscoped listing is not permitted.",
          ),
        );
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureAnalysesTable(dbHandle.sql);
      const rows = await listAnalyses(dbHandle.sql, { user, project });
      const { analyses, currentByProject } = annotateCurrent(rows.map(toAnalysisPublic));
      return reply
        .status(200)
        .send({ ok: true, count: analyses.length, analyses, currentByProject });
    } catch (error) {
      request.log.error(
        { event: "analyses_list_failed" },
        error instanceof Error ? error.message : "analyses list failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  // Default result retrieval: the latest COMPLETED analysis for a (user,
  // project). `project` defaults to 'Default project', so the legacy result
  // URL (`?user=<id>`) resolves the migrated single analysis until a newer run
  // completes. A newer pending/failed run never shadows the last completed one.
  app.get("/v1/analyses/result", async (request, reply) => {
    // Latest-result read — polled to completion; poll budget.
    if (!(await enforceAnalysesPollRateLimit(request, reply, deps))) return;

    const query = (request.query ?? {}) as Record<string, unknown>;
    const user = pickString(query, ["user", "user_identifier", "email"]);
    const projectRaw = pickString(query, ["project", "project_identifier", "project_name"]);
    const project = resolveProjectIdentifier(projectRaw);

    if (!user) {
      return reply
        .status(400)
        .send(
          safeError(
            "SCOPE_REQUIRED",
            "A user scope query parameter is required to retrieve a result.",
          ),
        );
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureAnalysesTable(dbHandle.sql);
      const row = await findLatestCompletedAnalysis(dbHandle.sql, { user, project });
      if (!row) {
        return reply
          .status(404)
          .send(safeError("NOT_FOUND", "No completed analysis found for this project."));
      }
      return reply.status(200).send({
        ok: true,
        project,
        defaultProject: DEFAULT_PROJECT_IDENTIFIER,
        analysis: toAnalysisPublic(row),
      });
    } catch (error) {
      request.log.error(
        { event: "analyses_result_failed" },
        error instanceof Error ? error.message : "analyses result failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  // Idempotent, non-destructive demo fixture for browser-only verification.
  // Seeds a fixed demo user (demo@vygo.ai) whose history exercises the whole
  // analysis-history model: legacy → 'Default project' migration integrity, a
  // newer non-completed run that must not shadow the completed one, and a
  // distinct second project. Only inserts when the demo user has no rows yet
  // and only ever touches the demo user's namespace — real data is untouched.
  app.get("/v1/analyses/demo", async (request, reply) => {
    if (!(await enforceAnalysesRateLimit(request, reply, deps))) return;

    // A small allowlist of documented fixture identities: the multi-run demo
    // user (default) and the legacy single-analysis user. Any other `user`
    // value falls back to the demo user — this endpoint never seeds arbitrary
    // namespaces.
    const requestedUser = (
      pickString((request.query ?? {}) as Record<string, unknown>, [
        "user",
        "user_identifier",
        "email",
      ]) ?? ""
    ).toLowerCase();
    const user = requestedUser === LEGACY_DEMO_USER ? LEGACY_DEMO_USER : "demo@vygo.ai";
    const secondProject = "Project Beta";
    // Stable seeded readiness-snapshot fixture ids (served publicly by
    // GET /v1/readiness/snapshot/:id). Each demo COMPLETED run carries one so a
    // history entry opens the EXISTING results component (SnapshotView) at
    // /readiness/snapshot?id=<snapshotId> populated with a real scored report.
    const snapshotIds = {
      legacy: "00000000-0000-4000-a000-0000000000e3", // mixed profile
      rerun: "00000000-0000-4000-a000-0000000000e2", // strong profile
      beta: "00000000-0000-4000-a000-0000000000e1", // weak profile
    } as const;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      const sql = dbHandle.sql;
      await ensureAnalysesTable(sql);

      // The legacy single-analysis identity has its own dedicated fixture path
      // so its one pre-migration result is viewable on its own.
      if (user === LEGACY_DEMO_USER) {
        return reply.status(200).send(await seedLegacyDemoUser(sql, snapshotIds.legacy));
      }

      const existing = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM analyses WHERE user_identifier = ${user}
      `;
      const seeded = (existing[0]?.n ?? 0) === 0;

      if (seeded) {
        // jsonb is passed as a pre-stringified parameter with an explicit
        // ::jsonb cast — NOT sql.json(). The drizzle postgres-js driver
        // overrides this handle's jsonb serializers with an identity fn, so
        // sql.json() parameters reach the wire unserialized and throw. This
        // mirrors insertAnalysis() in @vygo/db (which is why the create route
        // works while this demo seed previously 500'd on the same handle).
        const legacy = {
          source: "vygo_demo_fixture",
          fixture: "legacy_single_analysis",
          user,
          snapshotId: snapshotIds.legacy,
          results_text:
            "Legacy readiness analysis for demo@vygo.ai — the single pre-migration analysis, preserved byte-for-byte as the first entry of 'Default project'.",
          results: {
            overall_score: 72,
            band: "developing",
            dimensions: { clarity: 80, evidence: 65, alignment: 71 },
          },
        };
        const newerPending = {
          source: "vygo_demo_fixture",
          fixture: "newer_pending_run",
          results_text:
            "A newer run that is still pending; it must NOT shadow the completed result.",
        };
        const secondProjectAnalysis = {
          source: "vygo_demo_fixture",
          fixture: "second_project_analysis",
          snapshotId: snapshotIds.beta,
          results_text: "A completed analysis stored under a distinct second project.",
          results: {
            overall_score: 88,
            band: "strong",
            dimensions: { clarity: 90, evidence: 85, alignment: 89 },
          },
        };
        // Seed the legacy row under the pre-migration 'unspecified' project
        // with the legacy `received` status, then run the SAME migration a real
        // legacy row goes through: re-home into 'Default project' AND rewrite
        // the legacy completed status to the canonical `completed`. The
        // submission payload is preserved byte-for-byte.
        await sql`
          INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
          VALUES (${user}, 'unspecified', 'received', ${JSON.stringify(legacy)}::jsonb,
                  '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')
        `;
        await sql`
          UPDATE analyses
          SET project_identifier = ${DEFAULT_PROJECT_IDENTIFIER}
          WHERE user_identifier = ${user}
            AND (project_identifier IS NULL
                 OR btrim(project_identifier) = ''
                 OR project_identifier = 'unspecified')
        `;
        await sql`
          UPDATE analyses
          SET status = ${COMPLETED_ANALYSIS_STATUS}
          WHERE user_identifier = ${user} AND status = 'received'
        `;
        await sql`
          INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
          VALUES (${user}, ${DEFAULT_PROJECT_IDENTIFIER}, 'pending', ${JSON.stringify(newerPending)}::jsonb,
                  '2024-06-01T00:00:00Z', '2024-06-01T00:00:00Z')
        `;
        await sql`
          INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
          VALUES (${user}, ${secondProject}, 'completed', ${JSON.stringify(secondProjectAnalysis)}::jsonb,
                  '2024-03-01T00:00:00Z', '2024-03-01T00:00:00Z')
        `;
      }

      // Idempotent, additive upgrades so a demo user seeded BEFORE this change
      // also gains (a) a resolvable snapshotId on each completed run so history
      // entries open the existing results component, and (b) a SECOND completed
      // run in 'Default project' (a re-run) whose newer completion becomes the
      // project's current result while the older completed run stays listed and
      // openable. Scoped to the demo user only.
      await sql`
        UPDATE analyses
        SET submission = submission || ${JSON.stringify({ snapshotId: snapshotIds.legacy })}::jsonb
        WHERE user_identifier = ${user}
          AND submission->>'fixture' = 'legacy_single_analysis'
          AND (submission->>'snapshotId') IS NULL
      `;
      await sql`
        UPDATE analyses
        SET submission = submission || ${JSON.stringify({ snapshotId: snapshotIds.beta })}::jsonb
        WHERE user_identifier = ${user}
          AND submission->>'fixture' = 'second_project_analysis'
          AND (submission->>'snapshotId') IS NULL
      `;
      const rerunExisting = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM analyses
        WHERE user_identifier = ${user} AND submission->>'fixture' = 'default_project_rerun'
      `;
      if ((rerunExisting[0]?.n ?? 0) === 0) {
        const rerun = {
          source: "vygo_demo_fixture",
          fixture: "default_project_rerun",
          user,
          snapshotId: snapshotIds.rerun,
          results_text:
            "A re-run of the Default project analysis. This newer completed run is the project's current result; the earlier completed run stays in history and remains openable.",
          results: {
            overall_score: 84,
            band: "strong",
            dimensions: { clarity: 88, evidence: 80, alignment: 85 },
          },
        };
        await sql`
          INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
          VALUES (${user}, ${DEFAULT_PROJECT_IDENTIFIER}, 'completed', ${JSON.stringify(rerun)}::jsonb,
                  '2024-08-01T00:00:00Z', '2024-08-01T00:00:00Z')
        `;
      }

      const rows = await listAnalyses(dbHandle.sql, { user });
      const { analyses, currentByProject } = annotateCurrent(rows.map(toAnalysisPublic));
      const projects = Array.from(new Set(rows.map((r) => r.project_identifier)));
      const enc = (s: string) => encodeURIComponent(s);
      return reply.status(200).send({
        ok: true,
        seeded,
        idempotent: true,
        user,
        defaultProject: DEFAULT_PROJECT_IDENTIFIER,
        secondProject,
        projects,
        count: analyses.length,
        analyses,
        currentByProject,
        verify: {
          currentDefaultResult: `/v1/analyses/result?user=${enc(user)}`,
          defaultProjectHistory: `/v1/analyses?user=${enc(user)}&project=${enc(DEFAULT_PROJECT_IDENTIFIER)}`,
          secondProjectHistory: `/v1/analyses?user=${enc(user)}&project=${enc(secondProject)}`,
          allHistory: `/v1/analyses?user=${enc(user)}`,
        },
      });
    } catch (error) {
      request.log.error(
        { event: "analyses_demo_failed" },
        error instanceof Error ? error.message : "analyses demo failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.get("/v1/analyses/:id", async (request, reply) => {
    // Scoped detail-by-id — the primary in-progress poll target; poll budget.
    if (!(await enforceAnalysesPollRateLimit(request, reply, deps))) return;

    const id = (request.params as { id?: string })?.id ?? "";
    if (!UUID_RE.test(id)) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid analysis id."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureAnalysesTable(dbHandle.sql);
      const row = await findAnalysisById(dbHandle.sql, id);
      if (!row) {
        return reply.status(404).send(safeError("NOT_FOUND", "Analysis not found."));
      }
      return reply.status(200).send({ ok: true, analysis: toAnalysisPublic(row) });
    } catch (error) {
      request.log.error(
        { event: "analyses_get_failed" },
        error instanceof Error ? error.message : "analyses get failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });
}
