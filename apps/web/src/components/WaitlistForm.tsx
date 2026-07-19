"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { waitlistContent } from "@/content/waitlist";
import {
  hardenInquiryCopy,
  inquiryOfferOptions,
  isInquiryOfferKey,
  type InquiryOfferKey,
} from "@/content/inquiry-offers";
import { apiUrl } from "@/lib/api";
import { trackAnalytics } from "@/lib/analytics";
import { captureAttribution, type WaitlistAttribution } from "@/lib/attribution";
import { useAvailability } from "./AvailabilityProvider";

/**
 * Cloudflare official always-pass test sitekey (public).
 * Used when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset so non-prod deploys work.
 */
const TURNSTILE_TEST_SITE_KEY = "1x0000000000000000000000000000000AA";

type FormState = {
  fullName: string;
  email: string;
  companyName: string;
  productUrl: string;
  role: string;
  stage: string;
  primaryBlocker: string;
  desiredStartWindow: string;
  message: string;
  prototypePlatform: string;
  budgetRange: string;
  commercialDeadline: boolean;
  privacyAccepted: boolean;
  marketingConsent: boolean;
  /** Selected inquiry offer when the form supports offer selection. */
  offer: InquiryOfferKey | "";
  /** Honeypot — must stay empty. */
  website: string;
};

function createInitialFormState(offer: InquiryOfferKey | null): FormState {
  return {
    fullName: "",
    email: "",
    companyName: "",
    productUrl: "",
    role: "",
    stage: "",
    primaryBlocker: "",
    desiredStartWindow: "",
    message: "",
    prototypePlatform: "",
    budgetRange: "",
    commercialDeadline: false,
    privacyAccepted: false,
    marketingConsent: false,
    offer: offer ?? "",
    website: "",
  };
}

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
};

type ApiSuccessBody = {
  data?: {
    accepted?: boolean;
    message?: string;
    applicationId?: string;
  };
};

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

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveTurnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || TURNSTILE_TEST_SITE_KEY;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wl-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  email: "Work email",
  companyName: "Company name",
  productUrl: "Product or company URL",
  role: "Role / title",
  stage: "Current stage",
  primaryBlocker: "Primary blocker",
  desiredStartWindow: "Desired start window",
  message: "Short description",
  prototypePlatform: "Build tool / stack",
  budgetRange: "Budget range",
  offer: "Offer of interest",
  privacyAccepted: "Privacy Policy and Terms of Use acceptance",
  turnstileToken: "Verification challenge",
};

type WaitlistPrefill = {
  fullName?: string;
  email?: string;
  companyName?: string;
};

type WaitlistFormProps = {
  mode?: "page" | "modal";
  open?: boolean;
  onDismiss?: () => void;
  /** Preselected inquiry offer (e.g. free vygo Harden assessment). */
  offer?: InquiryOfferKey | null;
  /** Prefill from readiness snapshot apply CTA. */
  prefill?: WaitlistPrefill | null;
};

export function WaitlistForm({
  mode = "page",
  open = true,
  onDismiss,
  offer = null,
  prefill = null,
}: WaitlistFormProps) {
  const { form, success } = waitlistContent;
  const { uiState, copy: availabilityCopy } = useAvailability();
  const formId = useId();
  const headingId = `${formId}-heading`;
  const errorSummaryId = `${formId}-error-summary`;
  const liveAssertiveId = `${formId}-live-assertive`;
  const livePoliteId = `${formId}-live-polite`;
  const isHardenAssessment = offer === "harden";

  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<FormState>(() => {
    const base = createInitialFormState(offer);
    if (prefill?.fullName) base.fullName = prefill.fullName;
    if (prefill?.email) base.email = prefill.email;
    if (prefill?.companyName) base.companyName = prefill.companyName;
    return base;
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "success" | "duplicate">(
    "idle",
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [showErrorSummary, setShowErrorSummary] = useState(false);
  // A submit clicked while the Turnstile token is still being issued is queued
  // (not rejected) and auto-fires from the token callback — so the first cold
  // click succeeds instead of failing the client guard during the render race.
  const [awaitingToken, setAwaitingToken] = useState(false);
  const pendingSubmitRef = useRef(false);

  const formStartedAtRef = useRef<number>(Date.now());
  const attributionRef = useRef<WaitlistAttribution>(captureAttribution());
  const idempotencyKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const siteKey = resolveTurnstileSiteKey();

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-sm focus-visible:border-purple";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  // Capture attribution once when the form mounts / modal opens; persists across steps.
  // Reset offer preselection when the inquiry intent changes (e.g. Harden CTA).
  useEffect(() => {
    if (!open) return;
    formStartedAtRef.current = Date.now();
    attributionRef.current = captureAttribution();
    setStep(1);
    const next = createInitialFormState(offer);
    if (prefill?.fullName) next.fullName = prefill.fullName;
    if (prefill?.email) next.email = prefill.email;
    if (prefill?.companyName) next.companyName = prefill.companyName;
    setValues(next);
    setErrors({});
    setShowErrorSummary(false);
    setStatus("idle");
    setStatusMessage("");
    setAwaitingToken(false);
    pendingSubmitRef.current = false;
    trackAnalytics("waitlist_form_view", { mode, step: 1, offer: offer ?? "general" });
    // Focus heading when opened (modal or page mount).
    const t = window.setTimeout(() => {
      headingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, mode, offer, prefill?.fullName, prefill?.email, prefill?.companyName]);

  useEffect(() => {
    trackAnalytics("waitlist_step_change", { step, mode });
  }, [step, mode]);

  // Modal: Escape + focus trap
  // Only wrap at the edges of the tabbable list. Programmatic focus targets with
  // tabindex=-1 (heading, error summary) are not in that list — Tab/Shift+Tab from
  // them must use natural DOM order (or wrap only when no tabbable lies in that
  // direction), otherwise Tab from the error summary jumps to the dismiss button.
  useEffect(() => {
    if (mode !== "modal" || !open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const root = dialogRef.current;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      const activeInList = active != null && focusable.includes(active);
      const activeInDialog = active != null && root.contains(active);

      if (event.shiftKey) {
        // Wrap first → last, or tabindex=-1 sentinel with no tabbable before it (heading).
        if (active === first) {
          event.preventDefault();
          last.focus();
        } else if (activeInDialog && !activeInList) {
          const hasTabbableBefore = focusable.some(
            (el) => (active!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
          );
          if (!hasTabbableBefore) {
            event.preventDefault();
            last.focus();
          }
          // else: natural order (e.g. error summary → previous control)
        } else if (!activeInDialog) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      } else if (activeInDialog && !activeInList) {
        // tabindex=-1 in the middle (error summary): let browser Tab to the next
        // tabbable after it (first error-summary link). Only wrap if nothing follows.
        const hasTabbableAfter = focusable.some(
          (el) => (active!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        );
        if (!hasTabbableAfter) {
          event.preventDefault();
          first.focus();
        }
      } else if (!activeInDialog) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mode, open, onDismiss]);

  // After success/duplicate replaces the form, move focus to the success heading
  // so it does not fall to document.body when the submit control unmounts.
  useEffect(() => {
    if (status !== "success" && status !== "duplicate") return;
    const t = window.requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(t);
  }, [status]);

  // Turnstile on step 2
  useEffect(() => {
    if (step !== 2 || status === "success" || status === "duplicate") return;

    let cancelled = false;

    const onTurnstileUnavailable = () => {
      if (cancelled) return;
      setTurnstileFailed(true);
      setTurnstileToken("");
    };

    const renderWidget = () => {
      if (cancelled || !turnstileContainerRef.current || !window.turnstile) {
        if (!window.turnstile) onTurnstileUnavailable();
        return;
      }
      if (turnstileWidgetIdRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // ignore
        }
        turnstileWidgetIdRef.current = null;
      }
      turnstileContainerRef.current.innerHTML = "";
      try {
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            setTurnstileToken(token);
            setTurnstileFailed(false);
            setErrors((prev) => {
              if (!prev.turnstileToken) return prev;
              const next = { ...prev };
              delete next.turnstileToken;
              return next;
            });
          },
          "error-callback": () => {
            setTurnstileToken("");
            setTurnstileFailed(true);
          },
          "expired-callback": () => setTurnstileToken(""),
          theme: "light",
        });
        setTurnstileFailed(false);
      } catch {
        onTurnstileUnavailable();
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    if (window.turnstile) {
      renderWidget();
    } else if (existing) {
      existing.addEventListener("load", renderWidget);
      existing.addEventListener("error", onTurnstileUnavailable);
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => renderWidget();
      script.onerror = () => onTurnstileUnavailable();
      document.head.appendChild(script);
    }

    // If Turnstile never appears, surface fallback after a short wait.
    const failTimer = window.setTimeout(() => {
      if (!turnstileToken && !turnstileWidgetIdRef.current) {
        // Widget may still be loading; only mark failed if turnstile global missing.
        if (!window.turnstile) onTurnstileUnavailable();
      }
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(failTimer);
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // ignore
        }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [step, siteKey, status, turnstileToken]);

  const announceAssertive = useCallback((message: string) => {
    setAssertiveMessage("");
    // Force re-announce when the same text is set twice.
    requestAnimationFrame(() => setAssertiveMessage(message));
  }, []);

  const announcePolite = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  const focusField = (field: string) => {
    const el = document.getElementById(field);
    if (el && "focus" in el) {
      (el as HTMLElement).focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const applyFieldErrors = (next: Partial<Record<string, string>>) => {
    setErrors(next);
    setShowErrorSummary(Object.keys(next).length > 0);
    if (Object.keys(next).length > 0) {
      const names = Object.keys(next).join(",");
      trackAnalytics("waitlist_validation_failure", {
        step,
        fields: names,
        count: Object.keys(next).length,
      });
      announceAssertive(
        `There ${Object.keys(next).length === 1 ? "is" : "are"} ${Object.keys(next).length} error${Object.keys(next).length === 1 ? "" : "s"} in the form. Review the error summary.`,
      );
      requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
      });
    }
  };

  const validateStep1 = () => {
    const next: Partial<Record<string, string>> = {};
    if (values.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!isEmail(values.email.trim())) next.email = "Enter a valid work email.";
    if (values.companyName.trim().length < 2) next.companyName = "Enter your company name.";
    if (values.productUrl.trim().length < 4) next.productUrl = "Enter a product or company URL.";
    applyFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateStep2 = (opts?: { allowPendingTurnstile?: boolean }) => {
    const next: Partial<Record<string, string>> = {};
    if (!values.stage) next.stage = "Select a stage.";
    if (!values.primaryBlocker) next.primaryBlocker = "Select a primary blocker.";
    if (!values.desiredStartWindow) next.desiredStartWindow = "Select a start window.";
    if (values.message.trim().length < 10) {
      next.message = "Add a short description (at least a sentence).";
    }
    if (!values.privacyAccepted) {
      next.privacyAccepted = "Acceptance of the Privacy Policy and Terms of Use is required.";
    }
    if (!turnstileToken) {
      if (turnstileFailed) {
        next.turnstileToken =
          "Verification is unavailable. Follow the fallback instructions below.";
      } else if (!opts?.allowPendingTurnstile) {
        // Token still loading: only surface the "complete the challenge" error when
        // the caller is not going to queue the submit and auto-fire on the callback.
        next.turnstileToken = "Please complete the verification challenge.";
      }
    }
    applyFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onContinue = (event?: ReactMouseEvent<HTMLButtonElement>) => {
    // Prevent the still-dispatching click from activating a remounted submit
    // button when React reuses the DOM node across step 1 → 2.
    event?.preventDefault();
    event?.stopPropagation();
    if (validateStep1()) {
      setStep(2);
      setShowErrorSummary(false);
      setErrors({});
      announcePolite("Continued to step 2: what needs to happen.");
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  };

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {
        // ignore
      }
    }
  };

  const ensureIdempotencyKey = () => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    return idempotencyKeyRef.current;
  };

  const onSubmitGuarded = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || status === "submitting") return;
    // Validate everything except a still-loading Turnstile token. A failed widget
    // (turnstileFailed) still blocks here with the fallback message.
    if (!validateStep2({ allowPendingTurnstile: true })) return;

    if (!turnstileToken) {
      // Token not issued yet (widget callback still pending): queue the submit and
      // fire it automatically once the token arrives, so this first click succeeds.
      pendingSubmitRef.current = true;
      setAwaitingToken(true);
      announcePolite("Verifying you're human…");
      return;
    }

    await runSubmit();
  };

  const runSubmit = async () => {
    if (submittingRef.current || status === "submitting") return;

    submittingRef.current = true;
    setAwaitingToken(false);
    setStatus("submitting");
    announcePolite("Submitting your application…");
    setErrors({});
    setShowErrorSummary(false);

    const idempotencyKey = ensureIdempotencyKey();
    const attribution = attributionRef.current;

    const selectedOffer = isInquiryOfferKey(values.offer) ? values.offer : offer;
    const offerLabel =
      selectedOffer === "harden"
        ? hardenInquiryCopy.inquiryName
        : selectedOffer
          ? (inquiryOfferOptions.find((option) => option.value === selectedOffer)?.label ??
            selectedOffer)
          : null;
    // Keep API payload on the existing schema; encode offer intent in message + UTM campaign.
    const messageWithOffer =
      offerLabel && !values.message.toLowerCase().includes(offerLabel.toLowerCase())
        ? `[${offerLabel}] ${values.message}`
        : values.message;
    const utm = {
      ...attribution.utm,
      campaign:
        selectedOffer === "harden" ? "vygo-harden-assessment" : (attribution.utm.campaign ?? null),
      content: selectedOffer ?? attribution.utm.content ?? null,
    };

    const payload: Record<string, unknown> = {
      fullName: values.fullName,
      email: values.email,
      companyName: values.companyName,
      productUrl: values.productUrl,
      role: values.role.trim() || null,
      stage: values.stage,
      primaryBlocker: values.primaryBlocker,
      desiredStartWindow: values.desiredStartWindow,
      message: messageWithOffer,
      prototypePlatform: values.prototypePlatform.trim() || null,
      budgetRange: values.budgetRange || null,
      commercialDeadline: values.commercialDeadline,
      privacyAccepted: values.privacyAccepted,
      marketingConsent: values.marketingConsent,
      turnstileToken,
      website: values.website,
      formStartedAt: formStartedAtRef.current,
      landingPage: attribution.landingPage,
      referrer: attribution.referrer,
      utm,
      idempotencyKey,
    };

    trackAnalytics("waitlist_submit", { step: 2, hasAttribution: true });

    try {
      const res = await fetch(apiUrl("/v1/waitlist"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });

      let body: ApiErrorBody & ApiSuccessBody = {};
      try {
        body = (await res.json()) as ApiErrorBody & ApiSuccessBody;
      } catch {
        body = {};
      }

      if (res.ok && body?.data?.accepted === true) {
        // Duplicate enrollments return the same accepted:true envelope (criterion 22).
        const msg = body.data.message || "Your application has been received.";
        const isDuplicate =
          typeof body.data.message === "string" &&
          /already|duplicate|registered/i.test(body.data.message);
        setStatus(isDuplicate ? "duplicate" : "success");
        announcePolite(msg);
        announceAssertive(
          isDuplicate
            ? "You are already registered. Confirmation shown."
            : "Application received successfully.",
        );
        trackAnalytics(isDuplicate ? "waitlist_duplicate" : "waitlist_success", {
          status: res.status,
        });
        // New logical attempt after completion uses a fresh key.
        idempotencyKeyRef.current = null;
        return;
      }

      const code = body?.error?.code;
      const message =
        body?.error?.message ||
        (res.status === 429
          ? "Too many attempts. Please try again later or email hello@vygo.ai."
          : "Something went wrong. Please try again.");

      if (body?.error?.fields) {
        applyFieldErrors(body.error.fields);
      }

      if (code === "TURNSTILE_FAILED") {
        setErrors((prev) => ({
          ...prev,
          turnstileToken: "Verification failed. Please try again.",
        }));
        setShowErrorSummary(true);
        setTurnstileFailed(true);
        resetTurnstile();
      }

      setStatus("error");
      announcePolite(message);
      announceAssertive(message);
      trackAnalytics("waitlist_failure", {
        status: res.status,
        code: code ?? "unknown",
      });
      // Keep idempotency key for retry of this attempt.
    } catch {
      setStatus("error");
      const message = "Network error. Please check your connection and try again.";
      announcePolite(message);
      announceAssertive(message);
      trackAnalytics("waitlist_failure", { code: "network" });
    } finally {
      submittingRef.current = false;
    }
  };

  // Auto-fire a queued submit once the Turnstile token lands (closes the cold
  // first-attempt race: one early click is honored instead of erroring).
  useEffect(() => {
    if (turnstileToken && pendingSubmitRef.current && !submittingRef.current) {
      pendingSubmitRef.current = false;
      void runSubmit();
    }
    // runSubmit reads the latest token/values from this render's closure.
  }, [turnstileToken]);

  // If the widget fails while a submit is queued, cancel the queue and surface
  // the fallback instructions instead of waiting on a token that will never come.
  useEffect(() => {
    if (turnstileFailed && pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      setAwaitingToken(false);
      applyFieldErrors({
        turnstileToken: "Verification is unavailable. Follow the fallback instructions below.",
      });
      setStatus("error");
    }
  }, [turnstileFailed]);

  const errorEntries = Object.entries(errors).filter(([, msg]) => Boolean(msg));

  const liveRegions = (
    <>
      <div
        id={liveAssertiveId}
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="waitlist-live-assertive"
      >
        {assertiveMessage}
      </div>
      <div
        id={livePoliteId}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="waitlist-live-polite"
      >
        {statusMessage}
      </div>
    </>
  );

  const successHeading = isHardenAssessment ? hardenInquiryCopy.successHeading : success.heading;
  const successBody = isHardenAssessment ? hardenInquiryCopy.successBody : success.body;
  const formHeading = isHardenAssessment
    ? hardenInquiryCopy.heading
    : mode === "modal"
      ? "Join the waitlist"
      : "Application form";
  const formIntro = isHardenAssessment ? hardenInquiryCopy.body : null;
  const submitLabel = isHardenAssessment ? hardenInquiryCopy.submitLabel : form.submitLabel;

  const successCard = (
    <div
      data-testid="waitlist-success-card"
      data-waitlist-outcome={status === "duplicate" ? "duplicate" : "success"}
      data-inquiry-offer={offer ?? undefined}
      role="status"
    >
      {liveRegions}
      <h2
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="font-display text-2xl font-bold text-ink outline-none"
      >
        {successHeading}
      </h2>
      <p className="mt-3 text-muted">{successBody}</p>
      <p className="mt-2 text-sm text-ink-soft" data-success-message>
        {statusMessage || "Your application has been received."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={isHardenAssessment ? "/pricing#harden" : success.nextHref}
          className="btn-primary"
          data-testid="success-next-action"
        >
          {isHardenAssessment ? "Back to vygo Harden" : success.nextLinkLabel}
        </Link>
        {mode === "modal" && onDismiss ? (
          <button type="button" className="btn-secondary" onClick={onDismiss}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  );

  const formBody = (
    <>
      {liveRegions}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="font-display text-xl font-bold text-ink outline-none sm:text-2xl"
            data-testid="waitlist-form-heading"
            data-inquiry-offer={offer ?? undefined}
          >
            {formHeading}
          </h2>
          {formIntro ? (
            <p className="mt-2 text-sm text-muted" data-testid="waitlist-inquiry-intro">
              {formIntro}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted">
            Step {step} of 2 — {step === 1 ? form.step1Title : form.step2Title}
          </p>
        </div>
        {mode === "modal" && onDismiss ? (
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-sm font-semibold"
            aria-label="Close waitlist form"
            onClick={onDismiss}
            data-testid="waitlist-dismiss"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="mb-6 flex items-center gap-3 text-sm" aria-hidden="true">
        <span
          className={`rounded-full px-3 py-1 font-semibold ${step === 1 ? "bg-purple text-white" : "bg-purple-soft text-purple-dark"}`}
        >
          1. {form.step1Title}
        </span>
        <span
          className={`rounded-full px-3 py-1 font-semibold ${step === 2 ? "bg-purple text-white" : "bg-canvas text-muted"}`}
        >
          2. {form.step2Title}
        </span>
      </div>

      {showErrorSummary && errorEntries.length > 0 ? (
        <div
          ref={errorSummaryRef}
          id={errorSummaryId}
          className="mb-4 rounded-xl border border-red bg-red/5 p-4"
          role="alert"
          tabIndex={-1}
          data-testid="waitlist-error-summary"
        >
          <p className="text-sm font-semibold text-red">
            There {errorEntries.length === 1 ? "is a problem" : "are problems"} with your
            application
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red">
            {errorEntries.map(([field, message]) => (
              <li key={field}>
                <a
                  href={`#${field}`}
                  className="underline focus-visible:outline"
                  onClick={(e) => {
                    e.preventDefault();
                    focusField(field);
                  }}
                  data-error-summary-link={field}
                >
                  {FIELD_LABELS[field] ?? field}: {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        className="space-y-0"
        onSubmit={onSubmitGuarded}
        noValidate
        aria-labelledby={headingId}
        data-testid="waitlist-form"
        data-waitlist-step={step}
        data-inquiry-offer={offer ?? (values.offer || undefined)}
      >
        {/* Honeypot */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-10000px",
            top: "auto",
            width: "1px",
            height: "1px",
            overflow: "hidden",
          }}
        >
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => update("website", e.target.value)}
          />
        </div>

        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="offer" className="text-sm font-medium text-ink">
                Offer of interest
              </label>
              <select
                id="offer"
                name="offer"
                className={fieldClass}
                value={values.offer}
                onChange={(e) => {
                  const next = e.target.value;
                  update("offer", isInquiryOfferKey(next) ? next : "");
                }}
                data-testid="waitlist-offer-select"
                aria-describedby={isHardenAssessment ? "offer-help" : undefined}
              >
                <option value="">Select…</option>
                {inquiryOfferOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {isHardenAssessment ? (
                <p id="offer-help" className="mt-1.5 text-xs text-muted">
                  Preselected for a free vygo Harden fit assessment (not the $15,000 Production
                  Readiness Audit).
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="fullName" className="text-sm font-medium text-ink">
                Full name <span className="text-red">*</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                className={fieldClass}
                value={values.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? "fullName-error" : undefined}
                required
              />
              {errors.fullName ? (
                <p
                  id="fullName-error"
                  className="mt-1 text-xs text-red"
                  data-field-error="fullName"
                >
                  {errors.fullName}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Work email <span className="text-red">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className={fieldClass}
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                required
              />
              {errors.email ? (
                <p id="email-error" className="mt-1 text-xs text-red" data-field-error="email">
                  {errors.email}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="companyName" className="text-sm font-medium text-ink">
                Company name <span className="text-red">*</span>
              </label>
              <input
                id="companyName"
                name="companyName"
                autoComplete="organization"
                className={fieldClass}
                value={values.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                aria-invalid={Boolean(errors.companyName)}
                aria-describedby={errors.companyName ? "companyName-error" : undefined}
                required
              />
              {errors.companyName ? (
                <p
                  id="companyName-error"
                  className="mt-1 text-xs text-red"
                  data-field-error="companyName"
                >
                  {errors.companyName}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="productUrl" className="text-sm font-medium text-ink">
                Product or company URL <span className="text-red">*</span>
              </label>
              <input
                id="productUrl"
                name="productUrl"
                type="url"
                autoComplete="url"
                placeholder="https://"
                className={fieldClass}
                value={values.productUrl}
                onChange={(e) => update("productUrl", e.target.value)}
                aria-invalid={Boolean(errors.productUrl)}
                aria-describedby={errors.productUrl ? "productUrl-error" : undefined}
                required
              />
              {errors.productUrl ? (
                <p
                  id="productUrl-error"
                  className="mt-1 text-xs text-red"
                  data-field-error="productUrl"
                >
                  {errors.productUrl}
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="role" className="text-sm font-medium text-ink">
                Role / title <span className="text-muted">(optional)</span>
              </label>
              <input
                id="role"
                name="role"
                autoComplete="organization-title"
                className={fieldClass}
                value={values.role}
                onChange={(e) => update("role", e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div>
              <label htmlFor="stage" className="text-sm font-medium text-ink">
                Current stage <span className="text-red">*</span>
              </label>
              <select
                id="stage"
                name="stage"
                className={fieldClass}
                value={values.stage}
                onChange={(e) => update("stage", e.target.value)}
                aria-invalid={Boolean(errors.stage)}
                aria-describedby={errors.stage ? "stage-error" : undefined}
                required
              >
                <option value="">Select…</option>
                {form.stages.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.stage ? (
                <p id="stage-error" className="mt-1 text-xs text-red" data-field-error="stage">
                  {errors.stage}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="primaryBlocker" className="text-sm font-medium text-ink">
                Primary blocker <span className="text-red">*</span>
              </label>
              <select
                id="primaryBlocker"
                name="primaryBlocker"
                className={fieldClass}
                value={values.primaryBlocker}
                onChange={(e) => update("primaryBlocker", e.target.value)}
                aria-invalid={Boolean(errors.primaryBlocker)}
                required
              >
                <option value="">Select…</option>
                {form.blockers.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.primaryBlocker ? (
                <p className="mt-1 text-xs text-red" data-field-error="primaryBlocker">
                  {errors.primaryBlocker}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="desiredStartWindow" className="text-sm font-medium text-ink">
                Desired start window <span className="text-red">*</span>
              </label>
              <select
                id="desiredStartWindow"
                name="desiredStartWindow"
                className={fieldClass}
                value={values.desiredStartWindow}
                onChange={(e) => update("desiredStartWindow", e.target.value)}
                aria-invalid={Boolean(errors.desiredStartWindow)}
                required
              >
                <option value="">Select…</option>
                {form.startWindows.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.desiredStartWindow ? (
                <p className="mt-1 text-xs text-red" data-field-error="desiredStartWindow">
                  {errors.desiredStartWindow}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="message" className="text-sm font-medium text-ink">
                Short description <span className="text-red">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                className={fieldClass}
                value={values.message}
                onChange={(e) => update("message", e.target.value)}
                aria-invalid={Boolean(errors.message)}
                required
              />
              {errors.message ? (
                <p className="mt-1 text-xs text-red" data-field-error="message">
                  {errors.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="prototypePlatform" className="text-sm font-medium text-ink">
                  Build tool / stack <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="prototypePlatform"
                  name="prototypePlatform"
                  autoComplete="off"
                  className={fieldClass}
                  value={values.prototypePlatform}
                  onChange={(e) => update("prototypePlatform", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="budgetRange" className="text-sm font-medium text-ink">
                  Budget range <span className="text-muted">(optional)</span>
                </label>
                <select
                  id="budgetRange"
                  name="budgetRange"
                  className={fieldClass}
                  value={values.budgetRange}
                  onChange={(e) => update("budgetRange", e.target.value)}
                >
                  <option value="">Select…</option>
                  {form.budgets.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="mt-1"
                checked={values.commercialDeadline}
                onChange={(e) => update("commercialDeadline", e.target.checked)}
              />
              An enterprise or customer deadline is involved
            </label>

            <label
              className="flex items-start gap-3 text-sm text-ink-soft"
              htmlFor="privacyAccepted"
            >
              <input
                id="privacyAccepted"
                name="privacyAccepted"
                type="checkbox"
                className="mt-1"
                checked={values.privacyAccepted}
                onChange={(e) => update("privacyAccepted", e.target.checked)}
                aria-invalid={Boolean(errors.privacyAccepted)}
                required
              />
              <span>
                I accept the{" "}
                <a href="/privacy" className="font-semibold text-purple underline">
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a href="/terms" className="font-semibold text-purple underline">
                  Terms of Use
                </a>{" "}
                of VYGO for application processing. <span className="text-red">*</span>
              </span>
            </label>
            {errors.privacyAccepted ? (
              <p className="text-xs text-red" data-field-error="privacyAccepted">
                {errors.privacyAccepted}
              </p>
            ) : null}

            <label className="flex items-start gap-3 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="mt-1"
                checked={values.marketingConsent}
                onChange={(e) => update("marketingConsent", e.target.checked)}
              />
              Send me optional product and capacity updates (separate from application processing)
            </label>

            <div data-testid="turnstile-region">
              <p className="text-sm font-medium text-ink">Verification</p>
              <div ref={turnstileContainerRef} className="mt-2" id="turnstileToken" />
              {turnstileFailed ? (
                <div
                  className="mt-3 rounded-xl border border-border bg-canvas p-3 text-sm text-ink-soft"
                  data-testid="turnstile-fallback"
                  role="status"
                >
                  <p className="font-semibold text-ink">Verification could not load</p>
                  <p className="mt-1">
                    Disable strict blockers for this site, reload the page, or email{" "}
                    <a className="font-semibold text-purple underline" href="mailto:hello@vygo.ai">
                      hello@vygo.ai
                    </a>{" "}
                    with your details. Your entered answers are preserved.
                  </p>
                </div>
              ) : null}
              {errors.turnstileToken ? (
                <p className="mt-1 text-xs text-red" data-field-error="turnstileToken">
                  {errors.turnstileToken}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div
          id="waitlist-status"
          className={`mt-4 text-sm ${status === "error" ? "text-red" : "text-muted"}`}
          role="status"
          aria-live="polite"
          data-testid="waitlist-status"
        >
          {statusMessage}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {step === 2 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStep(1);
                setShowErrorSummary(false);
                announcePolite("Returned to step 1.");
              }}
            >
              {form.backLabel}
            </button>
          ) : null}

          {step === 1 ? (
            <button
              key="continue"
              type="button"
              className="btn-primary"
              onClick={onContinue}
              data-testid="waitlist-continue"
            >
              {form.continueLabel}
            </button>
          ) : (
            <button
              key="submit"
              type="submit"
              className="btn-primary"
              disabled={status === "submitting" || awaitingToken}
              aria-busy={status === "submitting" || awaitingToken ? true : undefined}
              data-testid="waitlist-submit"
            >
              {status === "submitting"
                ? "Submitting…"
                : awaitingToken
                  ? "Verifying you're human…"
                  : submitLabel}
            </button>
          )}
        </div>
      </form>
    </>
  );

  const isSuccess = status === "success" || status === "duplicate";
  const content = isSuccess ? successCard : formBody;

  if (mode === "modal") {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-4 sm:items-center"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onDismiss?.();
        }}
        data-testid="waitlist-modal-backdrop"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-card"
          data-testid="waitlist-modal"
          onKeyDown={(e: ReactKeyboardEvent) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onDismiss?.();
            }
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // Page mode: gate application when enrollment is paused or still loading (AC7).
  // Open/waitlist keep the operable form; stale/error fail-open (form remains).
  if (uiState === "paused") {
    return (
      <div
        className="card relative"
        data-testid="waitlist-page-form"
        data-form-gated="paused"
        data-availability-state="paused"
      >
        <h2 className="font-display text-2xl font-bold text-ink">Enrollment paused</h2>
        <p className="mt-3 text-muted" data-paused-explanation>
          {availabilityCopy.message}
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          Submission is not available until openings resume. Check back later or email
          hello@vygo.ai.
        </p>
        <div className="mt-6">
          <button
            type="button"
            className="btn-primary opacity-70"
            disabled
            aria-disabled="true"
            data-cta-mode="paused"
            data-testid="waitlist-page-paused-cta"
          >
            Enrollment paused
          </button>
        </div>
      </div>
    );
  }

  // Loading is the static-export/prerender default (availability is fetched
  // client-side). Fail open and render the operable application form so the
  // served HTML always ships a usable conversion surface — a real <form> with
  // email + submit controls — even before/without JS resolving availability.
  // Only the client-resolved `paused` state (handled above) gates the form.
  if (uiState === "loading") {
    return (
      <div
        className="card relative"
        data-testid="waitlist-page-form"
        data-form-gated="loading"
        data-availability-state="loading"
      >
        {content}
      </div>
    );
  }

  return (
    <div className="card relative" data-testid="waitlist-page-form" data-form-gated="open">
      {content}
    </div>
  );
}
