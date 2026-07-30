"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { emitConversionEvent, resolveLandingPageId } from "@/lib/campaign/conversion";
import { subscribeConsent } from "@/lib/campaign/consent";
import {
  appendCampaignParamsToHref,
  getCampaignParams,
  syncSessionParams,
} from "@/lib/campaign/params";
import {
  isInstrumentedLandingPath,
  PRIMARY_CTA_SELECTOR,
  resolveCtaLocation,
} from "@/lib/campaign/landing";

/**
 * Global, route-aware bootstrap for the shared conversion layer.
 *
 * Mounted once from the root layout so every campaign landing surface under the
 * `/campaigns` path is instrumented without per-page wiring. It:
 *
 *  1. Preserves the approved campaign parameters for the whole browser session
 *     on every route (NOT consent-gated — functional session continuity), with
 *     explicit-over-session precedence and allowlist-only storage.
 *  2. Emits exactly one consent-gated `landing_page_view` per instrumented
 *     landing page (re-firing once if consent is granted after load; deduped so
 *     rerenders and back/forward navigation never duplicate it).
 *  3. Emits `primary_cta_activation` when a primary CTA is activated on an
 *     instrumented landing page, and propagates the preserved parameters onto
 *     same-origin anchor destinations.
 *
 * Emission is delegated to the process-wide, consent-gated, deduplicated
 * emitter in `lib/campaign/conversion.ts` — no new analytics provider.
 */
export function CampaignConversionBootstrap() {
  const pathname = usePathname();

  // 1. Preserve approved campaign parameters for the session on every route.
  useEffect(() => {
    syncSessionParams();
  }, [pathname]);

  // 2. Emit exactly one landing_page_view per instrumented landing page.
  useEffect(() => {
    if (!isInstrumentedLandingPath(pathname)) return;
    const landingPageId = resolveLandingPageId(pathname);
    const fireView = () => {
      emitConversionEvent({
        event: "landing_page_view",
        landingPageId,
        ctaLocation: null,
        outcome: "view",
        params: getCampaignParams(),
      });
    };
    // Fire on mount; the shared emitter dedupes, so a later consent grant fires
    // the view exactly once and never a duplicate.
    fireView();
    const unsubscribe = subscribeConsent(fireView);
    // Also re-attempt on first interaction / tab focus so a view suppressed
    // under denied consent still fires exactly once if consent is granted after
    // load without a reload (all attempts are deduped, so never a duplicate).
    const retry = () => fireView();
    window.addEventListener("pointerdown", retry, true);
    window.addEventListener("keydown", retry, true);
    window.addEventListener("focus", retry);
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", retry, true);
      window.removeEventListener("keydown", retry, true);
      window.removeEventListener("focus", retry);
    };
  }, [pathname]);

  // 3. Emit primary_cta_activation on primary CTA activation, and propagate
  //    preserved parameters onto same-origin anchor destinations. Capture phase
  //    so the beacon is sent before the CTA navigates away.
  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (!isInstrumentedLandingPath(window.location.pathname)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cta = target.closest(PRIMARY_CTA_SELECTOR);
      if (!(cta instanceof HTMLElement)) return;

      emitConversionEvent({
        event: "primary_cta_activation",
        landingPageId: resolveLandingPageId(window.location.pathname),
        ctaLocation: resolveCtaLocation({
          ctaLocation: cta.getAttribute("data-cta-location"),
          cta: cta.getAttribute("data-cta"),
          testid: cta.getAttribute("data-testid"),
          text: cta.textContent,
          tag: cta.tagName,
        }),
        outcome: "activated",
        params: getCampaignParams(),
      });

      // Propagate preserved allowlisted params onto same-origin anchor targets.
      const anchor = cta instanceof HTMLAnchorElement ? cta : cta.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        const raw = anchor.getAttribute("href") ?? "";
        const next = appendCampaignParamsToHref(raw);
        if (next && next !== raw) anchor.setAttribute("href", next);
      }
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  return null;
}
