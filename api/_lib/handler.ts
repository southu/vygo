/**
 * Transport-agnostic waitlist intake handler. Returns a status + JSON body only;
 * the Vercel function wraps it with method/CORS/body concerns. Every response is
 * PII- and secret-safe: no connection strings, SQL, stack traces, or credentials
 * ever appear in a body — database errors are collapsed to a generic 500.
 */
import { isHoneypotTripped, parseWaitlist } from "./validation.js";
import type { WaitlistStore } from "./store.js";

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
  /** Server-side-only diagnostic; NEVER included in `body`. */
  logError?: unknown;
};

/** Intake channel recorded on the lead. */
const SOURCE = "web";

const SILENT_SUCCESS_BODY = {
  data: { accepted: true, message: "Your application has been received." },
};

function validationError(fields: Record<string, string>): HandlerResult {
  return {
    status: 400,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message: "Please review the highlighted fields.",
        fields,
      },
    },
  };
}

/**
 * Process a parsed JSON body. `store` is null when no database is configured for
 * the deployment (returns a sanitized 503 rather than a false success).
 */
export async function handleWaitlist(
  store: WaitlistStore | null,
  body: unknown,
): Promise<HandlerResult> {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be a JSON object." } },
    };
  }

  const record = body as Record<string, unknown>;

  // Honeypot: silently accept without persisting, without disclosing the signal.
  if (isHoneypotTripped(record)) {
    return { status: 200, body: SILENT_SUCCESS_BODY };
  }

  const parsed = parseWaitlist(record);
  if (!parsed.ok) {
    return validationError(parsed.fields);
  }

  if (!store) {
    return {
      status: 503,
      body: {
        error: {
          code: "UNAVAILABLE",
          message: "Service temporarily unavailable. Please try again later.",
        },
      },
    };
  }

  try {
    const result = await store.upsert(parsed.value, SOURCE);
    const message = result.inserted
      ? "Your application has been received."
      : "You are already on the vygo waitlist — your details were updated.";
    return {
      status: 200,
      body: {
        data: {
          accepted: true,
          message,
          applicationId: result.id,
          duplicate: !result.inserted,
          marketingConsent: parsed.value.marketingConsent,
        },
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}
