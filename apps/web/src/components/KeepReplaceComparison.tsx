type KeepReplaceComparisonProps = {
  keepTitle: string;
  keep: readonly string[];
  replaceTitle: string;
  replace: readonly string[];
};

export function KeepReplaceComparison({
  keepTitle,
  keep,
  replaceTitle,
  replace,
}: KeepReplaceComparisonProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card border-green/30 bg-green/5">
        <h3 className="font-display text-lg font-semibold text-green-dark">{keepTitle}</h3>
        <ul className="mt-4 space-y-2">
          {keep.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-ink-soft">
              <span className="font-semibold text-green-dark" aria-hidden="true">
                +
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3 className="font-display text-lg font-semibold text-ink">{replaceTitle}</h3>
        <ul className="mt-4 space-y-2">
          {replace.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-ink-soft">
              <span className="font-semibold text-purple" aria-hidden="true">
                ↻
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
