type HeroArchitectureDiagramProps = {
  validated: { title: string; items: readonly string[] };
  pipelineLabel: string;
  production: { title: string; items: readonly string[] };
  caption: string;
};

export function HeroArchitectureDiagram({
  validated,
  pipelineLabel,
  production,
  caption,
}: HeroArchitectureDiagramProps) {
  return (
    <figure
      className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
      aria-label="Architecture transition from validated prototype to production platform"
    >
      <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr]">
        <div className="border-b border-border p-5 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {validated.title}
          </p>
          <ul className="mt-4 space-y-2">
            {validated.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-center border-b border-border bg-purple-soft/50 px-4 py-5 md:border-b-0 md:border-r md:px-3">
          <div className="text-center">
            <div
              className="mx-auto mb-2 hidden h-10 w-10 items-center justify-center rounded-full bg-purple text-white md:flex"
              aria-hidden="true"
            >
              →
            </div>
            <p className="max-w-[7rem] text-[0.7rem] font-semibold uppercase leading-tight tracking-[0.06em] text-purple-dark">
              {pipelineLabel}
            </p>
          </div>
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-green-dark">
            {production.title}
          </p>
          <ul className="mt-4 space-y-2">
            {production.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="border-t border-border bg-canvas px-5 py-3 text-center text-sm font-semibold text-ink">
        {caption}
      </figcaption>
    </figure>
  );
}
