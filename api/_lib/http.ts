/**
 * Minimal Vercel Node function request/response typings and shared HTTP helpers.
 * Typed structurally so no `@vercel/node` dependency is required to build.
 */

export interface EdgeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface EdgeResponse {
  setHeader(name: string, value: string): void;
  status(code: number): EdgeResponse;
  json(body: unknown): EdgeResponse | void;
  send(body?: unknown): EdgeResponse | void;
  end(body?: unknown): void;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Base type of a Content-Type header, lowercased (params stripped). */
export function contentTypeBase(headers: EdgeRequest["headers"]): string {
  const raw = headerValue(headers["content-type"]);
  if (!raw) return "";
  return raw.split(";")[0]!.trim().toLowerCase();
}

/**
 * Allowed browser origins. Defaults to the production marketing domains and can
 * be extended with a comma-separated `ALLOWED_ORIGINS` / `CORS_ORIGINS` env.
 * A request with no Origin header (server-to-server) is always allowed.
 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const defaults = ["https://www.vygo.ai", "https://vygo.ai"];
  const configured = (env.ALLOWED_ORIGINS || env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...defaults, ...configured]);
}

/**
 * Documented vygo Vercel preview-origin policy (mirrors
 * `VERCEL_PREVIEW_ORIGIN_PATTERN` in @vygo/config). Preview deployments are
 * issued on `https://vygo-<deployment|git-branch>-<scope>.vercel.app`. Matching
 * origins are reflected individually — never as a `*` wildcard — while unrelated
 * origins (including non-vygo `*.vercel.app`) receive no permissive ACAO.
 */
const VERCEL_PREVIEW_HOST_RE = /^vygo(?:-[a-z0-9-]+)?\.vercel\.app$/i;

/** True when `origin` is an HTTPS Vercel preview origin for the vygo project. */
export function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    if (url.port) return false;
    return VERCEL_PREVIEW_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

export type OriginDecision = { allowed: boolean; origin: string | null };

export function evaluateOrigin(
  headers: EdgeRequest["headers"],
  allowed: Set<string>,
): OriginDecision {
  const origin = headerValue(headers["origin"]);
  if (!origin) return { allowed: true, origin: null };
  // Exact allowlist (production/configured) OR a documented vygo preview origin.
  return { allowed: allowed.has(origin) || isVercelPreviewOrigin(origin), origin };
}

/**
 * Parse the request body to a JS value. Vercel pre-parses JSON bodies, but we
 * also accept a raw string (parsing it) and guard against malformed input.
 */
export function readJsonBody(req: EdgeRequest): { ok: true; value: unknown } | { ok: false } {
  const { body } = req;
  if (body == null) return { ok: true, value: {} };
  if (typeof body === "string") {
    if (body.trim() === "") return { ok: true, value: {} };
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, value: body };
}
