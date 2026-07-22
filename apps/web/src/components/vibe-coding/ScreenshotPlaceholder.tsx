/**
 * Screenshot/illustration slot for a step that refers to a screen or button.
 *
 * When an `asset` filename is supplied, the figure renders the real screenshot
 * image from /content/ratchet-guide-assets/<asset>. Until a captured screenshot
 * replaces the seeded placeholder art, the styled image-slot frame plus the
 * figcaption still describe what the screenshot shows. Passing no `asset`
 * renders the frame-only placeholder (legacy behavior).
 */
const ASSET_BASE = "/content/ratchet-guide-assets";

export function ScreenshotPlaceholder({
  caption,
  asset,
  label = "Screenshot placeholder",
}: {
  caption: string;
  asset?: string;
  label?: string;
}) {
  return (
    <figure className="screenshot-placeholder" data-screenshot-placeholder>
      {asset ? (
        <img
          className="screenshot-placeholder-img"
          src={`${ASSET_BASE}/${asset}`}
          alt={caption}
          width={1200}
          height={675}
          loading="lazy"
        />
      ) : (
        <div className="screenshot-placeholder-frame" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M3 15.5l5-5 4 4 3-3 6 5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="9" r="1.5" />
          </svg>
          <span>{label}</span>
        </div>
      )}
      <figcaption className="screenshot-placeholder-caption">{caption}</figcaption>
    </figure>
  );
}
