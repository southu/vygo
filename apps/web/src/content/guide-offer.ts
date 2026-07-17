/**
 * Copy for the "Get the guide" offer shown on both offer surfaces: the
 * /vibe-coding hub and the /vibe-coding/ratchet-guide index. One source of
 * truth so both surfaces state the same assurances and carry the same CTAs.
 *
 * The zip href points at a static build artifact assembled from the sanitized
 * pack (content/vibe-coding/ratchet-guide/) by scripts/build-guide-zip.ts —
 * no login, no auth gate. If the pack version changes, the zip filename
 * changes with it; update the href here at the same time.
 */
export const guideOffer = {
  eyebrow: "Get the guide",
  heading: "Get the guide",
  title: "Ratchet system guide v1.2",
  intro:
    "The complete Ratchet system guide, v1.2, as one free zip: overview, architecture, the loop contract, Composer, Vault, runtime services overview, and the phase A–E rebuild checklist.",
  assurances: [
    "The guide is free — the full v1.2 pack, no signup and no paywall.",
    "It contains no API keys, no vault passwords, and no host credentials.",
    "Paths in the guide are illustrative — rename them to match your own install.",
    "It is architecture and how-to documentation, not access to anyone's running VPC.",
  ],
  ctas: {
    startFree: {
      label: "Start free",
      href: "/content/vibe-coding/ratchet-guide-v1.2.zip",
    },
    readGuide: { label: "Read the guide", href: "/vibe-coding/ratchet-guide" },
    checklist: { label: "Rebuild checklist", href: "/vibe-coding/ratchet-guide/rebuild" },
  },
  note: "Start free downloads the zip directly — no login, no form.",
} as const;
