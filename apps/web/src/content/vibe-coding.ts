/**
 * Content for the /vibe-coding hub landing page.
 *
 * The Topics grid is data-driven: it renders by iterating `vibeCodingModules`,
 * so adding a future module only requires appending one entry here — no page
 * redesign. Coming-soon modules with a published stub page carry their route
 * and link to it; only modules without any page keep `route: null`.
 */
export type VibeModuleStatus = "available" | "coming-soon";

export type VibeCodingModule = {
  title: string;
  blurb: string;
  /** Public route once a page exists (full module or stub); null when there is no page yet. */
  route: string | null;
  status: VibeModuleStatus;
};

export const vibeCodingModules: VibeCodingModule[] = [
  {
    title: "Ratchet system guide",
    blurb:
      "The full documentation pack: overview, architecture, the loop contract, Composer, Vault, operations, and the Mermaid diagram gallery.",
    route: "/vibe-coding/ratchet-guide",
    status: "available",
  },
  {
    title: "Rebuild checklist",
    blurb:
      "Greenfield rebuild in phases A–E: host setup, control plane, deploy gate, first real mission, then hardening.",
    route: null,
    status: "coming-soon",
  },
  {
    title: "Writing missions",
    blurb:
      "Scoping goals into 4–8 verifiable steps with acceptance criteria a live tester can actually check.",
    route: "/vibe-coding/writing-missions",
    status: "coming-soon",
  },
  {
    title: "Live verify & testing",
    blurb:
      "How the deploy gate and read-only tester grade the live product, and why only a streak of passes counts.",
    route: "/vibe-coding/live-verify-testing",
    status: "coming-soon",
  },
  {
    title: "Models & costs",
    blurb:
      "Builder/tester model tiers, what a mission costs end to end, and where FAIL cycles add up.",
    route: "/vibe-coding/models-and-costs",
    status: "coming-soon",
  },
  {
    title: "Case studies",
    blurb:
      "Real missions annotated from goal to streak of passes, with deploy-gate evidence and honest numbers.",
    route: "/vibe-coding/case-studies",
    status: "coming-soon",
  },
  {
    title: "Composer walkthrough",
    blurb:
      "A guided tour of the control-plane UI: Build home, the queue builder, models, and the unified nav.",
    route: null,
    status: "coming-soon",
  },
  {
    title: "Vault deep-dive",
    blurb:
      "How credentials are armed, brokered per task, and kept out of the builder environment entirely.",
    route: null,
    status: "coming-soon",
  },
];

export const vibeCodingContent = {
  hero: {
    eyebrow: "Vibe coding",
    heading: "Vibe coding that only moves forward",
    intro:
      "Vibe coding is steering AI builders with clear goals while a control plane proves every step against the live product. This hub is how we run it: the loop, the rules, and the guide.",
    primaryCta: { label: "Start free", href: "/apply" },
    guideCta: {
      label: "Read the guide",
      href: "/content/vibe-coding/ratchet-guide/README.md",
    },
    checklistCta: {
      label: "Rebuild checklist",
      href: "/content/vibe-coding/ratchet-guide/rebuild.md",
    },
  },
  definition: {
    heading: "What vibe coding is — and what it is not",
    isTitle: "What it is",
    isPoints: [
      "Setting goals and constraints while an AI builder writes and pushes the code.",
      "Iterating in small, verifiable steps against the deployed product, not a local hope.",
      "A control loop: build, pass a live deploy gate, get tested, repeat until a streak of passes.",
    ],
    isNotTitle: "What it is not",
    isNotPoints: [
      "Not one mega-prompt expected to produce a finished product overnight.",
      "Not trusting an agent's claim of \u201cdone\u201d — only the live site counts.",
      "Not a sandbox: no secrets in the builder environment, no unverified merges.",
    ],
  },
  loop: {
    heading: "The loop",
    intro: "Every mission runs the same ratchet. It never moves backward:",
    steps: [
      { title: "Goal", body: "A human states the outcome." },
      { title: "Multi-step missions", body: "Queued as ~4–8 verifiable steps." },
      { title: "Build", body: "The AI builder pushes code." },
      { title: "Live deploy gate", body: "/version must report the new SHA." },
      { title: "Test", body: "A tester grades the live site." },
      { title: "Streak of passes", body: "Consecutive passes close the loop." },
    ],
    failNote:
      "A FAIL sends the mission back to Build with the tester's report. Nobody babysits; the ratchet just holds.",
    caption: "Goal → multi-step missions → build → live deploy gate → test → streak of passes.",
  },
  nonNegotiables: {
    heading: "Non-negotiables",
    items: [
      {
        title: "Live is truth",
        body: "The tester grades the deployed site at its live URL. Local trees and agent claims do not count.",
      },
      {
        title: "/version must report the deploy SHA",
        body: "Every deploy answers with the actual git SHA, so the gate can prove what is really live before anything is graded.",
      },
      {
        title: "No secrets in the builder environment",
        body: "Credentials stay in Vault and are brokered per task. The builder environment never holds them.",
      },
      {
        title: "Multi-step goals (~4–8 steps), never one mega-prompt",
        body: "Real product work is queued as multi-step missions, each step small enough to verify on its own.",
      },
    ],
  },
  mentalModel: {
    heading: "The mental model",
    sentence:
      "Composer is the factory office where goals become queued missions, Ratchet is the factory floor that runs the build–deploy–test loop, and Vault is the key cabinet that keeps credentials out of the builder's hands.",
  },
  topics: {
    heading: "Topics",
    intro:
      "Every card below renders from a single module list — adding a topic means appending one entry. Start with the guide; the remaining topics publish here as they ship.",
  },
  finalCta: {
    heading: "Build with a ratchet, not a leap of faith",
    body: "Tell us what you are building. We will show you the loop running against your own live URL.",
  },
} as const;
