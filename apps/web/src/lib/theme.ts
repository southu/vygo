/**
 * Theme resolution + root application for the Vygo app shell.
 *
 * The user's appearance choice ("system" | "light" | "dark") persists in the
 * shared settings blob (see {@link SETTINGS_STORAGE_KEY}). This module resolves
 * that choice against the OS `prefers-color-scheme` and reflects the result onto
 * the document root as `data-theme="light"|"dark"` (plus a matching class and
 * `color-scheme`) so CSS/theme tokens activate. It builds on the existing
 * preference helper rather than introducing a parallel theme system.
 */

import {
  SETTINGS_STORAGE_KEY,
  loadPreferences,
  savePreferences,
  type Appearance,
} from "@/lib/settings/preferences";

export const THEME_ATTR = "data-theme" as const;
export type ResolvedTheme = "light" | "dark";

/** Whether the OS currently prefers a dark color scheme. */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Collapse an appearance choice to a concrete light/dark theme. */
export function resolveTheme(appearance: Appearance): ResolvedTheme {
  if (appearance === "light" || appearance === "dark") return appearance;
  return systemPrefersDark() ? "dark" : "light";
}

/** Reflect a resolved theme onto the document root (attribute + class + color-scheme). */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute(THEME_ATTR, resolved);
  el.classList.remove("light", "dark");
  el.classList.add(resolved);
  el.style.colorScheme = resolved;
}

/** The user's stored appearance choice (defaults to "system"). */
export function getAppearance(): Appearance {
  return loadPreferences().appearance;
}

/** True when the user has pinned an explicit light/dark choice (i.e. not "system"). */
export function hasExplicitPreference(): boolean {
  return getAppearance() !== "system";
}

/**
 * Public theme setter used by the UI: persist the choice and reflect it onto the
 * root in the same frame. Returns the resolved light/dark theme that was applied.
 */
export function setTheme(appearance: Appearance): ResolvedTheme {
  savePreferences({ ...loadPreferences(), appearance });
  const resolved = resolveTheme(appearance);
  applyTheme(resolved);
  return resolved;
}

/** Resolve + apply the currently stored preference. Returns the applied theme. */
export function syncThemeFromStorage(): ResolvedTheme {
  const resolved = resolveTheme(getAppearance());
  applyTheme(resolved);
  return resolved;
}

/**
 * Blocking inline script for the document `<head>`. Runs before first paint so
 * the root carries the correct `data-theme` with no theme flash (FOUC). Kept as
 * a self-contained string — it cannot import at runtime — but the storage key is
 * injected from the single source of truth above so the two never drift.
 *
 * Tolerant of how the value was written under the key: a full settings object
 * (`{"appearance":"dark"}`), a JSON string (`"dark"`), or a bare string
 * (`dark`) all resolve correctly.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var KEY=${JSON.stringify(SETTINGS_STORAGE_KEY)};
var raw=null;try{raw=window.localStorage.getItem(KEY);}catch(e){}
var appearance="system";
if(raw){var v=null;try{v=JSON.parse(raw);}catch(e){v=raw;}
if(v&&typeof v==="object"&&typeof v.appearance==="string"){appearance=v.appearance;}
else if(typeof v==="string"){appearance=v;}}
if(appearance!=="light"&&appearance!=="dark"&&appearance!=="system"){appearance="system";}
var resolved=appearance;
if(appearance==="system"){resolved=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";}
var el=document.documentElement;
el.setAttribute("data-theme",resolved);
el.classList.remove("light","dark");el.classList.add(resolved);
try{el.style.colorScheme=resolved;}catch(e){}
}catch(e){}})();`;
