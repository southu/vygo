import type { Metadata } from "next";
import { ModulePage } from "@/components/vibe-coding/ModulePage";
import { getVibeModulePage } from "@/content/vibe-coding-modules";

const module = getVibeModulePage("ratchet-guide");

export const metadata: Metadata = {
  title: `${module.title} — Vibe coding`,
  description: module.description,
};

/** Entry points into the versioned markdown pack served from /content. */
const packLinks = [
  {
    href: "/content/vibe-coding/ratchet-guide/README.md",
    title: "Guide index (README)",
    blurb: "The pack's table of contents: every document and what it covers.",
  },
  {
    href: "/content/vibe-coding/ratchet-guide/overview.md",
    title: "Overview",
    blurb: "What Ratchet is and why the loop never moves backward.",
  },
  {
    href: "/content/vibe-coding/ratchet-guide/architecture.md",
    title: "Architecture",
    blurb: "Composer, Ratchet, and Vault — how the pieces fit together.",
  },
  {
    href: "/content/vibe-coding/ratchet-guide/loop-and-missions.md",
    title: "The loop & missions",
    blurb: "The build–deploy–test contract every mission runs under.",
  },
  {
    href: "/content/vibe-coding/ratchet-guide/vault.md",
    title: "Vault",
    blurb: "How credentials stay out of the builder environment entirely.",
  },
  {
    href: "/content/vibe-coding/ratchet-guide/rebuild.md",
    title: "Rebuild checklist",
    blurb: "Greenfield rebuild in phases A–E, from host setup to hardening.",
  },
];

export default function RatchetGuidePage() {
  return (
    <ModulePage module={module}>
      <section
        className="section-pad border-t border-border bg-surface"
        data-section="guide-contents"
      >
        <div className="container-page max-w-3xl">
          <h2 className="font-display text-2xl font-bold">Start reading</h2>
          <p className="mt-4 text-muted">
            The guide is a plain-markdown pack served alongside this site, so every document opens
            directly in the browser. Begin with the index, then the overview.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {packLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="card block h-full transition-colors hover:border-purple"
                >
                  <h3 className="font-display text-base font-semibold">{link.title}</h3>
                  <p className="mt-2 text-sm text-muted">{link.blurb}</p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </ModulePage>
  );
}
