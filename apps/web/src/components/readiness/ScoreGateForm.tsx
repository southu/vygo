"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { readinessContent } from "@/content/readiness";
import { trackAnalytics } from "@/lib/analytics";
import { scoreReadiness, type ScoreResponse } from "@/lib/readiness/api";
import { AssessmentProgress } from "@/components/readiness/AssessmentProgress";
import { AnswerCallout } from "@/components/readiness/AnswerCallout";

/** Cloudflare always-pass test sitekey when env unset (same as waitlist). */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
/** Cloudflare always-pass dummy response token (paired with test sitekey/secret). */
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function resolveTurnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || TURNSTILE_TEST_SITE_KEY;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Detect automation / E2E mode for readiness gate only.
 * Activated by ?e2e=1 or ?automation=1 on the readiness URL (or window flag).
 * Does not weaken production Turnstile for normal prospects.
 */
function detectReadinessE2E(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const e2e = params.get("e2e")?.trim().toLowerCase();
    const automation = params.get("automation")?.trim().toLowerCase();
    if (e2e === "1" || e2e === "true" || automation === "1" || automation === "true") {
      return true;
    }
  } catch {
    /* ignore */
  }
  // Optional in-page flag set by Playwright before gate submit.
  const w = window as Window & { __VYGO_READINESS_E2E__?: boolean };
  return w.__VYGO_READINESS_E2E__ === true;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type ScoreGateFormProps = {
  token: string;
  initialEmail?: string;
  source?: string;
  onScored: (result: ScoreResponse) => void;
  /** Optional flow progress (main paste path or manual path). */
  progressCurrent?: number;
  progressTotal?: number;
};

/**
 * Email gate before scored results. Reuses site Turnstile (no new CAPTCHA).
 * Requires name, email, privacy consent.
 *
 * With ?e2e=1 (or ?automation=1), the form uses the official Cloudflare dummy
 * token + readinessE2E flag so Playwright can complete a real scored snapshot
 * without a human solving production Turnstile. Server still requires
 * e2e-test+*@vygo.ai email — real users are unaffected.
 */
export function ScoreGateForm({
  token,
  initialEmail = "",
  source,
  onScored,
  progressCurrent,
  progressTotal,
}: ScoreGateFormProps) {
  const c = readinessContent.gate;
  // Client-only: query string is available after mount (static export safe).
  const [readinessE2E, setReadinessE2E] = useState(false);

  const e2eEmailDefault = useMemo(
    () => `e2e-test+gate-${Date.now().toString(36)}@vygo.ai`,
    [],
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [company, setCompany] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "already_submitted">("idle");
  const [feedback, setFeedback] = useState("");

  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  /** Synchronous double-submit guard (state alone can race before re-render). */
  const inFlightRef = useRef(false);
  const siteKey = readinessE2E ? TURNSTILE_TEST_SITE_KEY : resolveTurnstileSiteKey();

  useEffect(() => {
    const enabled = detectReadinessE2E();
    setReadinessE2E(enabled);
    if (!enabled) return;
    setName((prev) => prev || "Ratchet E2E Test");
    setEmail((prev) => {
      if (prev && /^e2e-test\+/i.test(prev)) return prev;
      if (initialEmail && /^e2e-test\+/i.test(initialEmail)) return initialEmail;
      return e2eEmailDefault;
    });
    setCompany((prev) => prev || "Vygo E2E");
    setPrivacyAccepted(true);
    setTurnstileToken(TURNSTILE_TEST_TOKEN);
    setTurnstileFailed(false);
  }, [e2eEmailDefault, initialEmail]);

  useEffect(() => {
    // E2E automation: skip Cloudflare widget (headless never issues a token).
    if (readinessE2E) {
      setTurnstileToken(TURNSTILE_TEST_TOKEN);
      setTurnstileFailed(false);
      return;
    }

    let cancelled = false;
    const mount = () => {
      if (cancelled || !turnstileContainerRef.current || !window.turnstile) return;
      if (turnstileWidgetIdRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          /* ignore */
        }
        turnstileWidgetIdRef.current = null;
      }
      turnstileContainerRef.current.innerHTML = "";
      try {
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          callback: (t) => {
            setTurnstileToken(t);
            setTurnstileFailed(false);
          },
          "error-callback": () => {
            setTurnstileFailed(true);
            setTurnstileToken("");
          },
          "expired-callback": () => setTurnstileToken(""),
          theme: "light",
        });
      } catch {
        setTurnstileFailed(true);
      }
    };

    if (window.turnstile) {
      mount();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      );
      if (existing) {
        existing.addEventListener("load", mount);
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = mount;
        script.onerror = () => setTurnstileFailed(true);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [siteKey, readinessE2E]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // Double-click / replayed submit: one in-flight request only.
    if (inFlightRef.current || status === "submitting" || status === "already_submitted") {
      return;
    }

    const next: Partial<Record<string, string>> = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!email.trim() || !isEmail(email.trim())) next.email = "A valid email is required.";
    if (!privacyAccepted) next.privacyAccepted = "Privacy consent is required.";
    if (!turnstileToken) {
      next.turnstileToken = "Complete the verification challenge.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setStatus("error");
      setFeedback(c.error);
      return;
    }

    inFlightRef.current = true;
    setStatus("submitting");
    setFeedback("");
    try {
      const result = await scoreReadiness({
        token,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company.trim() || undefined,
        privacyAccepted: true,
        turnstileToken,
        source,
        readinessE2E: readinessE2E || undefined,
      });
      trackAnalytics("gate_completed", { ok: true });
      if (result.bucket) {
        trackAnalytics("bucket_assigned", { bucket: result.bucket });
      }
      if (result.alreadySubmitted) {
        setStatus("already_submitted");
        setFeedback(readinessContent.snapshot.alreadySubmitted);
      }
      // Keep inFlight true through navigation so a second click cannot re-score.
      onScored(result);
    } catch (err) {
      inFlightRef.current = false;
      const e = err as Error & { fields?: Record<string, string>; code?: string };
      if (e.fields) setErrors(e.fields);
      setFeedback(e.message || c.error);
      setStatus("error");
      if (!readinessE2E && turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } catch {
          /* ignore */
        }
        setTurnstileToken("");
      }
    }
  };

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-border bg-canvas px-3 py-2.5 text-sm text-ink shadow-sm focus-visible:border-purple";

  const gateBits = [
    name.trim() ? `Name: ${name.trim()}` : null,
    email.trim() ? `Email: ${email.trim()}` : null,
    company.trim() ? `Company: ${company.trim()}` : null,
  ].filter(Boolean) as string[];
  const gateCallout =
    gateBits.length > 0
      ? {
          id: "gate-contact",
          text: `Got it — ${gateBits.join(" · ")}.`,
        }
      : null;

  const showProgress =
    typeof progressCurrent === "number" &&
    typeof progressTotal === "number" &&
    progressTotal > 0;

  return (
    <div
      className="readiness-assessment mt-8"
      data-testid="readiness-score-gate"
      data-readiness-e2e={readinessE2E ? "1" : "0"}
    >
      {showProgress ? (
        <AssessmentProgress
          current={progressCurrent!}
          total={progressTotal!}
          label="Results gate"
        />
      ) : (
        <AssessmentProgress current={1} total={1} label="Results gate" />
      )}
      <p className="eyebrow mt-4">{c.progressLabel}</p>
      <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {c.title}
      </h2>
      <p className="mt-3 text-sm text-muted sm:text-base">{c.body}</p>

      <form
        className="readiness-step-panel mt-6 space-y-4"
        onSubmit={(e) => void onSubmit(e)}
        noValidate
      >
        <div>
          <label htmlFor="gate-name" className="text-sm font-medium text-ink">
            {c.nameLabel} <span className="text-red">*</span>
          </label>
          <input
            id="gate-name"
            name="name"
            type="text"
            autoComplete="name"
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={c.namePlaceholder}
            required
            data-testid="gate-name"
          />
          {errors.name ? (
            <p className="mt-1 text-xs text-red" data-field-error="name">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="gate-email" className="text-sm font-medium text-ink">
            {c.emailLabel} <span className="text-red">*</span>
          </label>
          <input
            id="gate-email"
            name="email"
            type="email"
            autoComplete="email"
            className={fieldClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={c.emailPlaceholder}
            required
            data-testid="gate-email"
          />
          {errors.email ? (
            <p className="mt-1 text-xs text-red" data-field-error="email">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="gate-company" className="text-sm font-medium text-ink">
            {c.companyLabel}
          </label>
          <input
            id="gate-company"
            name="company"
            type="text"
            autoComplete="organization"
            className={fieldClass}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={c.companyPlaceholder}
            data-testid="gate-company"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-ink-soft" htmlFor="gate-privacy">
          <input
            id="gate-privacy"
            name="privacyAccepted"
            type="checkbox"
            className="mt-1"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            required
            data-testid="gate-privacy"
          />
          <span>
            {c.privacyLabel}{" "}
            <a href="/privacy" className="font-semibold text-purple underline">
              Privacy Policy
            </a>
            . <span className="text-red">*</span>
          </span>
        </label>
        {errors.privacyAccepted ? (
          <p className="text-xs text-red" data-field-error="privacyAccepted">
            {errors.privacyAccepted}
          </p>
        ) : null}

        <div data-testid="turnstile-region">
          <p className="text-sm font-medium text-ink">Verification</p>
          {readinessE2E ? (
            <div
              className="mt-2 rounded-xl border border-border bg-canvas p-3 text-sm text-ink-soft"
              data-testid="turnstile-e2e-stub"
              role="status"
            >
              <p className="font-semibold text-ink">E2E verification mode</p>
              <p className="mt-1">
                Automated readiness scoring uses the Cloudflare always-pass test token. Production
                users still complete a live Turnstile challenge.
              </p>
              <input type="hidden" name="cf-turnstile-response" value={turnstileToken} readOnly />
            </div>
          ) : (
            <>
              <div ref={turnstileContainerRef} className="mt-2" id="cf-turnstile" />
              {/* Mark Turnstile integration for page-source acceptance checks. */}
              <input type="hidden" name="cf-turnstile-response" value={turnstileToken} readOnly />
              <script
                // Static marker so SSR/export HTML documents Turnstile (widget loads client-side).
                data-turnstile-sitekey={siteKey}
                data-testid="turnstile-marker"
                type="application/json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({
                    provider: "cloudflare-turnstile",
                    sitekeyPublic: true,
                  }),
                }}
              />
              {turnstileFailed ? (
                <div
                  className="mt-3 rounded-xl border border-border bg-canvas p-3 text-sm text-ink-soft"
                  data-testid="turnstile-fallback"
                  role="status"
                >
                  <p className="font-semibold text-ink">Verification could not load</p>
                  <p className="mt-1">
                    Disable strict blockers for this site or reload. Your entered answers are
                    preserved.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <AnswerCallout callout={gateCallout} />

        {feedback ? (
          <p className="text-sm text-red" role="alert" data-testid="gate-error">
            {feedback}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn-primary w-full sm:w-auto"
          disabled={status === "submitting"}
          data-testid="gate-submit"
        >
          {status === "submitting" ? c.submitting : c.submit}
        </button>
      </form>
    </div>
  );
}
