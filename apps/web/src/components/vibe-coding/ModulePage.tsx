import type { ReactNode } from "react";
import { getVibeModuleNeighbors, type VibeCodingModulePage } from "@/content/vibe-coding-modules";

/**
 * Shared template for every /vibe-coding/* module page. Renders the
 * breadcrumb back to the hub, the module header with its status badge, an
 * honest coming-soon panel for unpublished modules, any module-specific body
 * content, and prev/next navigation across the registry order. Styling comes
 * from the global design system (section-pad, container-page, card, chip) —
 * module pages add no per-page CSS.
 */
export function ModulePage({
  module,
  children,
}: {
  module: VibeCodingModulePage;
  children?: ReactNode;
}) {
  const { prev, next } = getVibeModuleNeighbors(module.slug);
  const comingSoon = module.status === "coming-soon";

  const badge = comingSoon ? (
    <span className="chip border-amber/40 bg-amber/10 text-amber" data-status="coming-soon">
      Coming soon
    </span>
  ) : (
    <span className="chip border-green/40 bg-green/10 text-green-dark" data-status="available">
      Available
    </span>
  );

  return (
    <main id="main-content" data-module={module.slug}>
      <section className="section-pad" data-section="module-header">
        <div className="container-page max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted" data-breadcrumb>
            <a href="/vibe-coding" className="font-medium text-purple hover:underline">
              Vibe coding
            </a>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span aria-current="page">{module.title}</span>
          </nav>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Vibe coding module</p>
            {badge}
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">{module.title}</h1>
          <p className="mt-6 text-lg text-muted">{module.description}</p>
        </div>
      </section>

      {comingSoon ? (
        <section
          className="section-pad border-t border-border bg-surface"
          data-section="coming-soon"
        >
          <div className="container-page max-w-3xl">
            <div className="card">
              <h2 className="font-display text-xl font-semibold">This module is coming soon</h2>
              <p className="mt-3 text-sm text-muted">
                The full module is still being written and will ship right here on this page — the
                summary above is what it will cover. In the meantime, start with the{" "}
                <a
                  href="/vibe-coding/ratchet-guide"
                  className="font-medium text-purple hover:underline"
                >
                  Ratchet system guide
                </a>{" "}
                or head back to the{" "}
                <a href="/vibe-coding" className="font-medium text-purple hover:underline">
                  vibe coding hub
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {children}

      <section className="section-pad border-t border-border" data-section="module-nav">
        <div className="container-page max-w-3xl">
          <nav aria-label="Module navigation" className="grid gap-4 sm:grid-cols-2">
            {prev ? (
              <a href={prev.href} className="card block transition-colors hover:border-purple">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  ← Previous module
                </p>
                <p className="mt-2 font-display text-lg font-semibold">{prev.title}</p>
              </a>
            ) : (
              <div aria-hidden="true" className="hidden sm:block" />
            )}
            {next ? (
              <a href={next.href} className="card block transition-colors hover:border-purple">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Next module →
                </p>
                <p className="mt-2 font-display text-lg font-semibold">{next.title}</p>
              </a>
            ) : (
              <div aria-hidden="true" className="hidden sm:block" />
            )}
          </nav>
        </div>
      </section>
    </main>
  );
}
