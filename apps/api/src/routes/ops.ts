/**
 * Internal ops surface (read-only v1).
 *
 *   GET /v1/ops/readiness           — list submissions (bucket + date filters)
 *   GET /v1/ops/readiness/export    — CSV of the current filtered view
 *   GET /v1/ops/readiness/:id       — submission + internal brief detail
 *
 * Protected by the shared ops Basic Auth pattern (OPS_BASIC_AUTH_* env).
 * Never returns unredacted pastes or credential-shaped secrets.
 * Browser traffic is same-origin on www.vygo.ai only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiEnv } from "@vygo/config";
import {
  getOpsReadinessSubmissionDetail,
  listOpsReadinessSubmissions,
  type DatabaseHandle,
  type OpsReadinessListRow,
} from "@vygo/db";
import { safeError } from "../errors.js";
import { requireOpsAuth } from "../services/ops-auth.js";

export type OpsRouteDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseListFilters(query: Record<string, unknown>) {
  const bucket = typeof query.bucket === "string" ? query.bucket.trim().slice(0, 64) : "";
  const from =
    typeof query.from === "string"
      ? query.from.trim().slice(0, 40)
      : typeof query.dateFrom === "string"
        ? query.dateFrom.trim().slice(0, 40)
        : "";
  const to =
    typeof query.to === "string"
      ? query.to.trim().slice(0, 40)
      : typeof query.dateTo === "string"
        ? query.dateTo.trim().slice(0, 40)
        : "";
  const limitRaw = typeof query.limit === "string" ? Number(query.limit) : NaN;
  const limit = Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : undefined;
  return {
    bucket: bucket || null,
    from: from || null,
    to: to || null,
    limit,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build a safe CSV for the filtered ops list.
 * Columns are intentionally non-secret: no raw paste, no token, no secrets.
 */
export function buildOpsReadinessCsv(rows: OpsReadinessListRow[]): string {
  const header = [
    "id",
    "created_at",
    "bucket",
    "company",
    "contact_name",
    "contact_email",
    "overall_score",
    "discrepancy_flag_count",
    "has_brief",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.id),
        csvEscape(row.createdAt),
        csvEscape(row.bucket ?? ""),
        csvEscape(row.company ?? ""),
        csvEscape(row.contactName ?? ""),
        csvEscape(row.contactEmail ?? ""),
        csvEscape(row.overallScore == null ? "" : String(row.overallScore)),
        csvEscape(String(row.discrepancyFlagCount)),
        csvEscape(row.hasBrief ? "true" : "false"),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function registerOpsRoutes(app: FastifyInstance, deps: OpsRouteDeps): void {
  /**
   * List readiness submissions for ops. Filters: bucket, from, to (date range).
   */
  app.get("/v1/ops/readiness", async (request, reply) => {
    if (!(await requireOpsAuth(request, reply, deps.env))) return;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      const filters = parseListFilters((request.query ?? {}) as Record<string, unknown>);
      const items = await listOpsReadinessSubmissions(dbHandle.db, filters);
      void reply.header("Cache-Control", "no-store");
      return reply.status(200).send({
        items,
        count: items.length,
        filters: {
          bucket: filters.bucket,
          from: filters.from,
          to: filters.to,
        },
      });
    } catch (error) {
      request.log.error(
        { event: "ops_readiness_list_failed" },
        error instanceof Error ? error.message : "ops list failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * CSV export of the CURRENT FILTERED view (same query params as the list).
   */
  app.get("/v1/ops/readiness/export", async (request, reply) => {
    if (!(await requireOpsAuth(request, reply, deps.env))) return;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      const filters = parseListFilters((request.query ?? {}) as Record<string, unknown>);
      const items = await listOpsReadinessSubmissions(dbHandle.db, filters);
      const csv = buildOpsReadinessCsv(items);
      void reply.header("Cache-Control", "no-store");
      void reply.header("Content-Type", "text/csv; charset=utf-8");
      void reply.header(
        "Content-Disposition",
        'attachment; filename="vygo-readiness-submissions.csv"',
      );
      return reply.status(200).send(csv);
    } catch (error) {
      request.log.error(
        { event: "ops_readiness_export_failed" },
        error instanceof Error ? error.message : "ops export failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Detail + internal brief for one submission.
   */
  app.get(
    "/v1/ops/readiness/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await requireOpsAuth(request, reply, deps.env))) return;

      const id = typeof request.params?.id === "string" ? request.params.id.trim() : "";
      if (!id || !UUID_RE.test(id)) {
        return reply
          .status(400)
          .send(safeError("VALIDATION_ERROR", "A valid submission id is required."));
      }

      const dbHandle = deps.getDb();
      if (!dbHandle) {
        return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
      }

      try {
        const detail = await getOpsReadinessSubmissionDetail(dbHandle.db, id);
        if (!detail) {
          return reply.status(404).send(safeError("NOT_FOUND", "Submission not found."));
        }

        // Never echo credential-shaped paste content even if stored incorrectly.
        const paste = detail.rawPasteRedacted ?? "";
        const safePaste =
          /sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._\-+=/]{8,}|password\s*=\s*\S+|api[_-]?key\s*=\s*\S+/i.test(
            paste,
          )
            ? "[REDACTED — paste contained credential-shaped content]"
            : paste;

        void reply.header("Cache-Control", "no-store");
        return reply.status(200).send({
          id: detail.id,
          bucket: detail.bucket,
          createdAt: detail.createdAt,
          scores: detail.scores,
          discrepancyFlags: detail.discrepancyFlags,
          contact: detail.contact,
          parsedReport: detail.parsedReport,
          rawPasteRedacted: safePaste || null,
          brief: detail.brief
            ? {
                id: detail.brief.id,
                submissionId: detail.brief.submissionId,
                talkingPoints: detail.brief.talkingPoints,
                scoreSummary: detail.brief.scoreSummary,
                bucket: detail.brief.bucket,
                discrepancyFlags: detail.brief.discrepancyFlags,
                llmPolished: detail.brief.llmPolished,
                body: detail.brief.brief,
                createdAt: detail.brief.createdAt,
              }
            : null,
        });
      } catch (error) {
        request.log.error(
          { event: "ops_readiness_detail_failed" },
          error instanceof Error ? error.message : "ops detail failed",
        );
        return reply
          .status(500)
          .send(
            safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."),
          );
      }
    },
  );
}
