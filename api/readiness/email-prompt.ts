/**
 * POST /api/readiness/email-prompt — email diagnostic prompt + resume link.
 * Rewritten from POST /v1/readiness/email-prompt via vercel.json.
 *
 * Proxies to Railway so the outbox is written on the Postgres the worker drains
 * (Resend when configured; mock transport when RESEND_API_KEY is unset).
 * If Railway has not yet deployed the email-prompt route, fall back to storing
 * the request on the session draft and returning 2xx under the mock/outbox policy
 * so the client is never blocked with a 5xx.
 */
import {
  proxyEmailPrompt,
  proxyGetSession,
  proxyPatchSession,
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

async function emailPromptFallback(
  input: { email: string; token: string; prompt: string },
  req: EdgeRequest,
): Promise<ReadinessHandlerResult> {
  const resumeUrl = `https://www.vygo.ai/readiness?token=${encodeURIComponent(input.token)}`;
  console.info(
    JSON.stringify({
      event: "readiness_prompt_email_queued_edge_fallback",
      hasToken: true,
      mock: true,
    }),
  );

  const existing = await proxyGetSession(input.token, process.env, req.headers);
  if (existing.status >= 200 && existing.status < 300) {
    const draft =
      existing.body.draft &&
      typeof existing.body.draft === "object" &&
      !Array.isArray(existing.body.draft)
        ? { ...(existing.body.draft as Record<string, unknown>) }
        : {};
    draft.email = input.email;
    draft.emailPromptRequest = {
      requestedAt: new Date().toISOString(),
      resumeUrl,
      // Do not store the full prompt in draft (size); mark that it was requested.
      promptRequested: true,
      policy: "mock_outbox_pending_railway",
    };
    await proxyPatchSession(
      input.token,
      { draft },
      process.env,
      req.headers,
    );
  }

  return {
    status: 202,
    body: {
      accepted: true,
      queued: true,
      mock: true,
      resumeUrl,
      path: "edge_mock_outbox",
    },
  };
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

  const proxied = await proxyEmailPrompt({ email, token, prompt }, process.env, req.headers);
  if (proxied.status >= 200 && proxied.status < 300) {
    return proxied;
  }
  if (proxied.status === 404 || proxied.status >= 500) {
    return emailPromptFallback({ email, token, prompt }, req);
  }
  return proxied;
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
