/**
 * Server-side redaction using the SAME high-confidence patterns as
 * scanPasteForSecrets. Replaces secret-shaped spans with [REDACTED] so pastes
 * can be accepted, stored, and (optionally) sent to an LLM safely.
 *
 * Never logs or returns the original secret value.
 */
import { scanPasteForSecrets, type PasteSecretScanResult } from "./paste-secrets.js";

export const REDACTED_PLACEHOLDER = "[REDACTED]" as const;

export type PasteRedactionResult = {
  /** Text with secret-shaped spans replaced by [REDACTED]. */
  redacted: string;
  /** Whether any redaction was applied. */
  didRedact: boolean;
  /** Scan result (hit kinds + line numbers only — never secret values). */
  scan: PasteSecretScanResult;
  /** Number of replacement operations performed. */
  replacementCount: number;
};

/**
 * Redact high-confidence secret patterns from paste text.
 * Prefer span replacement over whole-line wipe so surrounding context remains.
 */
export function redactPasteSecrets(text: string): PasteRedactionResult {
  if (!text) {
    return {
      redacted: text,
      didRedact: false,
      scan: { clean: true, hits: [], lines: [] },
      replacementCount: 0,
    };
  }

  const scan = scanPasteForSecrets(text);
  let out = text;
  let replacementCount = 0;

  // Apply the same families as scanPasteForSecrets, as global replacements.
  const replacements: RegExp[] = [
    /\bsk[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    /\bpostgres(?:ql)?:\/\/[^/\s"'`]+:[^@\s"'`]+@[^\s"'`]*/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
    /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}['"]?/gi,
    // Additional durable redactions (also covered by @vygo/db redactSensitivePaste)
    /\bBearer\s+[A-Za-z0-9._\-+=/]+/gi,
    /\bghp_[A-Za-z0-9]{20,}/g,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    /\bsk_(?:live|test)_[A-Za-z0-9]+/g,
  ];

  for (const re of replacements) {
    const before = out;
    out = out.replace(re, (match) => {
      // Preserve assignment prefix when present so structure stays readable.
      const assign = match.match(
        /^((?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*)/i,
      );
      if (assign?.[1]) {
        replacementCount += 1;
        return `${assign[1]}${REDACTED_PLACEHOLDER}`;
      }
      if (/^Bearer\s+/i.test(match)) {
        replacementCount += 1;
        return `Bearer ${REDACTED_PLACEHOLDER}`;
      }
      if (/^postgres/i.test(match)) {
        replacementCount += 1;
        return match.replace(/\/\/[^/\s"'`]+/, `//${REDACTED_PLACEHOLDER}`);
      }
      replacementCount += 1;
      return REDACTED_PLACEHOLDER;
    });
    if (out !== before && replacementCount === 0) {
      // replace ran but counter missed — still mark as redacted
      replacementCount += 1;
    }
  }

  const didRedact = out !== text || !scan.clean;
  // If scan found hits but regex missed (edge), wipe hit lines as last resort.
  if (!scan.clean && out.includes(text.slice(0, Math.min(40, text.length))) && out === text) {
    const lines = text.split(/\n/);
    const hitSet = new Set(scan.lines);
    out = lines.map((line, idx) => (hitSet.has(idx + 1) ? REDACTED_PLACEHOLDER : line)).join("\n");
    replacementCount = Math.max(replacementCount, scan.hits.length);
  }

  return {
    redacted: out,
    didRedact: didRedact || out !== text,
    scan,
    replacementCount,
  };
}

/**
 * Assert a value does not contain the planted secret (for tests / response checks).
 */
export function assertNoSecretLeak(haystack: string, secret: string): boolean {
  if (!secret) return true;
  return !haystack.includes(secret);
}
