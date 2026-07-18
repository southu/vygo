/**
 * POST /api/apply — public apply-form intake on the marketing edge (www.vygo.ai).
 *
 * Persistence: Railway Postgres `applications` table. When this edge has a local
 * DATABASE_URL it writes directly; otherwise it proxies server-to-server to the
 * Railway API (which always has the project Postgres). Clients never talk to the
 * database — only this endpoint.
 *
 * Also accepts guide-update email signups on the same path. Turnstile is not
 * required here — missing/invalid turnstileToken is ignored the same way as for
 * ordinary apply (no TURNSTILE_FAILED gate on this route).
 * Request shape (documented near parseApplyBody in ../_lib/apply.ts):
 *   { "source": "guide_updates", "email": "user@example.com" }
 * Duplicate policy: repeat guide_updates emails insert a NEW row and return
 * friendly success (never "already signed up"). source is set to 'guide_updates'
 * explicitly on insert — never the applications column default of 'apply'.
 * Success is HTTP 201 with a record-shaped body (parity with ordinary apply);
 * work_email is always redacted so the submitted address is never echoed.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  GUIDE_UPDATES_FULL_NAME,
  GUIDE_UPDATES_SOURCE,
  guideUpdatesSuccessBody,
  handleApplyIntake,
  insertApplicationRow,
  parseApplyBody,
  proxyApplyPost,
  resolveDatabaseUrl,
  scrubGuideUpdatesResponse,
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

/**
 * Finalize a guide_updates response: keep 201 record-shaped success (no email),
 * scrub error/upstream bodies. Never echoes the submitted email.
 */
function finalizeGuideUpdates(result: ApplyHandlerResult, email: string): ApplyHandlerResult {
  if (result.status >= 200 && result.status < 300) {
    // Prefer an upstream/local record body already shaped by handleApplyIntake /
    // guideUpdatesSuccessBody; re-apply redaction if a full row leaked through.
    const body = scrubGuideUpdatesResponse(
      result.body.id != null || result.body.source != null
        ? {
            id: result.body.id ?? null,
            full_name: result.body.full_name ?? GUIDE_UPDATES_FULL_NAME,
            work_email: null,
            product_url: result.body.product_url ?? null,
            message: result.body.message ?? null,
            source: result.body.source ?? GUIDE_UPDATES_SOURCE,
            created_at: result.body.created_at ?? null,
          }
        : guideUpdatesSuccessBody(),
      email,
    );
    // Force work_email null even if scrub left a placeholder.
    body.work_email = null;
    return { status: 201, body, logError: result.logError };
  }
  return {
    status: result.status,
    body: scrubGuideUpdatesResponse(result.body, email),
    logError: result.logError,
  };
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

    // Validation before any insert/proxy. Invalid guide_updates never reach persist.
    // handleApplyIntake re-validates; this precheck also enables the no-DB proxy path
    // to skip the network when the body is already invalid.
    const precheck = parseApplyBody(parsedBody.value);
    if (!precheck.ok) {
      return { status: precheck.status, body: precheck.body };
    }

    const url = resolveDatabaseUrl();
    if (!url) {
      // Proxy to Railway with explicit source (guide_updates never uses 'apply' default).
      const upstream = await proxyApplyPost({
        source: precheck.value.source ?? GUIDE_UPDATES_SOURCE,
        full_name: precheck.value.fullName,
        work_email: precheck.value.workEmail,
        product_url: precheck.value.productUrl,
        message: precheck.value.message,
      });
      if (precheck.value.isGuideUpdates) {
        // Soft-succeed unique/duplicate wording from upstream for insert-again policy.
        if (upstream.status >= 400 && /unique|duplicate/i.test(JSON.stringify(upstream.body))) {
          return {
            status: 201,
            body: guideUpdatesSuccessBody(),
            logError: upstream.logError,
          };
        }
        return finalizeGuideUpdates(upstream, precheck.value.workEmail);
      }
      return upstream;
    }

    const sql = getSql(url);
    // handleApplyIntake: validate → insert (source from value); unique soft-success
    // for guide_updates; PII-free success body.
    const result = await handleApplyIntake(parsedBody.value, {
      async insert(value) {
        return insertApplicationRow(sql, value, value.source);
      },
    });

    if (precheck.value.isGuideUpdates) {
      return finalizeGuideUpdates(result, precheck.value.workEmail);
    }
    return result;
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
