type LoopStep = {
  title: string;
  body: string;
};

type VibeLoopDiagramProps = {
  steps: readonly LoopStep[];
  failNote: string;
  caption: string;
};

function StepArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 rotate-90 text-purple lg:rotate-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Inline HTML/SVG diagram of the Ratchet loop. Renders as a vertical chain on
 * small screens and a horizontal pipeline from lg up — no image assets.
 */
export function VibeLoopDiagram({ steps, failNote, caption }: VibeLoopDiagramProps) {
  return (
    <figure
      data-diagram="vibe-coding-loop"
      aria-label="Diagram of the loop: goal, multi-step missions, build, live deploy gate, test, streak of passes"
      className="card overflow-hidden"
    >
      <ol className="flex flex-col items-center gap-2 lg:flex-row lg:items-stretch">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex w-full flex-1 flex-col items-center gap-2 lg:w-auto lg:flex-row"
          >
            <div className="w-full flex-1 rounded-lg border border-border bg-canvas px-3 py-4 text-center">
              <p className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-purple text-xs font-bold text-white">
                {index + 1}
              </p>
              <p className="mt-2 font-display text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-xs text-muted">{step.body}</p>
            </div>
            {index < steps.length - 1 ? <StepArrow /> : null}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-amber/70 bg-canvas px-3 py-2">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-0.5 h-4 w-4 shrink-0 text-amber"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 14l-4-4 4-4" />
          <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
        </svg>
        <p className="text-xs text-muted">{failNote}</p>
      </div>
      <figcaption className="mt-3 border-t border-border pt-3 text-center text-sm font-semibold text-ink">
        {caption}
      </figcaption>
    </figure>
  );
}
