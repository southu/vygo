import type { CampaignImage } from "@/lib/campaign/types";

/**
 * Plain <img> (the site is a static export, so next/image optimization is off).
 * Always emits explicit width/height; content images add srcset/sizes; below-
 * the-fold images use loading="lazy".
 */
export function CampaignMedia({ image, className }: { image: CampaignImage; className?: string }) {
  return (
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.sizes}
      width={image.width}
      height={image.height}
      alt={image.alt}
      loading={image.lazy ? "lazy" : "eager"}
      decoding="async"
      className={className}
    />
  );
}
