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
  toAnalysisPublic,
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
const MAX_FIELD_LEN = 512;

function isJsonContentType(header: string | string[] | undefined): boolean {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return true; // absent Content-Type is tolerated (defaults to JSON body)
  return raw.split(";")[0]?.trim().toLowerCase() === "application/json";
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

async function enforceAnalysesRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AnalysesRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  let keyPart: string;
  if (ipHashResult) {
    keyPart = ipHashResult.hash;
  } else {
    const { createHmac } = await import("node:crypto");
    keyPart = `rlfb:${createHmac("sha256", "vygo-analyses-rl").update(rawIp).digest("hex").slice(0, 32)}`;
  }
  const result = await checkRateLimit(
    deps.rateLimitStore,
    `rl:analyses:v1:ip:${keyPart}`,
    ANALYSES_RL_LIMIT,
    ANALYSES_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.min(result.retryAfterSeconds || 60, 60));
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
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
    if (!project) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A project identifier (project) is required."));
    }

    const status = pickString(record, ["status"]) ?? "received";

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureAnalysesTable(dbHandle.sql);
      // Retain the FULL submission payload verbatim for lead follow-up.
      const row = await insertAnalysis(dbHandle.sql, {
        user,
        project,
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
    if (!(await enforceAnalysesRateLimit(request, reply, deps))) return;

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
      const analyses = rows.map(toAnalysisPublic);
      return reply.status(200).send({ ok: true, count: analyses.length, analyses });
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

  app.get("/v1/analyses/:id", async (request, reply) => {
    if (!(await enforceAnalysesRateLimit(request, reply, deps))) return;

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
