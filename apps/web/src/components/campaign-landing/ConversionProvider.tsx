"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { emitConversionEvent, type ConversionOutcome } from "@/lib/campaign/conversion";
import { subscribeConsent } from "@/lib/campaign/consent";
import { getCampaignParams, syncSessionParams, type CampaignParams } from "@/lib/campaign/params";

type ConversionContextValue = {
  landingPageId: string;
  getParams: () => CampaignParams;
  emitCtaActivation: (ctaLocation: string) => void;
  emitFormStart: (formId: string) => void;
  emitConversionError: (
    formId: string,
    outcome: Extract<ConversionOutcome, "validation_error" | "submission_rejected">,
    extra?: Record<string, string | number | boolean | null>,
  ) => void;
  emitConversionSuccess: (
    formId: string,
    extra?: Record<string, string | number | boolean | null>,
  ) => void;
};

const ConversionContext = createContext<ConversionContextValue | null>(null);

/**
 * Client boundary for a campaign landing page. Preserves approved campaign
 * parameters for the session on mount, emits exactly one `landing_page_view`,
 * and exposes the shared conversion emitters to descendant client components.
 */
export function CampaignConversionProvider({
  landingPageId,
  children,
}: {
  landingPageId: string;
  children: ReactNode;
}) {
  const paramsRef = useRef<CampaignParams>({});

  useEffect(() => {
    // Preserve approved parameters (explicit-over-session precedence) and keep a
    // local snapshot for this page's event payloads.
    paramsRef.current = syncSessionParams();

    const fireView = () => {
      emitConversionEvent({
        event: "landing_page_view",
        landingPageId,
        ctaLocation: null,
        outcome: "view",
        params: paramsRef.current,
      });
    };

    // Emit on mount; the emitter dedupes, so repeated calls (StrictMode, later
    // consent grant) never produce a duplicate landing-page view.
    fireView();
    const unsubscribe = subscribeConsent(fireView);
    return unsubscribe;
  }, [landingPageId]);

  const value = useMemo<ConversionContextValue>(() => {
    const currentParams = () => {
      // Prefer the freshest stored set; fall back to the mount snapshot.
      const stored = getCampaignParams();
      return Object.keys(stored).length > 0 ? stored : paramsRef.current;
    };
    return {
      landingPageId,
      getParams: currentParams,
      emitCtaActivation: (ctaLocation: string) => {
        emitConversionEvent({
          event: "primary_cta_activation",
          landingPageId,
          ctaLocation,
          outcome: "activated",
          params: currentParams(),
        });
      },
      emitFormStart: (formId: string) => {
        emitConversionEvent({
          event: "form_start",
          landingPageId,
          ctaLocation: null,
          outcome: "started",
          params: currentParams(),
          dedupeKey: formId,
          extra: { form_id: formId },
        });
      },
      emitConversionError: (formId, outcome, extra) => {
        emitConversionEvent({
          event: "conversion_error",
          landingPageId,
          ctaLocation: null,
          outcome,
          params: currentParams(),
          extra: { form_id: formId, ...extra },
        });
      },
      emitConversionSuccess: (formId, extra) => {
        emitConversionEvent({
          event: "conversion_success",
          landingPageId,
          ctaLocation: null,
          outcome: "success",
          params: currentParams(),
          dedupeKey: formId,
          extra: { form_id: formId, ...extra },
        });
      },
    };
  }, [landingPageId]);

  return <ConversionContext.Provider value={value}>{children}</ConversionContext.Provider>;
}

const NOOP: ConversionContextValue = {
  landingPageId: "unknown",
  getParams: () => ({}),
  emitCtaActivation: () => {},
  emitFormStart: () => {},
  emitConversionError: () => {},
  emitConversionSuccess: () => {},
};

/**
 * Access the shared conversion emitters. Returns safe no-ops when used outside
 * a campaign shell so shared components never crash off a landing page.
 */
export function useConversion(): ConversionContextValue {
  return useContext(ConversionContext) ?? NOOP;
}
