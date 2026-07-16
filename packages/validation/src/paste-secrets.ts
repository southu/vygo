/**
 * Client-safe high-confidence secret scan for readiness paste-back.
 * Used before any network send. Prefer precision over recall — do not
 * false-block benign discussion of secrets (e.g. "we have an API key").
 */

export type PasteSecretHit = {
  /** 1-based line number in the original paste. */
  line: number;
  /** Pattern family for diagnostics (never include the secret value). */
  kind: "sk_key" | "aws_akia" | "jwt" | "postgres_url" | "private_key" | "secret_assignment";
  /** Start index of the line within the full text (for UI highlighting). */
  lineStart: number;
  /** End index (exclusive) of the line within the full text. */
  lineEnd: number;
};

export type PasteSecretScanResult = {
  clean: boolean;
  hits: PasteSecretHit[];
  /** Unique 1-based line numbers that contain hits. */
  lines: number[];
};

/**
 * High-confidence patterns only. Order is irrelevant; each line is scanned
 * independently so highlighting maps cleanly.
 */
const LINE_PATTERNS: { kind: PasteSecretHit["kind"]; re: RegExp }[] = [
  // OpenAI / Stripe-style sk-… and sk_… keys (incl. sk-test-…, sk_live_…)
  {
    kind: "sk_key",
    re: /\bsk[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}\b/,
  },
  // AWS access key id
  {
    kind: "aws_akia",
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  // JWT (header starts with eyJ = base64 "{" )
  {
    kind: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  // Postgres connection string with embedded credentials
  {
    kind: "postgres_url",
    re: /\bpostgres(?:ql)?:\/\/[^/\s"'`]+:[^@\s"'`]+@/i,
  },
  // PEM private key block header
  {
    kind: "private_key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  },
  // Explicit assignment of long secret-shaped values (not mere mentions)
  {
    kind: "secret_assignment",
    re: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}['"]?/i,
  },
];

function splitLines(text: string): { line: string; start: number; end: number; number: number }[] {
  const out: { line: string; start: number; end: number; number: number }[] = [];
  let start = 0;
  let number = 1;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      const end = i === text.length ? i : i + 1;
      const raw = text.slice(start, i);
      out.push({ line: raw, start, end, number });
      start = end;
      number += 1;
    }
  }
  if (out.length === 0) {
    out.push({ line: "", start: 0, end: 0, number: 1 });
  }
  return out;
}

/**
 * Scan paste text for high-confidence secrets. Returns hits with line numbers
 * for UI highlighting. Never includes matched secret values in the result.
 */
export function scanPasteForSecrets(text: string): PasteSecretScanResult {
  if (!text) {
    return { clean: true, hits: [], lines: [] };
  }
  const hits: PasteSecretHit[] = [];
  const lineSet = new Set<number>();

  for (const { line, start, end, number } of splitLines(text)) {
    for (const { kind, re } of LINE_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        hits.push({ line: number, kind, lineStart: start, lineEnd: end });
        lineSet.add(number);
        break; // one hit per line is enough for UI
      }
    }
  }

  const lines = [...lineSet].sort((a, b) => a - b);
  return { clean: hits.length === 0, hits, lines };
}

/** User-facing block message when secrets are detected. */
export const PASTE_SECRETS_BLOCK_MESSAGE = "Remove secrets before submitting." as const;
