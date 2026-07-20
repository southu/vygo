import type { ChartDimension } from "@/components/charts/types";
import { dimensionSectionId } from "@/lib/readiness/dimension-slug";

type ReadinessPillarNavProps = {
  dimensions: ChartDimension[];
};

/**
 * Short, display-friendly label per pillar. The report's dimension name drives
 * the anchor id (via {@link dimensionSectionId}), but a couple of dimensions
 * read better in a compact sidebar as a single word — e.g. "Compliance posture"
 * shows as "Compliance". Anything not overridden falls back to its full name.
 */
const PILLAR_LABELS: Record<string, string> = {
  "Compliance posture": "Compliance",
};

/**
 * Sticky, left-hand quick-jump sidebar for the readiness report. Each link is an
 * in-page anchor that reuses the exact section id the radar's click-to-scroll
 * behaviour already targets ({@link dimensionSectionId}), so the two never drift.
 *
 * Desktop-only (>=1024px): it lives in the left gutter beside the centered
 * reading column. The outer wrapper is absolutely positioned (out of flow) so
 * the nav never reflows or overlaps the report content; the inner <nav> — the
 * element with the links — is itself `position: sticky`, so it keeps its own
 * sticky computed position and stays in view while the report scrolls. Hidden
 * entirely below the desktop breakpoint — see `.readiness-pillar-nav` in
 * globals.css.
 */
export function ReadinessPillarNav({ dimensions }: ReadinessPillarNavProps) {
  if (dimensions.length === 0) return null;

  return (
    <div className="readiness-pillar-nav" aria-hidden="false">
      <nav
        className="readiness-pillar-nav__inner"
        aria-label="Readiness pillars"
        data-testid="readiness-pillar-nav"
      >
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Pillars
        </p>
        <ul className="space-y-0.5">
          {dimensions.map((dim) => {
            const label = PILLAR_LABELS[dim.dimension] ?? dim.dimension;
            return (
              <li key={dim.dimension}>
                <a
                  href={`#${dimensionSectionId(dim.dimension)}`}
                  className="block rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-purple-soft hover:text-ink"
                >
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
