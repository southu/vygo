import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend webhooks are delivered via Svix.
 * Headers: svix-id, svix-timestamp, svix-signature (comma-separated v1,base64 sigs).
 * Secret: whsec_<base64>
 *
 * signed_content = `${msg_id}.${timestamp}.${body}`
 * expected = base64(hmac_sha256(secret_bytes, signed_content))
 */

export type ResendSignatureHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export function parseResendSignatureHeaders(
  headers: Record<string, string | string[] | undefined>,
): ResendSignatureHeaders | null {
  const get = (name: string): string | null => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" ? v : null;
  };

  const id = get("svix-id") ?? get("webhook-id");
  const timestamp = get("svix-timestamp") ?? get("webhook-timestamp");
  const signature = get("svix-signature") ?? get("webhook-signature");
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}

export function decodeWebhookSecret(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return Buffer.from(raw, "utf8");
  }
}

export type VerifyResendSignatureResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_headers" | "missing_secret" | "timestamp_skew" | "invalid_signature";
    };

/**
 * Verify a Resend/Svix webhook signature.
 * @param toleranceSeconds default 300s clock skew window
 */
export function verifyResendSignature(options: {
  secret: string | null | undefined;
  headers: ResendSignatureHeaders | null;
  rawBody: string | Buffer;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): VerifyResendSignatureResult {
  if (!options.secret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!options.headers) {
    return { ok: false, reason: "missing_headers" };
  }

  const ts = Number(options.headers.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid_signature" };
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? 300;
  if (Math.abs(now - ts) > tolerance) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const body =
    typeof options.rawBody === "string" ? options.rawBody : options.rawBody.toString("utf8");
  const signedContent = `${options.headers.id}.${options.headers.timestamp}.${body}`;
  const key = decodeWebhookSecret(options.secret);
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  const parts = options.headers.signature.split(/\s+/);
  for (const part of parts) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return { ok: true };
      }
    } catch {
      // continue
    }
  }
  return { ok: false, reason: "invalid_signature" };
}

/** Build a valid test signature (for test-support / integration tests only). */
export function signResendWebhook(options: {
  secret: string;
  id: string;
  timestamp: string | number;
  rawBody: string;
}): string {
  const key = decodeWebhookSecret(options.secret);
  const ts = String(options.timestamp);
  const signedContent = `${options.id}.${ts}.${options.rawBody}`;
  const sig = createHmac("sha256", key).update(signedContent).digest("base64");
  return `v1,${sig}`;
}

/** Default non-production webhook secret (not a real Resend secret). */
export const TEST_RESEND_WEBHOOK_SECRET =
  "whsec_" + Buffer.from("vygo-local-test-webhook-secret-v1").toString("base64");
