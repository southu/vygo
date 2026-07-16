import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isTestSurfaceEnabled, parseCorsOrigins, type ApiEnv } from "@vygo/config";
import {
  findApplicationById,
  findIdempotency,
  findWaitlistById,
  hashWaitlistRequest,
  insertApplication,
  listOutboxForEntry,
  persistWaitlistIntake,
  saveIdempotency,
  type DatabaseHandle,
  type WaitlistRepositoryOptions,
} from "@vygo/db";
import {
  WAITLIST_SUCCESS_BODY,
  buildWaitlistSuccessBody,
  waitlistRequestSchema,
  zodIssuesToFieldErrors,
  type WaitlistRequest,
  type WaitlistSuccessBody,
} from "@vygo/validation";
import { safeError } from "../errors.js";
import { resolveClientIp } from "../services/client-ip.js";
import { hashIpAddress } from "../services/ip-hash.js";
import {
  checkIpRateLimitWithRotation,
  checkRateLimit,
  emailRateLimitKey,
  type RateLimitStore,
} from "../services/rate-limit.js";
import { computeLeadScore } from "../services/scoring.js";
import type { TurnstileVerifier } from "../services/turnstile.js";
import { ensureApplicationsTable } from "./apply.js";

/** Map internal outbox status → mission-safe job state (no secrets / no bodies). */
function mapOutboxJobState(
  status: string,
): "queued" | "processing" | "sent" | "retry_scheduled" | "dead_letter" | string {
  switch (status) {
    case "pending":
      return "queued";
    case "processing":
      return "processing";
    case "sent":
      return "sent";
    case "failed":
      return "retry_scheduled";
    case "dead_letter":
      return "dead_letter";
    default:
      return status;
  }
}

export type WaitlistRouteDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
  turnstile: TurnstileVerifier;
  /** Non-production fault injection (env-driven only). */
  getFaultOptions?: () => WaitlistRepositoryOptions;
};

function isJsonContentType(header: string | string[] | undefined): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return false;
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "application/json";
}

function parseFormStartedAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 1e11) return asNum;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Abuse signals (honeypot / too-quick): return the generic success envelope
 * without persisting — does not disclose which signal fired.
 */
async function silentAbuseAccept(reply: FastifyReply): Promise<void> {
  await reply.status(200).send(WAITLIST_SUCCESS_BODY);
}

export function registerWaitlistRoutes(app: FastifyInstance, deps: WaitlistRouteDeps): void {
  const allowedOrigins = new Set(parseCorsOrigins(deps.env));

  const methodNotAllowed = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .status(405)
      .header("Allow", "POST, OPTIONS")
      .send(safeError("METHOD_NOT_ALLOWED", "Method not allowed."));
  };

  // GET also registers HEAD in Fastify; do not list HEAD separately.
  for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
    app.route({
      method,
      url: "/v1/waitlist",
      handler: methodNotAllowed,
    });
  }

  /**
   * Safe job status for a durable application id.
   * Never returns email addresses, message bodies, secrets, or credentials.
   */
  app.get("/v1/waitlist/:applicationId/status", async (request, reply) => {
    const params = request.params as { applicationId?: string };
    const applicationId =
      typeof params.applicationId === "string" ? params.applicationId.trim() : "";
    if (
      !applicationId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        applicationId,
      )
    ) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid application id."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      const entry = await findWaitlistById(dbHandle.db, applicationId);
      if (!entry) {
        return reply.status(404).send(safeError("NOT_FOUND", "Application not found."));
      }

      const outbox = await listOutboxForEntry(dbHandle.db, entry.id);
      return reply.status(200).send({
        applicationId: entry.id,
        marketingConsent: entry.marketingConsent,
        jobs: outbox.map((row) => ({
          kind: row.kind,
          state: mapOutboxJobState(row.status),
          attempts: row.attemptCount,
          /** Stable non-secret provider idempotency identifier. */
          idempotencyKey: row.providerIdempotencyKey,
        })),
      });
    } catch (error) {
      request.log.error(
        { event: "waitlist_status_failed" },
        error instanceof Error ? error.message : "status lookup failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.post("/v1/waitlist", async (request, reply) => {
    // 1. Content-Type
    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    // 2. Origin allowlist (required for browser intake)
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !origin.trim()) {
      return reply.status(403).send(safeError("FORBIDDEN_ORIGIN", "Origin is not allowed."));
    }
    if (!allowedOrigins.has(origin)) {
      return reply.status(403).send(safeError("FORBIDDEN_ORIGIN", "Origin is not allowed."));
    }

    // Malformed JSON — Fastify may attach a parse error or leave body as null/string
    if (request.body == null || typeof request.body !== "object" || Array.isArray(request.body)) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Request body must be valid JSON."));
    }

    const body = request.body as Record<string, unknown>;

    // Honeypot (pre-validation): non-empty website field → abuse, silent accept
    if (typeof body.website === "string" && body.website.trim() !== "") {
      request.log.info({ event: "waitlist_abuse_signal", signal: "honeypot" }, "abuse signal");
      return silentAbuseAccept(reply);
    }

    // Minimum completion time
    const startedAt = parseFormStartedAt(body.formStartedAt);
    const minMs = deps.env.MIN_FORM_COMPLETION_MS;
    if (startedAt != null && minMs > 0) {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= 0 && elapsed < minMs) {
        request.log.info({ event: "waitlist_abuse_signal", signal: "too_quick" }, "abuse signal");
        return silentAbuseAccept(reply);
      }
    }

    // Resolve IP ephemerally for hashing / turnstile only
    const rawIp = resolveClientIp(request);
    const ipHashResult = hashIpAddress(rawIp, deps.env);
    const ipHash = ipHashResult?.hash ?? null;
    const saltPepper = deps.env.IP_HASH_SALT ?? "vygo-dev-salt";

    // 3. Rate limits (IP + email when email parseable) — rotation-aware IP keys
    if (ipHashResult) {
      const ipRl = await checkIpRateLimitWithRotation(
        deps.rateLimitStore,
        ipHashResult.hash,
        ipHashResult.rotationHashes,
        deps.env.RATE_LIMIT_IP_MAX,
        deps.env.RATE_LIMIT_IP_WINDOW_SECONDS,
      );
      if (!ipRl.allowed) {
        request.log.info({ event: "waitlist_rate_limited", dimension: "ip" }, "rate limited");
        return reply
          .status(429)
          .header("Retry-After", String(ipRl.retryAfterSeconds))
          .send(
            safeError(
              "RATE_LIMITED",
              "Too many attempts. Please try again later or email hello@vygo.ai.",
            ),
          );
      }
    }

    // Pre-parse email for email-aware rate limit (normalize lightly)
    const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (rawEmail && rawEmail.includes("@")) {
      const emailRl = await checkRateLimit(
        deps.rateLimitStore,
        emailRateLimitKey(rawEmail, saltPepper),
        deps.env.RATE_LIMIT_EMAIL_MAX,
        deps.env.RATE_LIMIT_EMAIL_WINDOW_SECONDS,
      );
      if (!emailRl.allowed) {
        request.log.info({ event: "waitlist_rate_limited", dimension: "email" }, "rate limited");
        return reply
          .status(429)
          .header("Retry-After", String(emailRl.retryAfterSeconds))
          .send(
            safeError(
              "RATE_LIMITED",
              "Too many attempts. Please try again later or email hello@vygo.ai.",
            ),
          );
      }
    }

    // 4. Turnstile (server-only; no request bypass)
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : undefined;
    const turnstileResult = await deps.turnstile.verify(token, rawIp);
    if (!turnstileResult.success) {
      request.log.info(
        { event: "waitlist_turnstile_failed", reason: turnstileResult.reason },
        "turnstile failed",
      );
      return reply
        .status(400)
        .send(safeError("TURNSTILE_FAILED", "Verification failed. Please try again."));
    }

    // 5–6. Validate + normalize with Zod
    const parsed = waitlistRequestSchema.safeParse(body);
    if (!parsed.success) {
      const fields = zodIssuesToFieldErrors(parsed.error.issues);
      // Privacy-specific code path still 400 with field error
      const privacyIssue = parsed.error.issues.some((i) => i.path[0] === "privacyAccepted");
      request.log.info(
        {
          event: "waitlist_validation_failed",
          fieldKeys: Object.keys(fields),
          privacy: privacyIssue,
        },
        "validation failed",
      );
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted fields.",
          fields,
        },
      });
    }

    const application: WaitlistRequest = parsed.data;

    // Idempotency key from body or header
    const headerKey = request.headers["idempotency-key"];
    const idempotencyKey =
      application.idempotencyKey ??
      (typeof headerKey === "string" && headerKey.trim() ? headerKey.trim() : undefined);

    const requestHash = hashWaitlistRequest(application);
    const dbHandle = deps.getDb();

    if (!dbHandle) {
      request.log.error({ event: "waitlist_db_unavailable" }, "database unavailable");
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }

    if (idempotencyKey) {
      // Validate UUID shape for header-provided keys
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          idempotencyKey,
        )
      ) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Please review the highlighted fields.",
            fields: { idempotencyKey: "Please review this field." },
          },
        });
      }

      try {
        const existing = await findIdempotency(dbHandle.db, idempotencyKey);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            request.log.info({ event: "waitlist_idempotency_conflict" }, "idempotency conflict");
            return reply
              .status(409)
              .send(
                safeError(
                  "IDEMPOTENCY_CONFLICT",
                  "The idempotency key was reused with a different payload.",
                ),
              );
          }
          // Replay stored success body (includes durable applicationId when present).
          if (existing.responseCode === 200) {
            const body = existing.responseBody as WaitlistSuccessBody;
            if (body?.data?.accepted === true) {
              return reply.status(200).send(body);
            }
            return reply.status(200).send(WAITLIST_SUCCESS_BODY);
          }
          return reply.status(existing.responseCode).send(existing.responseBody);
        }
      } catch (error) {
        request.log.error(
          { event: "waitlist_idempotency_lookup_failed" },
          error instanceof Error ? error.message : "idempotency lookup failed",
        );
        return reply
          .status(500)
          .send(
            safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."),
          );
      }
    }

    const score = computeLeadScore(application);
    const userAgent =
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"].slice(0, 500)
        : null;

    const faultOptions =
      isTestSurfaceEnabled(deps.env) && deps.getFaultOptions ? deps.getFaultOptions() : {};

    // Production-configured envs never honor TEST_FAULT_MODE from env if strict.
    // getFaultOptions is wired from env only when test surface is enabled.

    let persistResult;
    try {
      persistResult = await persistWaitlistIntake(
        dbHandle.db,
        {
          application,
          ipHash,
          userAgent,
          priorityScore: score.total,
          leadNotificationEmail: deps.env.LEAD_NOTIFICATION_EMAIL,
        },
        faultOptions,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "persist failed";
      request.log.error(
        { event: "waitlist_persist_failed", fault: msg.startsWith("FAULT_") },
        "persist failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }

    // Dual-write the mandated production `applications` row (same id as the
    // waitlist entry) before acknowledging success. Fail closed if this commit
    // does not land — clients must not see accepted:true without durable storage.
    try {
      await ensureApplicationsTable(dbHandle);
      const existingApp = await findApplicationById(dbHandle.db, persistResult.entry.id);
      if (!existingApp) {
        await insertApplication(dbHandle.db, {
          id: persistResult.entry.id,
          fullName: application.fullName,
          workEmail: application.email,
          productUrl: application.productUrl,
          message: application.message,
          source: "waitlist",
        });
      }
    } catch (error) {
      request.log.error(
        { event: "waitlist_applications_dual_write_failed" },
        error instanceof Error ? error.message : "applications dual-write failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }

    // Return durable application id before any provider delivery completes.
    // Marketing consent is reported separately from transactional email queue state.
    const successBody = buildWaitlistSuccessBody({
      applicationId: persistResult.entry.id,
      marketingConsent: persistResult.entry.marketingConsent,
      emailJobCount: persistResult.outboxJobs.length,
      emailKinds: persistResult.outboxJobs.map((j) => j.kind),
    });

    if (idempotencyKey) {
      try {
        await saveIdempotency(dbHandle.db, {
          idempotencyKey,
          requestHash,
          responseCode: 200,
          responseBody: successBody,
        });
      } catch {
        // Concurrent insert of same key is fine — response already computed.
      }
    }

    request.log.info(
      {
        event: "waitlist_accepted",
        score: score.total,
        hasIpHash: Boolean(ipHash),
        applicationId: persistResult.entry.id,
        emailJobCount: persistResult.outboxJobs.length,
        marketingConsent: persistResult.entry.marketingConsent,
      },
      "waitlist accepted",
    );

    return reply.status(200).send(successBody);
  });
}
