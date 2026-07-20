/**
 * Stable, human-readable slug for a readiness dimension name.
 *
 * Shared by the server-rendered deep-dive sections (their anchor ids) and the
 * client radar chart (its click-to-scroll targets) so the two always agree on
 * the fragment. Keep this pure and dependency-free — both sides import it.
 */
export function dimensionSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** DOM id of a dimension's deep-dive section (e.g. "dimension-security"). */
export function dimensionSectionId(name: string): string {
  return `dimension-${dimensionSlug(name)}`;
}
