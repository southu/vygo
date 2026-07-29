"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trackAnalytics } from "@/lib/analytics";
import {
  APPEARANCE_OPTIONS,
  DEFAULT_PREFERENCES,
  DIGEST_OPTIONS,
  clearPreferences,
  loadPreferences,
  savePreferences,
  type Appearance,
  type DigestCadence,
  type VygoPreferences,
} from "@/lib/settings/preferences";

type ToggleRowProps = {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

function ToggleRow({ id, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-card border border-border bg-canvas p-4"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-sm text-muted">{description}</span>
      </span>
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 rounded border-border text-purple focus:ring-purple"
      />
    </label>
  );
}

export function SettingsPanel() {
  const [prefs, setPrefs] = useState<VygoPreferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const clearSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted preferences after mount (avoids SSG hydration mismatch).
  useEffect(() => {
    setPrefs(loadPreferences());
    setHydrated(true);
    trackAnalytics("settings_view");
  }, []);

  useEffect(() => {
    return () => {
      if (clearSavedTimer.current) clearTimeout(clearSavedTimer.current);
    };
  }, []);

  function update<K extends keyof VygoPreferences>(key: K, value: VygoPreferences[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePreferences(prefs);
    setSaved(true);
    trackAnalytics("settings_saved", {
      appearance: prefs.appearance,
      digest: prefs.digest,
      product_updates: prefs.productUpdates,
      readiness_tips: prefs.readinessTips,
      analytics_opt_in: prefs.analyticsOptIn,
    });
    if (clearSavedTimer.current) clearTimeout(clearSavedTimer.current);
    clearSavedTimer.current = setTimeout(() => setSaved(false), 6000);
  }

  function handleReset() {
    setPrefs(DEFAULT_PREFERENCES);
    clearPreferences();
    savePreferences(DEFAULT_PREFERENCES);
    setSaved(false);
    trackAnalytics("settings_reset");
  }

  return (
    <form
      onSubmit={handleSave}
      data-testid="settings-form"
      data-hydrated={hydrated ? "true" : "false"}
      className="space-y-8"
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">
          Notifications
        </legend>
        <ToggleRow
          id="productUpdates"
          label="Product updates"
          description="Email me when a new engagement window or product update ships."
          checked={prefs.productUpdates}
          onChange={(next) => update("productUpdates", next)}
        />
        <ToggleRow
          id="readinessTips"
          label="Readiness follow-ups"
          description="Send practical follow-up tips after a readiness check."
          checked={prefs.readinessTips}
          onChange={(next) => update("readinessTips", next)}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">
          Preferences
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="appearance" className="block text-sm font-semibold text-ink">
              Appearance
            </label>
            <select
              id="appearance"
              name="appearance"
              value={prefs.appearance}
              onChange={(event) => update("appearance", event.target.value as Appearance)}
              className="mt-2 w-full rounded-card border border-border bg-canvas px-3 py-2.5 text-sm text-ink focus:border-purple focus:outline-none focus:ring-1 focus:ring-purple"
            >
              {APPEARANCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="digest" className="block text-sm font-semibold text-ink">
              Roundup digest
            </label>
            <select
              id="digest"
              name="digest"
              value={prefs.digest}
              onChange={(event) => update("digest", event.target.value as DigestCadence)}
              className="mt-2 w-full rounded-card border border-border bg-canvas px-3 py-2.5 text-sm text-ink focus:border-purple focus:outline-none focus:ring-1 focus:ring-purple"
            >
              {DIGEST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">
          Privacy
        </legend>
        <ToggleRow
          id="analyticsOptIn"
          label="Usage analytics"
          description="Share privacy-safe, first-party usage events. No name, email, or free text is ever collected."
          checked={prefs.analyticsOptIn}
          onChange={(next) => update("analyticsOptIn", next)}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" data-testid="settings-save">
          Save changes
        </button>
        <button type="button" onClick={handleReset} className="btn-secondary">
          Reset to defaults
        </button>
        <span
          role="status"
          aria-live="polite"
          data-testid="settings-saved"
          className={`text-sm font-semibold text-green-dark transition-opacity ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          {saved ? "Preferences saved" : ""}
        </span>
      </div>
    </form>
  );
}
