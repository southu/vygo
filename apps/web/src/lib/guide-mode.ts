export const GUIDE_MODE_STORAGE_KEY = "ratchet-guide-mode";

export type GuideMode = "beginner" | "expert";

/** Stable slug for an individual AdvancedExpander, derived from its title. */
export function guideExpanderKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** localStorage key an individual expander's open/closed state persists under. */
export function guideExpanderStorageKey(title: string): string {
  return `ratchet-guide-expander:${guideExpanderKey(title)}`;
}
