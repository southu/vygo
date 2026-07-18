/**
 * Screenshot/illustration placeholder for a step that refers to a screen or
 * button. A styled image-slot frame plus a figcaption describing what the
 * real screenshot will show once captured.
 */
export function ScreenshotPlaceholder({
  caption,
  label = "Screenshot placeholder",
}: {
  caption: string;
  label?: string;
}) {
  return (
    <figure className="screenshot-placeholder" data-screenshot-placeholder>
      <div className="screenshot-placeholder-frame" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M3 15.5l5-5 4 4 3-3 6 5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8" cy="9" r="1.5" />
        </svg>
        <span>{label}</span>
      </div>
      <figcaption className="screenshot-placeholder-caption">{caption}</figcaption>
    </figure>
  );
}
