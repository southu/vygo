type Step = {
  title: string;
  weeks: string;
  body: string;
};

type MethodTimelineProps = {
  steps: readonly Step[];
};

export function MethodTimeline({ steps }: MethodTimelineProps) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.title} className="card relative">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-purple text-sm font-bold text-white"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">{step.title}</h3>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                {step.weeks}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
