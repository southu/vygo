"use client";

import { useEffect } from "react";
import { SETTINGS_STORAGE_KEY, type Appearance } from "@/lib/settings/preferences";
import {
  applyTheme,
  getAppearance,
  hasExplicitPreference,
  resolveTheme,
  setTheme,
  syncThemeFromStorage,
  type ResolvedTheme,
} from "@/lib/theme";

/** Public theme API surface exposed on `window` for the UI and black-box checks. */
type VygoThemeApi = {
  storageKey: string;
  getAppearance: () => Appearance;
  getResolved: () => ResolvedTheme;
  setTheme: (appearance: Appearance) => ResolvedTheme;
};

declare global {
  interface Window {
    vygoTheme?: VygoThemeApi;
    setTheme?: (appearance: Appearance) => ResolvedTheme;
  }
}

/**
 * Runtime companion to the blocking boot script in <head>. It re-syncs the root
 * from storage after hydration, exposes a small public theme API on `window`,
 * and — only while no explicit choice is saved — follows live OS
 * prefers-color-scheme changes. An explicit stored preference is never
 * overridden by the OS.
 */
export function ThemeManager() {
  useEffect(() => {
    // Reconcile the root with storage in case anything changed between the
    // <head> boot script and hydration.
    syncThemeFromStorage();

    const api: VygoThemeApi = {
      storageKey: SETTINGS_STORAGE_KEY,
      getAppearance,
      getResolved: () => resolveTheme(getAppearance()),
      setTheme,
    };
    window.vygoTheme = api;
    window.setTheme = setTheme;

    // Follow the OS only when the user has not pinned an explicit light/dark.
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (hasExplicitPreference()) return;
      applyTheme(event.matches ? "dark" : "light");
    };
    media?.addEventListener?.("change", onSystemChange);

    // Mirror preference changes made in other tabs onto this document.
    const onStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) syncThemeFromStorage();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      media?.removeEventListener?.("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
