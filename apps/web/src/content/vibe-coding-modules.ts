/**
 * Ordered registry of /vibe-coding/* module pages.
 *
 * This list is the single source of truth for module identity, the prev/next
 * module order, and each module's summary. Module pages render through the
 * shared ModulePage template, which reads neighbors from this registry — so
 * shipping a new module means adding one entry here plus one page file, with
 * no edits to the template or the hub layout.
 */
export type VibeModulePageStatus = "available" | "coming-soon";

export type VibeCodingModulePage = {
  /** Route segment under /vibe-coding. */
  slug: string;
  title: string;
  href: string;
  status: VibeModulePageStatus;
  /** One-paragraph summary of what the module covers (shown on the page). */
  description: string;
};

/** Prev/next order: ratchet-guide → … → case-studies. */
export const vibeCodingModulePages: VibeCodingModulePage[] = [
  {
    slug: "ratchet-guide",
    title: "Ratchet system guide",
    href: "/vibe-coding/ratchet-guide",
    status: "available",
    description:
      "The complete Ratchet system documentation: overview, architecture, the loop contract, Composer, Vault, operations, principles, and the Mermaid diagram gallery, plus the phase A–E rebuild checklist for standing the system up from scratch. The pack ships as versioned markdown alongside this site; this page is the canonical module entry point that orients you before you dive into the files.",
  },
  {
    slug: "writing-missions",
    title: "Writing missions",
    href: "/vibe-coding/writing-missions",
    status: "coming-soon",
    description:
      "How to write missions an AI builder can actually execute: scoping a goal into four to eight verifiable steps, phrasing acceptance criteria a live tester can check against the deployed product, sequencing work so every deploy leaves the site strictly better, and avoiding the mega-prompt trap that produces unverifiable, all-or-nothing builds.",
  },
  {
    slug: "live-verify-testing",
    title: "Live verify & testing",
    href: "/vibe-coding/live-verify-testing",
    status: "coming-soon",
    description:
      "The verification half of the loop: how a read-only tester grades the deployed product rather than the builder's claims, what the live deploy gate proves before anything is graded, how FAIL reports route concrete findings back to the builder for the next iteration, and why a streak of consecutive live-verified passes is the only definition of done.",
  },
  {
    slug: "models-and-costs",
    title: "Models & costs",
    href: "/vibe-coding/models-and-costs",
    status: "coming-soon",
    description:
      "The economics of running the loop: how builder and tester model choices trade quality, speed, and price; what a typical mission costs end to end from goal to a streak of passes; where retries and FAIL cycles add up; and how to pick model tiers so verification stays rigorous without burning budget on overpowered models for simple steps.",
  },
  {
    slug: "case-studies",
    title: "Case studies",
    href: "/vibe-coding/case-studies",
    status: "coming-soon",
    description:
      "Real missions run with the Ratchet loop, annotated end to end: timelines from stated goal to a streak of live-verified passes, the FAIL reports that sent work back and what changed on the next iteration, deploy-gate evidence served by the /version endpoint, and honest numbers on iterations, model cost, and elapsed time to a verified result.",
  },
];

export function getVibeModulePage(slug: string): VibeCodingModulePage {
  const module = vibeCodingModulePages.find((entry) => entry.slug === slug);
  if (!module) {
    throw new Error(`Unknown vibe-coding module slug: ${slug}`);
  }
  return module;
}

/** Adjacent modules in the defined order; null at the first/last ends. */
export function getVibeModuleNeighbors(slug: string): {
  prev: VibeCodingModulePage | null;
  next: VibeCodingModulePage | null;
} {
  const index = vibeCodingModulePages.findIndex((entry) => entry.slug === slug);
  if (index === -1) {
    throw new Error(`Unknown vibe-coding module slug: ${slug}`);
  }
  return {
    prev: index > 0 ? (vibeCodingModulePages[index - 1] ?? null) : null,
    next:
      index < vibeCodingModulePages.length - 1 ? (vibeCodingModulePages[index + 1] ?? null) : null,
  };
}
