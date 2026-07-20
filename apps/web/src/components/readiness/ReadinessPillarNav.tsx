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
 * Quick-jump pillar navigation for the readiness report. Renders two responsive
 * variants over the same pillar links — both anchor to the exact section id the
 * radar's click-to-scroll behaviour already targets ({@link dimensionSectionId}),
 * so radar, sidebar and mobile bar never drift.
 *
 * Desktop (>=1024px): a sticky left-hand sidebar. It lives in the left gutter
 * beside the centered reading column; the inner <nav> is `position: fixed`, so
 * it stays pinned to the viewport while the report scrolls (sticky was
 * unreliable under the page's `overflow-x: hidden` ancestor). The wrapper stays
 * out of flow, so the nav never reflows or overlaps the report content.
 *
 * Mobile/tablet (<1024px, where the sidebar is hidden): a sticky horizontal top
 * bar of the same pillar links. It pins just below the site header and scrolls
 * horizontally within its own box, so it never adds document-level horizontal
 * overflow.
 *
 * Both nav elements carry `data-readiness-pillar-nav` so {@link ReadinessScrollSpy}
 * highlights the current pillar in whichever variant is visible. Breakpoint
 * rules live in `.readiness-pillar-nav` / `.readiness-pillar-nav-mobile` in
 * globals.css.
 */
export function ReadinessPillarNav({ dimensions }: ReadinessPillarNavProps) {
  if (dimensions.length === 0) return null;

  const items = dimensions.map((dim) => ({
    id: dimensionSectionId(dim.dimension),
    label: PILLAR_LABELS[dim.dimension] ?? dim.dimension,
  }));

  return (
    <>
      <div className="readiness-pillar-nav" aria-hidden="false">
        <nav
          className="readiness-pillar-nav__inner"
          aria-label="Readiness pillars"
          data-readiness-pillar-nav
          data-testid="readiness-pillar-nav"
        >
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Pillars
          </p>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-purple-soft hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <nav
        className="readiness-pillar-nav-mobile"
        aria-label="Readiness pillars"
        data-readiness-pillar-nav
        data-testid="readiness-pillar-nav-mobile"
      >
        <ul className="readiness-pillar-nav-mobile__list">
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="readiness-pillar-nav-mobile__link">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
