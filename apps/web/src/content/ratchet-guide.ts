/**
 * Registry for the Ratchet system guide (v1.2) rendered pages.
 *
 * The six key documents of the sanitized pack (content/vibe-coding/ratchet-guide/)
 * are rendered as proper site pages under /vibe-coding/ratchet-guide/. This module
 * is the single source of truth for the doc set, the read order used by the
 * prev/next guide navigation, and the mapping from pack-internal markdown links
 * (./other-doc.md) to public URLs — rendered pages where one exists, the raw
 * versioned markdown under /content otherwise.
 */

export type GuideDoc = {
  /** Route segment under /vibe-coding/ratchet-guide. */
  slug: string;
  /** Short title used in cards and prev/next navigation. */
  title: string;
  /** Markdown source filename inside the pack. */
  sourceFile: string;
  /** Rendered page URL. */
  href: string;
  /** One-line summary (from the pack manifest). */
  blurb: string;
};

export const guideIndex = {
  slug: "index",
  title: "Guide index",
  href: "/vibe-coding/ratchet-guide",
} as const;

/**
 * Read order of the rendered docs. The guide index is the implicit head of the
 * chain: index → overview → architecture → one-pager → rebuild → ai-prompts →
 * footguns (→ back to index).
 */
export const guideDocs: [GuideDoc, ...GuideDoc[]] = [
  {
    slug: "overview",
    title: "Overview",
    sourceFile: "overview.md",
    href: "/vibe-coding/ratchet-guide/overview",
    blurb: "Elevator pitch, happy-path flow, and component cheat sheet",
  },
  {
    slug: "architecture",
    title: "Architecture",
    sourceFile: "architecture.md",
    href: "/vibe-coding/ratchet-guide/architecture",
    blurb: "System map, trust boundaries, end-to-end data flow, and process model",
  },
  {
    slug: "one-pager",
    title: "One-pager",
    sourceFile: "one-pager.md",
    href: "/vibe-coding/ratchet-guide/one-pager",
    blurb: "Single-sheet printable summary of the whole system",
  },
  {
    slug: "rebuild",
    title: "Rebuild checklist",
    sourceFile: "rebuild.md",
    href: "/vibe-coding/ratchet-guide/rebuild",
    blurb: "Greenfield rebuild checklist in phases A–E, from host setup to hardening",
  },
  {
    slug: "ai-prompts",
    title: "AI prompt pack",
    sourceFile: "ai-prompts.md",
    href: "/vibe-coding/ratchet-guide/ai-prompts",
    blurb:
      "Paste-ready prompts for rebuild, ops, heal, deploy-timeout, new product, and sidecar agents",
  },
  {
    slug: "footguns",
    title: "Footguns",
    sourceFile: "footguns.md",
    href: "/vibe-coding/ratchet-guide/footguns",
    blurb: "Production failure modes: symptom, likely cause, and fix direction",
  },
];

/** Print/PDF-friendly self-contained HTML rendering of the one-pager (from the pack). */
export const guideOnePagerPrintHref = "/content/vibe-coding/ratchet-guide/one-pager-print";

export function getGuideDoc(slug: string): GuideDoc {
  const doc = guideDocs.find((entry) => entry.slug === slug);
  if (!doc) {
    throw new Error(`Unknown ratchet-guide doc slug: ${slug}`);
  }
  return doc;
}

export type GuideNavLink = {
  /** Small label above the link title ("Previous" / "Next" / "Back to the start"). */
  kicker: string;
  title: string;
  href: string;
};

/**
 * Prev/next links for a rendered doc page. The chain runs through the index at
 * both ends: the first doc's prev is the guide index, and the last doc's next
 * returns to the index so every doc page carries both a prev and a next link.
 */
export function getGuideDocNav(slug: string): { prev: GuideNavLink; next: GuideNavLink } {
  const index = guideDocs.findIndex((entry) => entry.slug === slug);
  if (index === -1) {
    throw new Error(`Unknown ratchet-guide doc slug: ${slug}`);
  }
  const prevDoc = index > 0 ? guideDocs[index - 1] : null;
  const nextDoc = index < guideDocs.length - 1 ? guideDocs[index + 1] : null;
  return {
    prev: prevDoc
      ? { kicker: "← Previous", title: prevDoc.title, href: prevDoc.href }
      : { kicker: "← Previous", title: guideIndex.title, href: guideIndex.href },
    next: nextDoc
      ? { kicker: "Next →", title: nextDoc.title, href: nextDoc.href }
      : { kicker: "Back to the start ↺", title: guideIndex.title, href: guideIndex.href },
  };
}

const renderedDocHrefs = new Map(guideDocs.map((doc) => [doc.slug, doc.href]));

/**
 * Map a pack-internal link target (e.g. "./architecture.md" or
 * "./operations.md#anchor" as they appear in the markdown sources) to a public
 * URL. Links to the six rendered docs go to their site pages; the pack README
 * resolves to the guide index; every other file resolves to the raw versioned
 * markdown served under /content. Absolute URLs and already-rooted paths pass
 * through unchanged.
 */
export function resolveGuidePackHref(href: string): string {
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    /^https?:\/\//.test(href)
  ) {
    return href;
  }
  const [pathPart = "", hashPart] = href.replace(/^\.\//, "").split("#");
  const hash = hashPart ? `#${hashPart}` : "";
  const base = pathPart.replace(/\.md$/i, "");
  if (base === "README") {
    return `${guideIndex.href}${hash}`;
  }
  const rendered = renderedDocHrefs.get(base);
  if (rendered) {
    return `${rendered}${hash}`;
  }
  return `/content/vibe-coding/ratchet-guide/${pathPart}${hash}`;
}

/** Public URL for a pack manifest entry (filename as listed in manifest.json). */
export function guidePackEntryHref(filename: string): string {
  const base = filename.replace(/\.md$/i, "");
  const rendered = renderedDocHrefs.get(base);
  if (rendered) {
    return rendered;
  }
  return `/content/vibe-coding/ratchet-guide/${filename}`;
}

/** True when the pack document is one of the six rendered site pages. */
export function isRenderedGuideDoc(filename: string): boolean {
  return renderedDocHrefs.has(filename.replace(/\.md$/i, ""));
}
