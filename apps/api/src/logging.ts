/**
 * Structured logging helpers with PII redaction.
 * Never log email addresses, tokens, raw credentials, or SQL with parameters.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const PASSWORD_IN_URL_RE = /:\/\/([^:/\s]+):([^@/\s]+)@/g;
const CONNECTION_STRING_RE = /(postgres(?:ql)?:\/\/)([^:\s]+):([^@\s]+)@/gi;

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "email",
  "resend_api_key",
  "resend_webhook_secret",
  "webhook_secret",
  "database_url",
  "redis_url",
  "turnstile_secret_key",
  "ip",
  "ip_hash",
  "full_name",
  "fullname",
  "html",
  "text",
  "message",
  "body",
]);

export function redactString(input: string): string {
  return input
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(PASSWORD_IN_URL_RE, "://$1:[REDACTED]@")
    .replace(CONNECTION_STRING_RE, "$1$2:[REDACTED]@");
}

export function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return String(value);
}

export function buildLoggerOptions(level: string) {
  return {
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.email",
        "req.body.fullName",
        "req.body.turnstileToken",
        "DATABASE_URL",
        "password",
      ],
      censor: "[REDACTED]",
    },
  };
}
