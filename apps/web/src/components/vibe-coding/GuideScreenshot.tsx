/**
 * Captured-screenshot figure for a guide step that refers to a screen or
 * button. Renders the real screenshot image from
 * /content/ratchet-guide-assets/<asset> with a figcaption describing the
 * depicted screen.
 */
const ASSET_BASE = "/content/ratchet-guide-assets";

export function GuideScreenshot({
  asset,
  alt,
  caption,
}: {
  asset: string;
  /** Descriptive alt text naming the depicted UI state and its key controls. */
  alt: string;
  caption: string;
}) {
  return (
    <figure className="guide-screenshot" data-guide-screenshot>
      <img
        className="guide-screenshot-img"
        src={`${ASSET_BASE}/${asset}`}
        alt={alt}
        width={1440}
        height={900}
        loading="lazy"
      />
      <figcaption className="guide-screenshot-caption">{caption}</figcaption>
    </figure>
  );
}
