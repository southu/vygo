/**
 * POST /api/apply — public apply-form intake on the marketing edge (www.vygo.ai).
 *
 * Persistence: Railway Postgres `applications` table. When this edge has a local
 * DATABASE_URL it writes directly; otherwise it proxies server-to-server to the
 * Railway API (which always has the project Postgres). Clients never talk to the
 * database — only this endpoint.
 *
 * Also accepts guide-update email signups on the same path (no heavier anti-bot
 * gate than standard apply — Turnstile is not required on this intake today).
 * Request shape (documented near parseApplyBody in ../_lib/apply.ts):
 *   { "source": "guide_updates", "email": "user@example.com" }
 * Duplicate policy: repeat guide_updates emails insert a NEW row and return
 * friendly success (never "already signed up"). source is set to 'guide_updates'
 * explicitly on insert — never the applications column default of 'apply'.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  guideUpdatesSuccessBody,
  insertApplicationRow,
  parseApplyBody,
  proxyApplyPost,
  resolveDatabaseUrl,
  type ApplyHandlerResult,
} from "../_lib/apply.js";
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../_lib/http.js";

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;

function getSql(url: string): Sql {
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    cachedUrl = url;
  }
  return cachedSql;
}

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

async function handlePost(req: EdgeRequest): Promise<ApplyHandlerResult> {
  try {
    const contentType = contentTypeBase(req.headers);
    if (contentType && contentType !== "application/json") {
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

    const parsed = parseApplyBody(parsedBody.value);
    if (!parsed.ok) {
      return { status: parsed.status, body: parsed.body };
    }

    const url = resolveDatabaseUrl();
    if (!url) {
      // Forward source so upstream Railway sets applications.source explicitly
      // (guide_updates must never fall through to the 'apply' default).
      const upstream = await proxyApplyPost({
        source: parsed.value.source,
        full_name: parsed.value.fullName,
        work_email: parsed.value.workEmail,
        product_url: parsed.value.productUrl,
        message: parsed.value.message,
      });
      // Defense in depth: never echo email/PII for guide_updates even if upstream
      // returned a full applications row (success only after upstream 2xx commit).
      if (
        parsed.value.isGuideUpdates &&
        upstream.status >= 200 &&
        upstream.status < 300
      ) {
        return { status: 200, body: guideUpdatesSuccessBody(), logError: upstream.logError };
      }
      return upstream;
    }

    try {
      const sql = getSql(url);
      // source is taken from parsed.value (guide_updates set explicitly above).
      const row = await insertApplicationRow(sql, parsed.value, parsed.value.source);
      if (parsed.value.isGuideUpdates) {
        // Success only after commit; never echo email / PII for guide opt-ins.
        return { status: 200, body: guideUpdatesSuccessBody() };
      }
      return { status: 201, body: row };
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
  } catch (error) {
    // Body-access / parse failures from the platform must be client errors (4xx),
    // not opaque 500s — malformed JSON is never an insert success path.
    const message = error instanceof Error ? error.message : String(error);
    const looksLikeClientBody =
      /json|body|parse|unexpected token|content-type/i.test(message) ||
      error instanceof SyntaxError;
    if (looksLikeClientBody) {
      return {
        status: 400,
        body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
        logError: error,
      };
    }
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

  if (!allowed) {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
    return;
  }

  try {
    const result = await handlePost(req);
    if (result.logError) {
      const message =
        result.logError instanceof Error ? result.logError.message : "apply post failed";
      console.error(JSON.stringify({ event: "apply_edge_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "apply handler failed";
    console.error(JSON.stringify({ event: "apply_edge_fatal", message }));
    // Platform body-parser failures (invalid JSON) must not become opaque 500s.
    const clientBody =
      error instanceof SyntaxError || /json|body|parse|unexpected token/i.test(message);
    res.status(clientBody ? 400 : 500).json({
      error: {
        code: clientBody ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: clientBody
          ? "Request body must be valid JSON."
          : "An unexpected error occurred. Please try again later.",
      },
    });
  }
}

/** Keep default JSON body parsing; handlers treat parse failures as 4xx. */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64kb",
    },
  },
};
