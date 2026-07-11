import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { redactString } from "./logging.js";

export type SafeErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function safeError(code: string, message: string): SafeErrorBody {
  return { error: { code, message } };
}

/**
 * Centralized error handler: machine-readable, no stacks, SQL, credentials, or PII.
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const requestId = request.id;

  // Payload too large
  if (error.statusCode === 413 || error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    await reply.status(413).send(safeError("PAYLOAD_TOO_LARGE", "Request payload is too large."));
    return;
  }

  if (error.statusCode === 400 && error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
    await reply.status(415).send(safeError("UNSUPPORTED_MEDIA_TYPE", "Unsupported media type."));
    return;
  }

  // Malformed JSON body
  if (
    error.code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
    error.code === "FST_ERR_CTP_EMPTY_JSON_BODY" ||
    (error.statusCode === 400 && /json/i.test(error.message || ""))
  ) {
    await reply.status(400).send(safeError("BAD_REQUEST", "Request body must be valid JSON."));
    return;
  }

  if (error.validation) {
    await reply
      .status(400)
      .send(safeError("VALIDATION_ERROR", "Please review the request and try again."));
    return;
  }

  const statusCode =
    typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;

  // Log redacted internal detail; never send it to clients.
  request.log.error(
    {
      err: {
        message: redactString(error.message),
        code: error.code,
        statusCode,
      },
      requestId,
    },
    "request error",
  );

  if (statusCode >= 500) {
    await reply
      .status(500)
      .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    return;
  }

  await reply
    .status(statusCode)
    .send(safeError("REQUEST_ERROR", "The request could not be completed."));
}
