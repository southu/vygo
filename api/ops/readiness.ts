/**
 * Edge proxy for internal ops readiness routes (single Hobby function).
 *
 *   GET /api/ops/readiness              — list
 *   GET /api/ops/readiness?export=1     — CSV (rewrite from /export)
 *   GET /api/ops/readiness?id=<uuid>    — detail (rewrite from /:id)
 *
 * Rewrites from /v1/ops/* land here. Prefer Railway Fastify (owns Postgres);
 * forward Authorization for the shared ops Basic Auth pattern. Never embeds
 * credentials. Browser traffic is same-origin on www.vygo.ai only.
 */
import {
  evaluateOrigin,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../_lib/http.js";
import { resolveUpstreamApiOrigin } from "../_lib/store.js";

export const config = {
  maxDuration: 30,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type EdgeReqEx = EdgeRequest & {
  query?: Record<string, unknown>;
  url?: string;
};

function queryParam(req: EdgeReqEx, name: string): string {
  const q = req.query ?? {};
  const direct = q[name];
  if (typeof direct === "string" && direct) return direct;
  if (Array.isArray(direct) && typeof direct[0] === "string") return direct[0];
  if (typeof req.url === "string" && req.url.includes("?")) {
    try {
      const u = new URL(req.url, "https://www.vygo.ai");
      return u.searchParams.get(name) || "";
    } catch {
      return "";
    }
  }
  return "";
}

function buildFilterQuery(req: EdgeReqEx): string {
  const params = new URLSearchParams();
  for (const key of ["bucket", "from", "to", "dateFrom", "dateTo", "limit"]) {
    const v = queryParam(req, key).trim();
    if (v) params.set(key, v);
  }
  return params.toString();
}

function resolveRailwayPath(req: EdgeReqEx): string {
  const exportFlag = queryParam(req, "export").trim();
  const id = queryParam(req, "id").trim();
  const qs = buildFilterQuery(req);

  if (exportFlag === "1" || exportFlag.toLowerCase() === "true" || exportFlag === "csv") {
    return `/v1/ops/readiness/export${qs ? `?${qs}` : ""}`;
  }
  if (id && UUID_RE.test(id)) {
    return `/v1/ops/readiness/${encodeURIComponent(id)}`;
  }
  return `/v1/ops/readiness${qs ? `?${qs}` : ""}`;
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

  const railwayPath = resolveRailwayPath(req as EdgeReqEx);
  await proxyOps(method === "HEAD" ? "GET" : method, railwayPath, req, res);
}
