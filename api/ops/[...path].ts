/**
 * Edge proxy for internal ops routes (Hobby function budget: one catch-all).
 *
 *   GET /api/ops/readiness
 *   GET /api/ops/readiness/export
 *   GET /api/ops/readiness/:id
 *
 * Rewrites from /v1/ops/* land here. Prefer Railway Fastify (owns Postgres);
 * forward Authorization for the shared ops Basic Auth pattern. Never embeds
 * credentials. Browser traffic is same-origin on www.vygo.ai only.
 */
import {
  contentTypeBase,
  evaluateOrigin,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../_lib/http.js";
import { resolveUpstreamApiOrigin } from "../_lib/store.js";

export const config = {
  maxDuration: 30,
};

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function applyCors(req: EdgeRequest, res: EdgeResponse): boolean {
  const allowed = resolveAllowedOrigins(process.env);
  const decision = evaluateOrigin(req.headers, allowed);
  if (decision.origin && decision.allowed) {
    res.setHeader("Access-Control-Allow-Origin", decision.origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Request-Id, If-None-Match, Idempotency-Key",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS, HEAD");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  return decision.allowed || !decision.origin;
}

function unauthorized(res: EdgeResponse, message: string) {
  res.setHeader("WWW-Authenticate", 'Basic realm="Vygo Ops", charset="UTF-8"');
  res.setHeader("Cache-Control", "no-store");
  return res.status(401).json({
    error: { code: "UNAUTHORIZED", message },
  });
}

async function proxyOps(
  method: string,
  path: string,
  req: EdgeRequest,
  res: EdgeResponse,
): Promise<void> {
  const auth = headerValue(req.headers["authorization"]);
  if (!auth || !auth.startsWith("Basic ")) {
    unauthorized(res, "Authentication required.");
    return;
  }

  const origin = resolveUpstreamApiOrigin(process.env);
  const headers: Record<string, string> = {
    accept: headerValue(req.headers["accept"]) || "application/json",
    authorization: auth,
  };
  const requestId = headerValue(req.headers["x-request-id"]);
  if (requestId) headers["x-request-id"] = requestId;

  try {
    const upstream = await fetch(`${origin}${path}`, {
      method,
      headers,
      cache: "no-store",
    });

    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);
    const wwwAuth = upstream.headers.get("www-authenticate");
    if (wwwAuth) res.setHeader("WWW-Authenticate", wwwAuth);
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) res.setHeader("Content-Disposition", disposition);

    if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
      const text = await upstream.text();
      res.status(upstream.status).send(text);
      return;
    }

    let payload: unknown = {};
    try {
      payload = await upstream.json();
    } catch {
      payload = {
        error: {
          code: "UPSTREAM_ERROR",
          message: "Upstream returned a non-JSON response.",
        },
      };
    }
    res.status(upstream.status).json(payload);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: {
        code: "UNAVAILABLE",
        message: "Service temporarily unavailable. Please try again later.",
      },
    });
  }
}

/**
 * Vercel catch-all: query.params.path is string | string[].
 * Map to Railway paths under /v1/ops/readiness...
 */
export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  applyCors(req, res);
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
    });
    return;
  }

  // Vercel dynamic catch-all provides path as string[] on the query object.
  const rawPath = (req as EdgeRequest & { query?: Record<string, unknown> }).query?.path;
  const segments = Array.isArray(rawPath)
    ? rawPath.map(String)
    : typeof rawPath === "string"
      ? [rawPath]
      : [];

  // Expected: readiness | readiness/export | readiness/<uuid>
  if (segments.length === 0 || segments[0] !== "readiness") {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Ops route not found." },
    });
    return;
  }

  // Reconstruct query string (filters) without the path param.
  const q = (req as EdgeRequest & { query?: Record<string, unknown> }).query ?? {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (key === "path") continue;
    if (typeof value === "string" && value) params.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === "string") params.set(key, value[0]);
  }
  const qs = params.toString();
  const suffix = segments.slice(1).map(encodeURIComponent).join("/");
  const railwayPath =
    suffix.length > 0
      ? `/v1/ops/readiness/${suffix}${qs ? `?${qs}` : ""}`
      : `/v1/ops/readiness${qs ? `?${qs}` : ""}`;

  // Content-type gate: ops is GET-only JSON/CSV; reject non-empty JSON bodies.
  const ct = contentTypeBase(req.headers);
  if (ct && ct !== "application/json" && ct !== "text/plain" && ct !== "application/x-www-form-urlencoded") {
    // Allow empty / missing content-type for GET.
  }

  await proxyOps(method === "HEAD" ? "GET" : method, railwayPath, req, res);
}
