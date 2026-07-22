import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  toGuideLearningsResponse,
  toPublicLearningStatus,
  type PublicLearning,
} from "@vygo/validation";
import {
  appendEntry,
  readLog,
  LearningsLogError,
  DEFAULT_LEARNINGS_LOG_PATH,
} from "@vygo/validation/learnings-log";
import { safeError } from "../errors.js";

export interface GuideLearningsRouteOptions {
  /** Override the learnings log path (tests). Defaults to the canonical store. */
  logPath?: string;
}

/** Today's calendar date (YYYY-MM-DD) for stamping new learnings. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Coerce a POST `sections` field into a clean, non-empty string list. Accepts
 * an array of strings or a comma-separated string. Returns null when nothing
 * usable remains so the handler can reject with a 400.
 */
function normalizeSections(input: unknown): string[] | null {
  let raw: unknown[];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === "string") raw = input.split(",");
  else return null;
  const sections = raw
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  return sections.length > 0 ? sections : null;
}

/**
 * Ratchet guide-progress learnings API. Reads the single canonical learnings
 * log (data/ratchet-learnings.json) on every GET — no caching — so the counts
 * always match the underlying store, and appends new pending learnings on POST.
 * No auth tokens or secrets: the store is public product-progress data.
 */
export function registerGuideLearningsRoutes(
  app: FastifyInstance,
  options: GuideLearningsRouteOptions = {},
): void {
  const logPath = options.logPath ?? DEFAULT_LEARNINGS_LOG_PATH;

  app.get("/api/guide/learnings", async (_request, reply) => {
    const log = readLog(logPath);
    void reply.header("Cache-Control", "no-store");
    return reply.status(200).send(toGuideLearningsResponse(log.entries));
  });

  app.post("/api/guide/learnings", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const sections = normalizeSections(body.sections);

    if (!summary || !source || !sections) {
      return reply
        .status(400)
        .send(
          safeError(
            "INVALID_REQUEST",
            "summary, source, and a non-empty sections list are required.",
          ),
        );
    }

    try {
      const entry = appendEntry(
        {
          id: `L-${todayIsoDate()}-${randomUUID().slice(0, 8)}`,
          summary,
          date: todayIsoDate(),
          source_link: source,
          affected_sections: sections,
        },
        { path: logPath },
      );

      const stored: PublicLearning = {
        id: entry.id,
        summary: entry.summary,
        source: entry.source_link,
        status: toPublicLearningStatus(entry.status),
        sections: [...entry.affected_sections],
        date: entry.date,
      };
      return reply.status(201).send(stored);
    } catch (error) {
      if (error instanceof LearningsLogError) {
        request.log.warn({ err: { message: error.message } }, "guide learnings append rejected");
        return reply
          .status(400)
          .send(safeError("INVALID_REQUEST", "Could not store the learning."));
      }
      throw error;
    }
  });
}
