/**
 * Account & product preferences for the Vygo settings surface.
 *
 * Static-export site: there is no per-user backend/auth boundary to mutate, so
 * preferences persist in the browser (localStorage) — the same durable-client
 * pattern the readiness flow uses. Values are non-PII product choices only
 * (notification toggles, appearance, analytics opt-in), never name/email/free
 * text, so nothing sensitive is written to the device or leaves it.
 */

export const SETTINGS_STORAGE_KEY = "vygo:settings:v1" as const;

export type Appearance = "system" | "light" | "dark";
export type DigestCadence = "off" | "weekly" | "monthly";

export type VygoPreferences = {
  /** Email me when a new engagement window / product update ships. */
  productUpdates: boolean;
  /** Follow-up tips after a readiness check. */
  readinessTips: boolean;
  /** Preferred appearance for interactive surfaces. */
  appearance: Appearance;
  /** How often to receive the roundup digest. */
  digest: DigestCadence;
  /** Opt in to privacy-safe, first-party usage analytics. */
  analyticsOptIn: boolean;
};

export const DEFAULT_PREFERENCES: VygoPreferences = {
  productUpdates: true,
  readinessTips: true,
  appearance: "system",
  digest: "weekly",
  analyticsOptIn: true,
};

export const APPEARANCE_OPTIONS: ReadonlyArray<{ value: Appearance; label: string }> = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const DIGEST_OPTIONS: ReadonlyArray<{ value: DigestCadence; label: string }> = [
  { value: "off", label: "Off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

function isDigest(value: unknown): value is DigestCadence {
  return value === "off" || value === "weekly" || value === "monthly";
}

/** Coerce arbitrary parsed JSON into a fully-populated, valid preferences object. */
export function normalizePreferences(input: unknown): VygoPreferences {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    productUpdates:
      typeof raw.productUpdates === "boolean"
        ? raw.productUpdates
        : DEFAULT_PREFERENCES.productUpdates,
    readinessTips:
      typeof raw.readinessTips === "boolean"
        ? raw.readinessTips
        : DEFAULT_PREFERENCES.readinessTips,
    appearance: isAppearance(raw.appearance) ? raw.appearance : DEFAULT_PREFERENCES.appearance,
    digest: isDigest(raw.digest) ? raw.digest : DEFAULT_PREFERENCES.digest,
    analyticsOptIn:
      typeof raw.analyticsOptIn === "boolean"
        ? raw.analyticsOptIn
        : DEFAULT_PREFERENCES.analyticsOptIn,
  };
}

export function loadPreferences(): VygoPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: VygoPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizePreferences(prefs)));
  } catch {
    // Quota / private mode — non-fatal; the in-memory selection still applies.
  }
}

export function clearPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
