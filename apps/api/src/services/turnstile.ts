import { CLOUDFLARE_TURNSTILE_TEST_SECRETS, type ApiEnv } from "@vygo/config";

export type TurnstileVerifyResult = {
  success: boolean;
  /** Machine-safe reason code; never includes the token. */
  reason?: "missing" | "invalid" | "failed" | "network" | "not_configured";
};

export type TurnstileVerifier = {
  verify(
    token: string | undefined | null,
    remoteIp?: string | null,
  ): Promise<TurnstileVerifyResult>;
};

/**
 * Dependency-injected always-pass verifier for unit tests.
 * Must never be selected from request fields — only via app construction.
 */
export class PassThroughTurnstileVerifier implements TurnstileVerifier {
  async verify(token: string | undefined | null): Promise<TurnstileVerifyResult> {
    if (!token || token.trim() === "") return { success: false, reason: "missing" };
    return { success: true };
  }
}

/**
 * Dependency-injected always-fail verifier for negative tests.
 */
export class RejectTurnstileVerifier implements TurnstileVerifier {
  async verify(token: string | undefined | null): Promise<TurnstileVerifyResult> {
    if (!token || token.trim() === "") return { success: false, reason: "missing" };
    return { success: false, reason: "failed" };
  }
}

/**
 * Cloudflare Turnstile server-side verification.
 * Uses official test-key behavior when secret is a Cloudflare test secret;
 * never honors request-level bypass flags.
 */
export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(
    private readonly secretKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(
    token: string | undefined | null,
    remoteIp?: string | null,
  ): Promise<TurnstileVerifyResult> {
    if (!token || typeof token !== "string" || token.trim() === "") {
      return { success: false, reason: "missing" };
    }

    const secret = this.secretKey;
    if (!secret) {
      // Misconfiguration — fail closed except when intentionally using DI pass-through.
      return { success: false, reason: "not_configured" };
    }

    // Official Cloudflare test secrets (local/CI). Behavior is server-config only.
    if (secret === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses) {
      return { success: true };
    }
    if (secret === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysBlocks) {
      return { success: false, reason: "failed" };
    }
    if (secret === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alreadySpent) {
      return { success: false, reason: "invalid" };
    }

    try {
      const body = new URLSearchParams();
      body.set("secret", secret);
      body.set("response", token);
      if (remoteIp) body.set("remoteip", remoteIp);

      const res = await this.fetchImpl(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        },
      );
      if (!res.ok) return { success: false, reason: "network" };
      const data = (await res.json()) as { success?: boolean };
      if (data.success === true) return { success: true };
      return { success: false, reason: "failed" };
    } catch {
      return { success: false, reason: "network" };
    }
  }
}

export function createTurnstileVerifier(
  env: Pick<ApiEnv, "TURNSTILE_SECRET_KEY" | "NODE_ENV">,
  override?: TurnstileVerifier | null,
): TurnstileVerifier {
  if (override) return override;
  return new CloudflareTurnstileVerifier(env.TURNSTILE_SECRET_KEY);
}
