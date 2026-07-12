/**
 * Exponential backoff with full jitter bounds for outbox retries.
 *
 * delay = min(maxMs, baseMs * 2^(attempt-1)) * (1 + jitter)
 * where jitter ∈ [-jitterRatio, +jitterRatio]
 */

export type BackoffOptions = {
  baseMs?: number;
  maxMs?: number;
  /** Half-width of multiplicative jitter (default 0.2 → ±20%). */
  jitterRatio?: number;
  /** Inject RNG for deterministic tests. */
  random?: () => number;
};

export const DEFAULT_BACKOFF_BASE_MS = 1_000;
export const DEFAULT_BACKOFF_MAX_MS = 60 * 60 * 1_000;
export const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;
export const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Compute delay until next attempt given the *current* attemptCount after claim
 * (i.e. attemptCount is already incremented).
 */
export function computeRetryDelayMs(attemptCount: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxMs = options.maxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_BACKOFF_JITTER_RATIO;
  const random = options.random ?? Math.random;

  const exp = Math.max(0, attemptCount - 1);
  const uncapped = baseMs * 2 ** exp;
  const capped = Math.min(maxMs, uncapped);
  // jitter in [-ratio, +ratio]
  const jitter = (random() * 2 - 1) * jitterRatio;
  const withJitter = Math.round(capped * (1 + jitter));
  return Math.max(0, Math.min(maxMs, withJitter));
}

/** Inclusive bounds for delay at a given attempt (for tests / diagnostics). */
export function retryDelayBoundsMs(
  attemptCount: number,
  options: Omit<BackoffOptions, "random"> = {},
): { minMs: number; maxMs: number; nominalMs: number } {
  const baseMs = options.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxMs = options.maxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_BACKOFF_JITTER_RATIO;
  const exp = Math.max(0, attemptCount - 1);
  const nominalMs = Math.min(maxMs, baseMs * 2 ** exp);
  const minMs = Math.max(0, Math.floor(nominalMs * (1 - jitterRatio)));
  const maxBound = Math.min(maxMs, Math.ceil(nominalMs * (1 + jitterRatio)));
  return { minMs, maxMs: maxBound, nominalMs };
}

export function shouldDeadLetter(
  attemptCount: number,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): boolean {
  return attemptCount >= maxAttempts;
}
