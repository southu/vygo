import type { Metadata } from "next";
import { ModulePage } from "@/components/vibe-coding/ModulePage";
import { GuideToc, type GuideTocEntry } from "@/components/vibe-coding/GuideToc";
import { HeadingAnchor } from "@/components/vibe-coding/HeadingAnchor";
import { BackToTop } from "@/components/vibe-coding/BackToTop";
import { StepList, type Step } from "@/components/vibe-coding/StepCard";
import { Callout } from "@/components/vibe-coding/Callout";
import { CodeBlock } from "@/components/vibe-coding/CodeBlock";
import { ScreenshotPlaceholder } from "@/components/vibe-coding/ScreenshotPlaceholder";
import { AdvancedExpander } from "@/components/vibe-coding/AdvancedExpander";
import { GuideModeToggle } from "@/components/vibe-coding/GuideModeToggle";
import { getVibeModulePage } from "@/content/vibe-coding-modules";
import { guideDocs, guidePackEntryHref, isRenderedGuideDoc } from "@/content/ratchet-guide";
import { guideOffer } from "@/content/guide-offer";
import { readGuidePackManifest } from "@/lib/guide-source";
import { GUIDE_MODE_STORAGE_KEY } from "@/lib/guide-mode";

const module = getVibeModulePage("ratchet-guide");
const manifest = readGuidePackManifest();

export const metadata: Metadata = {
  title: `${module.title} — Vibe coding`,
  description: module.description,
};

/**
 * Table of contents for the how-to guide below. Ids here are the single
 * source of truth for every heading's anchor — each entry's id must match
 * the corresponding heading's id attribute exactly, and the h2 ids double
 * as the section's `data-section` value for continuity with the rest of
 * the page.
 */
const guideToc: GuideTocEntry[] = [
  { id: "get-set-up", title: "Step 1: Get set up", level: 2 },
  { id: "overview", title: "Understand what Ratchet does", level: 2 },
  { id: "quick-start", title: "Run your first mission", level: 2 },
  { id: "core-workflow", title: "Run the build, deploy, and test loop", level: 2 },
  { id: "build-real-provable-changes", title: "Build real, provable changes", level: 3 },
  {
    id: "wait-for-the-deploy-gate-to-confirm-your-push",
    title: "Wait for the deploy gate to confirm your push",
    level: 3,
  },
  { id: "test-only-the-live-deployed-app", title: "Test only the live, deployed app", level: 3 },
  {
    id: "know-what-done-means-at-every-layer",
    title: "Know what “done” means at every layer",
    level: 3,
  },
  { id: "going-further", title: "Go further with advanced usage", level: 2 },
  {
    id: "plan-multi-step-campaigns-instead-of-one-mega-mission",
    title: "Plan multi-step campaigns instead of one mega-mission",
    level: 3,
  },
  {
    id: "turn-on-infrastructure-provisioning-carefully",
    title: "Turn on infrastructure provisioning carefully",
    level: 3,
  },
  { id: "avoid-the-common-design-pitfalls", title: "Avoid the common design pitfalls", level: 3 },
  { id: "know-the-core-components", title: "Know the core components", level: 3 },
  { id: "read-the-full-system-guide", title: "Read the full system guide", level: 3 },
  { id: "browse-every-file-in-the-pack", title: "Browse every file in the pack", level: 3 },
  { id: "troubleshooting-faq", title: "Troubleshooting & FAQ", level: 2 },
  {
    id: "cant-start-a-run-missing-field",
    title: "I can't start a run — Composer says a field is missing",
    level: 3,
  },
  {
    id: "deploy-never-finishes",
    title: "My deploy never finishes and the gate looks stuck",
    level: 3,
  },
  {
    id: "version-endpoint-not-updating",
    title: "My version endpoint isn't returning the new SHA after I push",
    level: 3,
  },
  {
    id: "tester-keeps-failing",
    title: "The tester keeps failing the same criterion every iteration",
    level: 3,
  },
  {
    id: "mission-stopped-before-pass-streak",
    title: "My mission stopped before reaching a pass streak",
    level: 3,
  },
];

/** Small forward-path link appended to the end of each major guide section. */
function NextSectionLink({ href, title }: { href: string; title: string }) {
  return (
    <p className="mt-8">
      <a
        href={href}
        className="inline-flex items-center gap-1 font-medium text-purple hover:underline"
        data-guide-section-next
      >
        Next: {title} &rarr;
      </a>
    </p>
  );
}

/**
 * Setup prompt pasted into an AI coding tool after unzipping the guide pack.
 * Mirrors "AI prompt pack" prompt A (content/vibe-coding/ratchet-guide/ai-prompts.md)
 * with an added unzip instruction, so the two stay in sync in spirit.
 */
const guideZipFilename = guideOffer.ctas.startFree.href.split("/").pop();
const setupPrompt = `Unzip ${guideZipFilename} in this folder, then read the pack in order: README.md, then overview → architecture → principles → layout → loop-and-missions.

Follow the product contracts strictly:
- Live deploy gate via an honest public version signal (tester judges the live URL only)
- Builder proof-of-work from git state only (ignore agent claims)
- Secrets only via a credentials boundary — never in builder env
- Multi-step goals → multiple queue items
- Optional infra ensure is fail-closed; prefer bound cloud project identities
- Overnight helpers may observe only; they never implement product features

Start with: loop + mock roles + mission shape validation.
Then: goal capture + queue.
Then: real builder/tester roles and a credentials boundary stub.
Do not invent machine-specific install paths or operator runbooks.`;

/**
 * Step-card content for "Get set up" — the very first thing a visitor does,
 * before any other guide content. One card per action: download the zip into
 * the working folder, open the AI coding tool there, then run the prompt.
 */
const setupSteps: Step[] = [
  {
    title: "Download the system zip into your project folder",
    body: (
      <p>
        Pick (or create) the folder where you want to work with your AI coding tool, and download{" "}
        <a
          href={guideOffer.ctas.startFree.href}
          className="font-semibold text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
        >
          {guideOffer.title}
        </a>{" "}
        directly into it &mdash; no login, no form.
      </p>
    ),
  },
  {
    title: "Open your AI coding tool in that same folder",
    body: (
      <p>
        Launch your AI coding tool (Claude Code, Cursor, or similar) with that folder as its{" "}
        <strong>working directory</strong> &mdash; the same one the zip just landed in.
      </p>
    ),
  },
  {
    title: "Run the setup prompt",
    body: (
      <>
        <p>
          Paste this into your AI coding tool. It unzips the pack and finishes initial setup for
          you:
        </p>
        <CodeBlock code={setupPrompt} language="prompt" />
      </>
    ),
  },
];

/**
 * Step-card content for "Run your first mission" — the guide's first
 * end-to-end procedure. Every card is exactly one action; UI element names
 * (buttons, menus, fields) are bolded per the guide's step-card convention.
 */
const quickStartSteps: Step[] = [
  {
    title: "Create a product shell",
    body: (
      <>
        <p>
          In Composer, click <strong>New product shell</strong> and bind it to your{" "}
          <strong>Git remote</strong> field, your <strong>Live URL</strong> field, and a{" "}
          <strong>Version endpoint</strong> field (e.g. <code>GET /version</code>) that returns the
          deployed git SHA.
        </p>
        <ScreenshotPlaceholder caption="Composer's product shell setup screen, showing the Git remote, Live URL, and Version endpoint fields." />
      </>
    ),
  },
  {
    title: "Confirm your deploy and version endpoint",
    body: (
      <>
        <p>
          Make sure your host deploys automatically on push to your deploy branch, and that the{" "}
          <strong>Version endpoint</strong> is publicly reachable without a control-plane login
          &mdash; the deploy gate polls it directly. Confirm it responds before you start:
        </p>
        <CodeBlock code="curl -s https://your-app.example.com/version" language="shell" />
      </>
    ),
  },
  {
    title: "Describe your goal",
    body: (
      <>
        <p>
          Open Composer&apos;s <strong>Goal capture</strong> screen and type the change into the{" "}
          <strong>Goal</strong> field in plain language, e.g. &ldquo;Change the homepage CTA label
          to &lsquo;Get started&rsquo;.&rdquo; Note anything the change must not touch in the{" "}
          <strong>Constraints</strong> field.
        </p>
        <ScreenshotPlaceholder caption="The goal capture screen, with the Goal and Constraints fields." />
      </>
    ),
  },
  {
    title: "Accept the draft queue",
    body: (
      <>
        <p>
          For anything beyond a one-line goal, Composer splits it into a small queue of focused
          steps instead of one mega-mission. Click <strong>Accept draft</strong> to take the queue
          as-is for a first run.
        </p>
        <ScreenshotPlaceholder caption="The draft queue screen, showing the proposed steps and the Accept draft button." />
        <AdvancedExpander title="Editing draft steps before accepting">
          <Callout type="tip">
            You can edit any step&apos;s title or body before accepting &mdash; Composer treats your
            edits as the source of truth for that step.
          </Callout>
        </AdvancedExpander>
      </>
    ),
  },
  {
    title: "Set your limits",
    body: (
      <>
        <p>
          Choose a <strong>Max iterations</strong> field, a <strong>Pass streak</strong> field
          &mdash; the run of consecutive live passes required to finish (2 is a reasonable first
          value) &mdash; and an optional <strong>Spend cap</strong> field.
        </p>
        <ScreenshotPlaceholder caption="The run limits screen, with Max iterations, Pass streak, and Spend cap fields." />
      </>
    ),
  },
  {
    title: "Start the run",
    body: (
      <>
        <p>
          Click <strong>Start run</strong>. Each iteration is automatic: the builder pushes real
          commits, the deploy gate waits until your version endpoint matches the new SHA, and a
          tester checks only the live app and returns PASS or FAIL.
        </p>
        <ScreenshotPlaceholder caption="The mission control screen, showing the Start run button." />
      </>
    ),
  },
  {
    title: "Watch it iterate",
    body: (
      <>
        <p>
          Track progress on the <strong>Mission timeline</strong> panel. A FAIL carries the
          tester&apos;s feedback into the next build automatically. A PASS advances the streak. You
          do not need to intervene between iterations.
        </p>
        <ScreenshotPlaceholder caption="The mission timeline panel, showing build, deploy gate, and test status per iteration." />
      </>
    ),
  },
  {
    title: "Confirm your first pass",
    body: (
      <p>
        The mission finishes on its own once the required streak is reached. Open your live URL to
        confirm the change actually shipped.
      </p>
    ),
  },
];

/**
 * How-to guide: task-based sections in the order a new user actually works
 * (what Ratchet does → first mission → the build/deploy/test loop → advanced
 * usage), rather than the pack's feature/file order. The six rendered docs and
 * the full pack manifest are preserved as "Go further" reading material —
 * nothing from the prior guide is removed, only relocated under the section
 * a beginner needs it in.
 *
 * Below the module header, the guide body is a two-column layout: the GuideToc
 * (sticky sidebar at lg+, top dropdown below it) and the content column. Every
 * h2/h3 in the content column carries a stable id from guideToc above plus a
 * hover-revealed HeadingAnchor for copyable deep links. Multi-step procedures
 * render through StepList/StepCard; tips, warnings, and notes render through
 * Callout; commands and code snippets render through CodeBlock.
 */
export default function RatchetGuidePage() {
  return (
    <ModulePage module={module}>
      <div className="container-page -mt-4 pb-4">
        <a
          href="/content/vibe-coding/ratchet-guide/README.md"
          download="README.md"
          className="btn-secondary"
          data-download-link="guide-index-markdown"
        >
          Download raw Markdown (.md)
        </a>
      </div>
      <div
        className="container-page section-pad border-t border-border lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-10 xl:grid-cols-[16rem_1fr] xl:gap-14"
        data-guide-body
      >
        <div className="lg:col-span-2">
          <GuideModeToggle />
        </div>

        <GuideToc sections={guideToc} />

        <div className="min-w-0 guide-prose">
          <section className="card border-2 border-purple/30 bg-purple/5" data-section="get-set-up">
            <span
              className="chip border-purple/40 bg-white font-semibold text-purple"
              data-step-badge
            >
              Step 1
            </span>
            <h2 id="get-set-up" className="group scroll-mt-24 mt-3 font-display text-2xl font-bold">
              Get set up
              <HeadingAnchor id="get-set-up" />
            </h2>
            <p className="mt-4 text-lg text-muted">
              Do this once, before anything else on this page.
            </p>
            <StepList steps={setupSteps} />
            <NextSectionLink href="#overview" title="Understand what Ratchet does" />
          </section>

          <section className="mt-14" data-section="overview">
            <h2 id="overview" className="group scroll-mt-24 font-display text-2xl font-bold">
              Understand what Ratchet does
              <HeadingAnchor id="overview" />
            </h2>
            <p className="mt-4 text-lg text-muted">
              Ratchet is a control plane for AI software work that only calls a change
              &ldquo;done&rdquo; once the live site agrees. Every mission runs a build-and-verify
              loop: a coding agent builds and pushes real commits, a deploy gate waits for the live
              app to catch up, and a read-only tester checks the deployed product before the run is
              allowed to advance. A mission finishes only after a streak of consecutive
              live-verified passes &mdash; like a mechanical ratchet, the loop only moves forward.
            </p>
            <NextSectionLink href="#quick-start" title="Run your first mission" />
          </section>

          <section className="mt-14" data-section="quick-start">
            <h2 id="quick-start" className="group scroll-mt-24 font-display text-2xl font-bold">
              Run your first mission
              <HeadingAnchor id="quick-start" />
            </h2>
            <p className="mt-4 text-muted">
              Five minutes, start to finish. These steps are everything a first-time user needs
              &mdash; no other reading required before you start.
            </p>
            <StepList steps={quickStartSteps} />
            <NextSectionLink href="#core-workflow" title="Run the build, deploy, and test loop" />
          </section>

          <section className="mt-14" data-section="core-workflow">
            <h2 id="core-workflow" className="group scroll-mt-24 font-display text-2xl font-bold">
              Run the build, deploy, and test loop
              <HeadingAnchor id="core-workflow" />
            </h2>
            <p className="mt-4 text-muted">
              Every mission, first run or hundredth, repeats the same three-stage loop against the
              live product:
            </p>
            <CodeBlock
              code={`Build → Deploy gate → Test
   ↑                    │
   └──── FAIL ────┘
        PASS streak → done`}
              language="flow"
            />

            <h3
              id="build-real-provable-changes"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Build real, provable changes
              <HeadingAnchor id="build-real-provable-changes" />
            </h3>
            <p className="mt-3 text-muted">
              The coding agent changes the product and must produce real git history: an actual
              commit that advances the branch, matches the pushed remote, and leaves a clean working
              tree &mdash; not just a claim of being done.
            </p>
            <AdvancedExpander title="What counts as proof-of-work">
              <p>
                Empty &ldquo;success&rdquo; commits and force-pushed or rewritten history are
                rejected as proof-of-work.
              </p>
            </AdvancedExpander>

            <h3
              id="wait-for-the-deploy-gate-to-confirm-your-push"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Wait for the deploy gate to confirm your push
              <HeadingAnchor id="wait-for-the-deploy-gate-to-confirm-your-push" />
            </h3>
            <p className="mt-3 text-muted">
              After a push, the deploy gate polls your product&apos;s version endpoint until it
              returns the SHA that was just pushed.
            </p>
            <AdvancedExpander title="Version endpoint matching and auth pitfalls">
              <Callout type="note">
                SHA matching is case-insensitive, and a long-enough prefix of the full SHA counts as
                a match &mdash; you don&apos;t need to return the entire hash.
              </Callout>
              <Callout type="warning">
                If the version endpoint is behind auth, wrong, or bound to a different product than
                the live URL under test, the gate times out and the run looks stuck even though the
                build succeeded.
              </Callout>
            </AdvancedExpander>

            <h3
              id="test-only-the-live-deployed-app"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Test only the live, deployed app
              <HeadingAnchor id="test-only-the-live-deployed-app" />
            </h3>
            <p className="mt-3 text-muted">
              Once the gate confirms the deploy, a read-only tester exercises the live app only,
              never the builder's own claims about what changed. The tester returns a structured
              PASS or FAIL: FAIL carries actionable feedback into the next build iteration, and PASS
              advances a streak counter. The loop keeps repeating build &rarr; deploy gate &rarr;
              test until the required streak of consecutive passes is reached.
            </p>

            <h3
              id="know-what-done-means-at-every-layer"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Know what &ldquo;done&rdquo; means at every layer
              <HeadingAnchor id="know-what-done-means-at-every-layer" />
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm text-ink-soft">
                <thead>
                  <tr>
                    <th className="border border-border bg-surface px-3 py-2 text-left font-display font-semibold text-ink">
                      Layer
                    </th>
                    <th className="border border-border bg-surface px-3 py-2 text-left font-display font-semibold text-ink">
                      Done when
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Single mission", "A streak of consecutive live passes"],
                    ["Deploy gate", "Live version signal matches what the builder just pushed"],
                    ["Builder step", "Real git work is proven — not agent claims alone"],
                    [
                      "Product campaign",
                      "Each focused step succeeded (or was intentionally dropped)",
                    ],
                  ].map(([layer, done]) => (
                    <tr key={layer}>
                      <td className="border border-border px-3 py-2 align-top font-medium text-ink">
                        {layer}
                      </td>
                      <td className="border border-border px-3 py-2 align-top">{done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <NextSectionLink href="#going-further" title="Go further with advanced usage" />
          </section>

          <section className="mt-14" data-section="going-further">
            <h2 id="going-further" className="group scroll-mt-24 font-display text-2xl font-bold">
              Go further with advanced usage
              <HeadingAnchor id="going-further" />
            </h2>
            <p className="mt-4 text-muted">
              Once your first mission has passed, these patterns cover real product work and the
              rest of the pack.
            </p>

            <h3
              id="plan-multi-step-campaigns-instead-of-one-mega-mission"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Plan multi-step campaigns instead of one mega-mission
              <HeadingAnchor id="plan-multi-step-campaigns-instead-of-one-mega-mission" />
            </h3>
            <p className="mt-3 text-muted">
              A real product goal is often several missions, not one. Composer&apos;s planner
              expands a multi-part goal into a handful of focused steps.
            </p>
            <AdvancedExpander title="Scoping campaigns across product shells">
              <p>
                Each step is easier to accept on the live site, easier to resume on failure, and
                less likely to be partially completed by a builder. Scope every step to the correct
                product shell (product app, control plane, or sandbox); pointing acceptance checks
                at one shell&apos;s repo while the live URL belongs to another is a common
                deploy-gate poison pill. The control plane itself can be improved by the same loop,
                as long as it has its own cloneable remote and version signal.
              </p>
            </AdvancedExpander>

            <h3
              id="turn-on-infrastructure-provisioning-carefully"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Turn on infrastructure provisioning carefully
              <HeadingAnchor id="turn-on-infrastructure-provisioning-carefully" />
            </h3>
            <p className="mt-3 text-muted">
              Some missions can plan or provision infrastructure before the build starts. Leave
              optional provisioning off until the core build-deploy-test loop is reliable on its
              own.
            </p>
            <AdvancedExpander title="Provisioning configuration deep-dive">
              <p>
                Treat planner output as untrusted input to an allowlist, prefer binding a known
                cloud project identity over creating new ones, and fail closed when identity checks
                fail.
              </p>
            </AdvancedExpander>

            <h3
              id="avoid-the-common-design-pitfalls"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Avoid the common design pitfalls
              <HeadingAnchor id="avoid-the-common-design-pitfalls" />
            </h3>
            <p className="mt-3 text-muted">
              A short list of mistakes that repeatedly derail otherwise-working loops.
            </p>
            <AdvancedExpander title="The three most common failure modes">
              <Callout type="warning">
                Keep the version signal public and reachable by the deploy gate &mdash; auth
                blocking it makes loops look stuck even when the build is fine.
              </Callout>
              <Callout type="warning">
                Never trust agent claims over git reality; require a real, content-changing,
                fast-forward commit.
              </Callout>
              <Callout type="warning">
                Keep cloud tokens and credentials out of builder and tester environments entirely.
              </Callout>
            </AdvancedExpander>

            <h3
              id="know-the-core-components"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Know the core components
              <HeadingAnchor id="know-the-core-components" />
            </h3>
            <p className="mt-3 text-muted">
              A quick reference for the five pieces that make up the system.
            </p>
            <AdvancedExpander title="Component reference table">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm text-ink-soft">
                  <thead>
                    <tr>
                      <th className="border border-border bg-surface px-3 py-2 text-left font-display font-semibold text-ink">
                        Component
                      </th>
                      <th className="border border-border bg-surface px-3 py-2 text-left font-display font-semibold text-ink">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "Composer",
                        "Human-facing surface: capture goals, manage product shells, queue missions",
                      ],
                      [
                        "Ratchet loop",
                        "Orchestration: builder → deploy gate → live tester → streak",
                      ],
                      [
                        "Credentials boundary",
                        "Secrets stay brokered; agents never hold cloud tokens",
                      ],
                      [
                        "Product shells",
                        "One product = one repo + one live URL + one version signal",
                      ],
                      [
                        "Optional helpers",
                        "Observe and report only — never implement product features",
                      ],
                    ].map(([component, role]) => (
                      <tr key={component}>
                        <td className="border border-border px-3 py-2 align-top font-medium text-ink">
                          {component}
                        </td>
                        <td className="border border-border px-3 py-2 align-top">{role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm">
                Ratchet is not a general chat UI for product end users, not a drop-in CI
                replacement, not &ldquo;overnight helpers ship features&rdquo; on their own, and not
                a place to put secrets in agent prompts.
              </p>
            </AdvancedExpander>

            <h3
              id="read-the-full-system-guide"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Read the full system guide
              <HeadingAnchor id="read-the-full-system-guide" />
            </h3>
            <p className="mt-3 text-muted">
              The six key documents of the {manifest.version} pack, rendered as pages on this site
              and chained prev/next in read order.
            </p>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2">
              {guideDocs.map((doc, index) => (
                <li key={doc.slug}>
                  <a
                    href={doc.href}
                    className="card block h-full transition-colors hover:border-purple"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {index + 1} of {guideDocs.length}
                    </p>
                    <p className="mt-2 font-display text-base font-semibold">{doc.title}</p>
                    <p className="mt-2 text-sm text-muted">{doc.blurb}</p>
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <a href={guideDocs[0].href} className="btn-secondary" data-guide-next>
                Start reading: {guideDocs[0].title} &rarr;
              </a>
            </div>

            <h3
              id="browse-every-file-in-the-pack"
              className="group scroll-mt-24 mt-10 font-display text-xl font-semibold"
            >
              Browse every file in the pack
              <HeadingAnchor id="browse-every-file-in-the-pack" />
            </h3>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="chip" data-pack-version>
                {manifest.version}
              </span>
              <p className="text-sm text-muted">
                Every document in the sanitized pack, in manifest order. Entries marked &ldquo;Guide
                page&rdquo; are rendered on this site; the rest open as the pack&apos;s plain
                markdown or self-contained HTML, served alongside it.
              </p>
            </div>
            <AdvancedExpander title={`Full manifest (${manifest.documents.length} files)`}>
              <ul className="space-y-3">
                {manifest.documents.map((entry) => {
                  const rendered = isRenderedGuideDoc(entry.filename);
                  return (
                    <li key={entry.filename} className="card">
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={guidePackEntryHref(entry.filename)}
                          className="font-mono text-sm font-semibold text-purple hover:underline"
                        >
                          {entry.filename}
                        </a>
                        <span className="chip" data-entry-kind={rendered ? "page" : "file"}>
                          {rendered ? "Guide page" : "Pack file"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted">{entry.title}</p>
                    </li>
                  );
                })}
              </ul>
            </AdvancedExpander>
            <NextSectionLink href="#troubleshooting-faq" title="Troubleshooting & FAQ" />
          </section>

          <section className="mt-14" data-section="troubleshooting-faq">
            <h2
              id="troubleshooting-faq"
              className="group scroll-mt-24 font-display text-2xl font-bold"
            >
              Troubleshooting &amp; FAQ
              <HeadingAnchor id="troubleshooting-faq" />
            </h2>
            <p className="mt-4 text-muted">
              The most common ways a mission gets stuck, in symptom &rarr; cause &rarr; fix order.
              Each entry links back to the relevant how-to section above.
            </p>

            <h3
              id="cant-start-a-run-missing-field"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              I can&apos;t start a run &mdash; Composer says a field is missing
              <HeadingAnchor id="cant-start-a-run-missing-field" />
            </h3>
            <p className="mt-3 text-muted">
              <strong>Cause:</strong> the product shell&apos;s <strong>Git remote</strong>,{" "}
              <strong>Live URL</strong>, or <strong>Version endpoint</strong> field was never filled
              in, so Composer has nothing to bind the mission to.
            </p>
            <p className="mt-2 text-muted">
              <strong>Fix:</strong> go back to{" "}
              <a
                href="#quick-start"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Run your first mission
              </a>{" "}
              and set all three product shell fields before queuing another run.
            </p>

            <h3
              id="deploy-never-finishes"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              My deploy never finishes and the gate looks stuck
              <HeadingAnchor id="deploy-never-finishes" />
            </h3>
            <p className="mt-3 text-muted">
              <strong>Cause:</strong> the version endpoint is behind auth, pointed at the wrong
              product, or otherwise unreachable, so the deploy gate can never see a matching SHA
              even though the build succeeded.
            </p>
            <p className="mt-2 text-muted">
              <strong>Fix:</strong> curl the endpoint directly with no login and confirm it belongs
              to the same product shell as your live URL. See{" "}
              <a
                href="#wait-for-the-deploy-gate-to-confirm-your-push"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Wait for the deploy gate to confirm your push
              </a>
              .
            </p>

            <h3
              id="version-endpoint-not-updating"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              My version endpoint isn&apos;t returning the new SHA after I push
              <HeadingAnchor id="version-endpoint-not-updating" />
            </h3>
            <p className="mt-3 text-muted">
              <strong>Cause:</strong> the host isn&apos;t set to auto-deploy on push to the branch
              you&apos;re pushing, or the endpoint returns a build-time constant instead of reading
              the currently deployed SHA.
            </p>
            <p className="mt-2 text-muted">
              <strong>Fix:</strong> confirm auto-deploy is wired to your deploy branch and that a
              fresh <code>curl</code> of the endpoint changes after every push &mdash; see{" "}
              <a
                href="#quick-start"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Confirm your deploy and version endpoint
              </a>
              .
            </p>

            <h3
              id="tester-keeps-failing"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              The tester keeps failing the same criterion every iteration
              <HeadingAnchor id="tester-keeps-failing" />
            </h3>
            <p className="mt-3 text-muted">
              <strong>Cause:</strong> the builder isn&apos;t producing a real, content-changing
              commit each iteration, or the tester is exercising a different live URL than the one
              that actually changed.
            </p>
            <p className="mt-2 text-muted">
              <strong>Fix:</strong> check git history for an actual advancing commit per iteration
              (see{" "}
              <a
                href="#build-real-provable-changes"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Build real, provable changes
              </a>
              ) and confirm the tester targets the same live app the deploy gate just confirmed (see{" "}
              <a
                href="#test-only-the-live-deployed-app"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Test only the live, deployed app
              </a>
              ).
            </p>

            <h3
              id="mission-stopped-before-pass-streak"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              My mission stopped before reaching a pass streak
              <HeadingAnchor id="mission-stopped-before-pass-streak" />
            </h3>
            <p className="mt-3 text-muted">
              <strong>Cause:</strong> the <strong>Max iterations</strong> or{" "}
              <strong>Spend cap</strong> limit was reached before the required run of consecutive
              passes.
            </p>
            <p className="mt-2 text-muted">
              <strong>Fix:</strong> raise the iteration or spend limit, lower the{" "}
              <strong>Pass streak</strong> field (see{" "}
              <a
                href="#quick-start"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Set your limits
              </a>
              ), or split the goal into a multi-step campaign so each piece can finish on its own
              (see{" "}
              <a
                href="#plan-multi-step-campaigns-instead-of-one-mega-mission"
                className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
              >
                Plan multi-step campaigns instead of one mega-mission
              </a>
              ).
            </p>
          </section>
        </div>
      </div>

      {/*
       * Re-applies a stored Expert preference, and each expander's own
       * individually-persisted open/close choice, before hydration — so a
       * returning reader never sees a flash of the wrong state on reload.
       * An explicit per-expander choice (set on click) wins over the
       * Expert-mode default, since it's the reader's most recent action on
       * that specific element. Runs during initial HTML parsing, after
       * every [data-advanced-expander] element above it in the DOM.
       */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var expert=window.localStorage.getItem(${JSON.stringify(
            GUIDE_MODE_STORAGE_KEY,
          )})==="expert";document.querySelectorAll('[data-advanced-expander]').forEach(function(w){var key=w.getAttribute('data-expander-key');var stored=key?window.localStorage.getItem('ratchet-guide-expander:'+key):null;var open=stored===null?expert:stored==="1";var b=w.querySelector('.advanced-expander-summary');var c=w.querySelector('.advanced-expander-body');if(b)b.setAttribute('aria-expanded',open?'true':'false');if(c)c.hidden=!open;});}catch(e){}})();`,
        }}
      />

      <BackToTop />
    </ModulePage>
  );
}
