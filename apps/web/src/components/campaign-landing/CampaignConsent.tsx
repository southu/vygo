"use client";

import { useEffect, useId, useState } from "react";

const STORAGE_KEY = "vygo:consent";

type ConsentState = { analytics: boolean };

/**
 * Approved consent-management control. Necessary cookies (e.g. verification) are
 * always on and informational; optional product analytics is off by default and
 * never preselected. Implemented as a disclosure (not a modal) so keyboard focus
 * is never trapped. Choices persist locally and are pushed to the data layer.
 */
export function CampaignConsent() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ConsentState>;
        setAnalytics(Boolean(parsed.analytics));
      }
    } catch {
      // Ignore unavailable/corrupt storage; defaults stand.
    }
  }, []);

  function save() {
    const state: ConsentState = { analytics };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be blocked; the choice still applies for this session.
    }
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    if (Array.isArray(layer)) {
      layer.push({ event: "consent_update", analytics_consent: analytics });
    }
    setSaved(true);
  }

  return (
    <div className="text-sm">
      <button
        type="button"
        className="btn-secondary !min-h-0 px-3 py-1.5 text-xs"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
          setSaved(false);
        }}
        data-testid="campaign-consent-toggle"
      >
        Privacy choices
      </button>

      {open ? (
        <div
          id={panelId}
          className="mt-3 max-w-sm rounded-card border border-border bg-canvas p-4 text-ink-soft"
        >
          <p className="font-semibold text-ink">Manage your privacy choices</p>
          <p className="mt-2 text-xs">
            vygo uses only necessary cookies (such as verification) to run this site. Optional
            product analytics is off unless you turn it on.
          </p>

          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={analytics}
              onChange={(event) => {
                setAnalytics(event.target.checked);
                setSaved(false);
              }}
            />
            <span>Allow optional product analytics</span>
          </label>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" className="btn btn-primary !min-h-0 px-3 py-1.5 text-xs" onClick={save}>
              Save choices
            </button>
            <span role="status" aria-live="polite" className="text-xs text-green-dark">
              {saved ? "Saved" : ""}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
