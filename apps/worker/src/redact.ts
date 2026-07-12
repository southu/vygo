/**
 * Structured log redaction for the email worker.
 * Never log raw secrets, authorization headers, email bodies, or applicant messages.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const CONNECTION_STRING_RE = /(postgres(?:ql)?:\/\/)([^:\s]+):([^@\s]+)@/gi;
const API_KEY_RE = /\b(re_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9+/=]{8,})\b/g;

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "email",
  "recipient",
  "to",
  "from",
  "html",
  "text",
  "body",
  "message",
  "payload",
  "resend_api_key",
  "api_key",
  "apikey",
  "database_url",
  "redis_url",
  "webhook_secret",
  "signing_secret",
  "full_name",
  "fullname",
  "content",
]);

export function redactString(input: string): string {
  return input
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(CONNECTION_STRING_RE, "$1$2:[REDACTED]@")
    .replace(API_KEY_RE, "[REDACTED_SECRET]");
}

export function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase()) || k.toLowerCase().includes("secret")) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return String(value);
}

export function safeLog(
  level: "info" | "warn" | "error" | "debug",
  fields: Record<string, unknown>,
  msg: string,
): void {
  const line = JSON.stringify({
    level,
    time: Date.now(),
    service: "vygo-worker",
    ...(redactValue(fields) as Record<string, unknown>),
    msg: redactString(msg),
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Deterministic suite for secret-redaction acceptance. */
export function runSecretRedactionSuite(): {
  ready: boolean;
  results: Array<{ name: string; pass: boolean; detail?: string }>;
} {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const record = (name: string, pass: boolean, detail?: string) =>
    results.push({ name, pass, detail });

  const sample = redactValue({
    event: "delivery",
    email: "applicant@example.com",
    html: "<p>secret body</p>",
    text: "plain body with applicant@example.com",
    authorization: "Bearer re_live_abc1234567890",
    resend_api_key: "re_live_abc1234567890",
    message: "I am an applicant message",
    jobId: "job-1",
    kind: "applicant_confirmation",
  }) as Record<string, unknown>;

  record(
    "redacts_email_and_bodies",
    sample.email === "[REDACTED]" &&
      sample.html === "[REDACTED]" &&
      sample.text === "[REDACTED]" &&
      sample.message === "[REDACTED]",
  );
  record(
    "redacts_secrets_and_auth",
    sample.authorization === "[REDACTED]" && sample.resend_api_key === "[REDACTED]",
  );
  record(
    "preserves_safe_fields",
    sample.jobId === "job-1" && sample.kind === "applicant_confirmation",
  );

  const str = redactString(
    "send to user@example.com with key re_live_abcdefghijklmnopqrst and postgres://u:secret@host/db",
  );
  record(
    "redacts_string_patterns",
    !str.includes("user@example.com") &&
      !str.includes("re_live_abcdefghijklmnopqrst") &&
      str.includes("[REDACTED") &&
      !str.includes(":secret@"),
  );

  return { ready: results.every((r) => r.pass), results };
}
