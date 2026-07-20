type EngagementCardProps = {
  name: string;
  price: string;
  duration: string;
  badge?: string | null;
  summary: string;
  outcomes: readonly string[];
  featured?: boolean;
  /**
   * Stable tier id used as the scroll anchor and the `data-highlight-target`
   * the readiness micro-CTAs ring on arrival (see PricingHighlight).
   */
  id?: string;
};

export function EngagementCard({
  name,
  price,
  duration,
  badge,
  summary,
  outcomes,
  featured = false,
  id,
}: EngagementCardProps) {
  return (
    <article
      id={id}
      data-highlight-target={id}
      className={`card scroll-mt-28 flex h-full flex-col ${featured ? "border-purple ring-2 ring-purple/20" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-ink">{name}</h3>
          <p className="mt-1 text-sm text-muted">{duration}</p>
        </div>
        {badge ? (
          <span className="rounded-full bg-purple-soft px-2.5 py-1 text-xs font-semibold text-purple-dark">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-4 font-display text-2xl font-bold text-purple">{price}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{summary}</p>
      <ul className="mt-5 flex-1 space-y-2">
        {outcomes.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-ink-soft">
            <span className="text-green-dark" aria-hidden="true">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
