import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiEnv } from "@vygo/config";
import { isTestSurfaceEnabled } from "@vygo/config";
import { persistEmailEvent, type DatabaseHandle } from "@vygo/db";
import { safeError } from "../errors.js";
import {
  parseResendSignatureHeaders,
  verifyResendSignature,
  TEST_RESEND_WEBHOOK_SECRET,
} from "../services/resend-webhook.js";

export type ResendWebhookDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  /** Override secret (tests). */
  webhookSecret?: string | null;
};

type RequestWithRawBody = FastifyRequest & { rawBody?: string };

function resolveWebhookSecret(deps: ResendWebhookDeps): string | null {
  if (deps.webhookSecret !== undefined) return deps.webhookSecret;
  if (deps.env.RESEND_WEBHOOK_SECRET) return deps.env.RESEND_WEBHOOK_SECRET;
  // Non-production / test surface: stable local secret so signature tests can run.
  if (isTestSurfaceEnabled(deps.env)) {
    return TEST_RESEND_WEBHOOK_SECRET;
  }
  return null;
}

function extractProviderEvent(body: unknown): {
  providerEventId: string;
  eventType: string;
  recipient: string | null;
  payload: Record<string, unknown>;
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : null;
  const data =
    obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : null;

  const providerEventId =
    (typeof obj.id === "string" && obj.id) ||
    (data && typeof data.email_id === "string" && data.email_id) ||
    (data && typeof data.id === "string" && data.id) ||
    null;

  if (!providerEventId || !type) return null;

  let recipient: string | null = null;
  if (data) {
    if (typeof data.to === "string") recipient = data.to;
    else if (Array.isArray(data.to) && typeof data.to[0] === "string") recipient = data.to[0];
  }

  return {
    providerEventId,
    eventType: type,
    recipient,
    payload: obj as Record<string, unknown>,
  };
}

function isWebhookPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return path === "/v1/webhooks/resend";
}

export function registerResendWebhookRoutes(app: FastifyInstance, deps: ResendWebhookDeps): void {
  // Capture raw body only for the Resend webhook path (signature verification).
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.method !== "POST" || !isWebhookPath(request.url)) {
      return payload;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    (request as RequestWithRawBody).rawBody = raw.toString("utf8");
    return Readable.from(raw);
  });

  app.post("/v1/webhooks/resend", async (request, reply) => {
    const secret = resolveWebhookSecret(deps);
    const headerMap = request.headers as Record<string, string | string[] | undefined>;
    const sigHeaders = parseResendSignatureHeaders(headerMap);
    const rawBody =
      (request as RequestWithRawBody).rawBody ??
      (typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {}));

    const verification = verifyResendSignature({
      secret,
      headers: sigHeaders,
      rawBody,
    });

    if (!verification.ok) {
      request.log.info(
        { event: "resend_webhook_rejected", reason: verification.reason },
        "webhook signature rejected",
      );
      const status = verification.reason === "missing_secret" ? 503 : 401;
      return reply
        .status(status)
        .send(
          safeError(
            verification.reason === "missing_secret"
              ? "WEBHOOK_MISCONFIGURED"
              : "INVALID_SIGNATURE",
            "Webhook signature verification failed.",
          ),
        );
    }

    const extracted = extractProviderEvent(request.body);
    if (!extracted) {
      return reply
        .status(400)
        .send(safeError("BAD_REQUEST", "Unrecognized webhook event payload."));
    }

    const db = deps.getDb();
    if (!db) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      const result = await persistEmailEvent(db.db, {
        providerEventId: extracted.providerEventId,
        eventType: extracted.eventType,
        recipient: extracted.recipient,
        payload: {
          type: extracted.eventType,
          id: extracted.providerEventId,
          hasData: true,
        },
      });

      request.log.info(
        {
          event: "resend_webhook_accepted",
          providerEventId: extracted.providerEventId,
          eventType: extracted.eventType,
          created: result.created,
        },
        "webhook accepted",
      );

      return reply.status(200).send({
        data: {
          accepted: true,
          created: result.created,
          providerEventId: extracted.providerEventId,
          eventType: extracted.eventType,
        },
      });
    } catch (error) {
      request.log.error(
        { event: "resend_webhook_persist_failed" },
        error instanceof Error ? error.message : "persist failed",
      );
      return reply.status(500).send(safeError("INTERNAL_ERROR", "An unexpected error occurred."));
    }
  });

  for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
    app.route({
      method,
      url: "/v1/webhooks/resend",
      handler: async (_req: FastifyRequest, reply: FastifyReply) => {
        return reply
          .status(405)
          .header("Allow", "POST")
          .send(safeError("METHOD_NOT_ALLOWED", "Method not allowed."));
      },
    });
  }
}
