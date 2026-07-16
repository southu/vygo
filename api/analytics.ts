/**
 * POST /api/analytics — first-party privacy-safe analytics beacon.
 * Rewritten from POST /v1/analytics via vercel.json.
 *
 * Accepts only event name + non-PII props. Never stores paste/textarea contents.
 * Intentional no-op sink (204) so client beacons are observable on www.vygo.ai
 * without a third-party analytics vendor.
 */
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "./_lib/http.js";

const ALLOWED_EVENTS = new Set([
  "stage_started",
  "stage_completed",
  "prompt_copied",
  "prompt_emailed",
  "fallback_taken",
  "paste_attempted",
  "secret_scan_blocked",
  "parse_success",
  "parse_normalized",
  "parse_failed",
  "session_resumed",
  "gate_completed",
  "bucket_assigned",
  "cta_clicked",
  "off_ramp_hit",
  "waitlist_form_view",
  "waitlist_step_change",
  "waitlist_validation_failure",
  "waitlist_submit",
  "waitlist_success",
  "waitlist_duplicate",
  "waitlist_failure",
  "availability_view",
  "availability_retry",
]);

const PII_KEY =
  /^(name|fullName|email|phone|telephone|message|description|token|turnstile|password|company|productUrl|role|paste|pasteText|textarea|prompt|body|content|raw)$/i;

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
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

  if (origin && !allowed) {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
    return;
  }

  const contentType = contentTypeBase(req.headers);
  // sendBeacon may omit content-type or use text/plain; still accept JSON body.
  if (contentType && contentType !== "application/json" && contentType !== "text/plain") {
    res.status(415).json({
      error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
    });
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    // Soft-accept malformed beacons so client UX is never blocked.
    res.status(204).end();
    return;
  }

  const body = (parsedBody.value ?? {}) as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event.trim() : "";
  if (!event || !ALLOWED_EVENTS.has(event)) {
    res.status(204).end();
    return;
  }

  // Drop any PII-shaped keys if a client misbehaves; never log free-text values.
  const propsIn =
    body.props && typeof body.props === "object" && !Array.isArray(body.props)
      ? (body.props as Record<string, unknown>)
      : {};
  const props: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(propsIn)) {
    if (PII_KEY.test(k)) continue;
    if (typeof v === "string" && v.length > 120) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      props[k] = v;
    }
  }

  // Structured log only — no paste contents, no long free text.
  console.info(
    JSON.stringify({
      event: "vygo_analytics",
      name: event,
      props,
      ts: typeof body.ts === "number" ? body.ts : Date.now(),
    }),
  );

  res.status(204).end();
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8kb",
    },
  },
};
