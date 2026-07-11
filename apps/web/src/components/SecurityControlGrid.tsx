type ControlSection = {
  title: string;
  items: readonly string[];
};

type SecurityControlGridProps = {
  sections: readonly ControlSection[];
};

export function SecurityControlGrid({ sections }: SecurityControlGridProps) {
  return (
    <div id="controls" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <section key={section.title} className="card">
          <h3 className="font-display text-lg font-semibold text-ink">{section.title}</h3>
          <ul className="mt-4 space-y-2">
            {section.items.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
