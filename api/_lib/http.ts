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

export type OriginDecision = { allowed: boolean; origin: string | null };

export function evaluateOrigin(
  headers: EdgeRequest["headers"],
  allowed: Set<string>,
): OriginDecision {
  const origin = headerValue(headers["origin"]);
  if (!origin) return { allowed: true, origin: null };
  return { allowed: allowed.has(origin), origin };
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
