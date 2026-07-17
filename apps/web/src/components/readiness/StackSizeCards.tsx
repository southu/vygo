/**
 * Presentational cards for the Readiness "Confirm findings" (Step 8) screen.
 *
 * These consume the structured stack/size data already produced by the
 * validation layer ({@link StackEntry}, {@link SizeMetric},
 * {@link SizeClassification}) — they do NOT re-parse the raw paste. They only
 * choose how to display it:
 *   - STACK -> shadcn Badge-style chips (the shared `.chip` utility) grouped
 *     under four category labels, each chip prefixed with a Lucide icon. Any
 *     stack text not represented by a chip is surfaced as a muted footnote so
 *     nothing from the previous paragraph is lost.
 *   - SIZE  -> a wrapping row of 3–5 stat tiles (big number + small label)
 *     plus a single one-line classification sentence.
 *
 * Styling uses only the existing design-system tokens/utilities (Tailwind +
 * `.chip` + `.readiness-step-panel`); no novel inline styles.
 */
import type { ReactNode } from "react";
import type { SizeClassification, SizeMetric, StackCategory, StackEntry } from "@vygo/validation";

type IconComponent = (props: IconProps) => ReactNode;

/* ── Lucide icons (inline SVG, MIT-licensed path data) ──────────────────── */

type IconProps = { className?: string };

/** Shared props so every glyph renders as a consistent Lucide-style stroke. */
const svgBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CodeIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function LayoutTemplateIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <rect width="18" height="7" x="3" y="3" rx="1" />
      <rect width="9" height="7" x="3" y="14" rx="1" />
      <rect width="5" height="7" x="16" y="14" rx="1" />
    </svg>
  );
}

function LayoutGridIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function DatabaseIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function RocketIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function ServerIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

const CATEGORY_ICON: Record<StackCategory, IconComponent> = {
  language: CodeIcon,
  framework: LayoutTemplateIcon,
  ui: LayoutGridIcon,
  auth: ShieldCheckIcon,
  infra: DatabaseIcon,
  deploy: RocketIcon,
};

/* ── STACK grouping ─────────────────────────────────────────────────────── */

/**
 * The four display groups requested for Step 8, each mapping the coarse
 * structured categories onto a labelled bucket. `infra` (data stores/services)
 * lives under "Auth & Data"; `deploy` targets under "Infra & Deploy".
 */
const STACK_GROUPS: { label: string; icon: IconComponent; categories: StackCategory[] }[] = [
  { label: "Languages", icon: CodeIcon, categories: ["language"] },
  { label: "Framework & UI", icon: LayoutTemplateIcon, categories: ["framework", "ui"] },
  { label: "Auth & Data", icon: DatabaseIcon, categories: ["auth", "infra"] },
  { label: "Infra & Deploy", icon: ServerIcon, categories: ["deploy"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compute the portion of the free-text stack paragraph that is NOT already
 * represented by a parsed chip, so no stack information is lost. Recognized
 * technology names (with any trailing version) are stripped from each
 * comma/·-separated segment; whatever meaningful text remains is the remainder.
 * Returns "" when everything is represented.
 */
export function stackRemainder(stackText: string, entries: StackEntry[]): string {
  const text = (stackText ?? "").trim();
  if (!text || /^not yet determined$/i.test(text)) return "";
  const names = [...entries].map((e) => e.name).sort((a, b) => b.length - a.length);
  const pieces: string[] = [];
  const seen = new Set<string>();
  for (const segment of text.split(/[·,]/)) {
    let s = segment;
    for (const name of names) {
      s = s.replace(new RegExp(`${escapeRegExp(name)}(\\s+v?\\d[\\d.]*)?`, "ig"), " ");
    }
    s = s
      .replace(/\b(on|via|with|using|and|plus|the|a|an|of|for|in|to)\b/gi, " ")
      .replace(/[^\w\s.+#/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length < 2) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pieces.push(s);
  }
  return pieces.join(" · ");
}

/* ── SIZE formatting ────────────────────────────────────────────────────── */

/** Format a metric value into a compact, prominent number (e.g. 40000 -> "40k"). */
export function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 1000) {
    const k = value / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return value.toLocaleString("en-US");
}

const SIZE_SENTENCE: Record<SizeClassification, string> = {
  small: "Small single-repo codebase.",
  medium: "Small-to-medium single-repo codebase.",
  large: "Large single-repo codebase.",
};

/** Build the single one-line classification sentence for the size card. */
export function sizeClassificationSentence(classification: SizeClassification | null): string {
  return classification ? SIZE_SENTENCE[classification] : "Single-repo codebase.";
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

export function ConfirmStackCard({
  label,
  entries,
  stackText,
}: {
  label: string;
  entries: StackEntry[];
  stackText: string;
}) {
  const remainder = stackRemainder(stackText, entries);
  return (
    <div className="readiness-step-panel" data-testid="readiness-confirm-stack">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-3 space-y-3">
        {STACK_GROUPS.map((group) => {
          const items = entries.filter((e) => group.categories.includes(e.category));
          const GroupIcon = group.icon;
          return (
            <div key={group.label} data-testid={`stack-group-${group.label}`}>
              <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
                <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                {group.label}
              </p>
              {items.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {items.map((item) => {
                    const ChipIcon = CATEGORY_ICON[item.category];
                    return (
                      <li key={`${group.label}-${item.name}`}>
                        <span className="chip gap-1.5">
                          <ChipIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                          {item.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted/70">—</p>
              )}
            </div>
          );
        })}
      </div>
      {remainder ? (
        <p className="mt-3 text-xs text-muted" data-testid="readiness-confirm-stack-remainder">
          Also noted: {remainder}
        </p>
      ) : null}
    </div>
  );
}

export function ConfirmSizeCard({
  label,
  metrics,
  classification,
}: {
  label: string;
  metrics: SizeMetric[];
  classification: SizeClassification | null;
}) {
  const tiles = metrics.slice(0, 5);
  return (
    <div className="readiness-step-panel" data-testid="readiness-confirm-size">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {tiles.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="size-stat-tiles">
          {tiles.map((metric) => (
            <li
              key={metric.label}
              className="min-w-0 rounded-xl border border-border bg-canvas px-3 py-3"
            >
              <p className="text-xl font-bold leading-tight text-ink sm:text-2xl">
                {formatMetricValue(metric.value)}
              </p>
              <p className="mt-1 truncate text-xs text-muted" title={metric.label}>
                {metric.label}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm font-medium text-ink-soft" data-testid="size-classification">
        {sizeClassificationSentence(classification)}
      </p>
    </div>
  );
}
