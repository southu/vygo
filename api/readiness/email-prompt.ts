/**
 * POST /api/readiness/email-prompt — email diagnostic prompt + resume link.
 * Rewritten from POST /v1/readiness/email-prompt via vercel.json.
 *
 * Always proxies to Railway when no local DATABASE_URL (production path), so the
 * outbox is written on the same Postgres the worker drains. Uses existing
 * Resend/outbox stack (mock transport when RESEND_API_KEY is unset).
 */
import {
  proxyEmailPrompt,
  type ReadinessHandlerResult,
} from "../_lib/readiness.js";
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../_lib/http.js";

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

async function handlePost(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const contentType = contentTypeBase(req.headers);
  if (contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }

  const record =
    parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
      ? (parsedBody.value as Record<string, unknown>)
      : {};
  const email =
    typeof record.email === "string" ? record.email.trim().toLowerCase().slice(0, 254) : "";
  const token = typeof record.token === "string" ? record.token.trim().slice(0, 128) : "";
  const prompt = typeof record.prompt === "string" ? record.prompt.slice(0, 50_000) : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "A valid email is required." } },
    };
  }
  if (!token || token.length < 16) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A valid session token is required." },
      },
    };
  }
  if (!prompt || prompt.trim().length < 20) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "prompt is required." } },
    };
  }

  // Always use Railway outbox path so worker delivery (or mock) is consistent.
  return proxyEmailPrompt({ email, token, prompt }, process.env, req.headers);
}

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);

  if (req.method === "OPTIONS") {
    if (origin && allowed) {
      applyBaseHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(204).end();
    return;
  }

  applyBaseHeaders(res, origin && allowed ? origin : null);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  if (origin && !allowed) {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
    return;
  }

  try {
    const result = await handlePost(req);
    if (result.logError) {
      const message =
        result.logError instanceof Error
          ? result.logError.message
          : "readiness email-prompt failed";
      console.error(JSON.stringify({ event: "readiness_email_prompt_edge_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness email-prompt failed";
    console.error(JSON.stringify({ event: "readiness_email_prompt_edge_fatal", message }));
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "128kb",
    },
  },
};
