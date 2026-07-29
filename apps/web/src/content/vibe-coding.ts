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
      "The full documentation pack: overview, architecture, the loop contract, Composer, Vault, design principles, and the Mermaid diagram gallery.",
    route: "/vibe-coding/ratchet-guide",
    status: "available",
  },
  {
    title: "Rebuild checklist",
    blurb:
      "Greenfield product milestones in phases A–E: foundations, config rules, credentials boundary, first product, then hardening.",
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
      "A guided tour of the goal-capture surface: drafting multi-step missions, product shells, and queue status.",
    route: null,
    status: "coming-soon",
  },
  {
    title: "Vault deep-dive",
    blurb:
      "How credentials stay behind a brokered boundary and never enter the builder environment.",
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
      href: "/vibe-coding/ratchet-guide",
    },
    checklistCta: {
      label: "Rebuild checklist",
      href: "/vibe-coding/ratchet-guide/rebuild",
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
  whatsNew: {
    heading: "What changed since v1",
    intro:
      "The loop above still holds. What changed is what happens inside Build and the deploy gate — three refinements shipped since this article first went live:",
    items: [
      {
        title: "Deploy gating got more than one shape",
        body: "v1 waited on a single version signal. The gate now supports three interchangeable strategies per project — poll a version endpoint, wait a fixed delay, or run a command — including a CI-gated variant that only lets a build reach the tester once its own pipeline is green.",
      },
      {
        title: "A self-healing (babysit) loop watches the build, not just the product",
        body: "Before a change ever reaches the deploy gate, an automated pass watches the pushed branch for CI failures, merge conflicts, and stale state, and repairs them without waiting on a human. The ratchet now stalls on real product bugs, not on plumbing.",
      },
      {
        title: "Ops tooling: a sandboxed tester and an append-only bug ledger",
        body: "The live tester runs three structurally isolated passes that must agree before a PASS counts, and every FAIL it reports is appended to a durable ledger instead of overwriting the last one — so a bug that resurfaces after being “fixed” shows up as history, not a surprise.",
      },
    ],
    example: {
      caption: "Illustrative deploy-gate config for a project (placeholder values):",
      code: [
        "# .env — deploy-gate configuration",
        "DEPLOY_VERSION_URL=https://example.com/version",
        "REPO_SLUG=your-org/your-repo",
        "CI_STATUS_URL=https://ci.example.com/status/${COMMIT_SHA}",
      ].join("\n"),
    },
  },
  learnings: {
    heading: "Learnings",
    intro:
      "Transferable principles for anyone running an autonomous build–deploy–test loop in production — not anecdotes about any one install:",
    items: [
      {
        title: "Automate the boring failures away from the interesting ones",
        body: "A build-deploy-test loop produces two very different failure kinds: infrastructure noise (flaky CI, a stale branch, a merge conflict) and real product defects. Route the first kind to an automated self-healing pass and reserve human and agent attention for the second — mixing them trains everyone to stop reading the loop's reports.",
      },
      {
        title: "One flaky pass is not a pass",
        body: "If verification is cheap enough to re-run, require agreement across multiple independent passes before accepting a result. A single green run tells you the code can pass; a streak tells you it does.",
      },
      {
        title: "Make failures durable, not disposable",
        body: "An append-only ledger of what failed and when turns “didn't we already fix this?” from a guess into a lookup. Overwriting the last failure with the current one destroys exactly the information you need when something regresses.",
      },
      {
        title: "Bound every automated step with a timeout and a fixed retry budget",
        body: "A loop that can retry forever is indistinguishable from one that's stuck. A hard wall-clock limit plus a single automatic retry keeps a hang from becoming an outage, without letting a retry storm run away.",
      },
      {
        title: "Give every deploy an honest, independently checkable proof of what's live",
        body: "Whichever gating strategy you pick — polling a status endpoint, waiting out a fixed delay, or running a command — the tester must be able to verify the deploy on its own, independent of anything the builder claims.",
      },
      {
        title: "Keep the watcher role strictly observational",
        body: "Whatever process babysits the pipeline should repair plumbing, not slip in product changes of its own — otherwise you've just added a second, unaccountable builder.",
      },
    ],
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
