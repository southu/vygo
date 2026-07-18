import type { Metadata } from "next";
import { ModulePage } from "@/components/vibe-coding/ModulePage";
import { GuideToc, type GuideTocEntry } from "@/components/vibe-coding/GuideToc";
import { HeadingAnchor } from "@/components/vibe-coding/HeadingAnchor";
import { BackToTop } from "@/components/vibe-coding/BackToTop";
import { getVibeModulePage } from "@/content/vibe-coding-modules";
import { guideDocs, guidePackEntryHref, isRenderedGuideDoc } from "@/content/ratchet-guide";
import { readGuidePackManifest } from "@/lib/guide-source";

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
 * hover-revealed HeadingAnchor for copyable deep links.
 */
export default function RatchetGuidePage() {
  return (
    <ModulePage module={module}>
      <div
        className="container-page section-pad border-t border-border lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-10 xl:grid-cols-[16rem_1fr] xl:gap-14"
        data-guide-body
      >
        <GuideToc sections={guideToc} />

        <div className="min-w-0">
          <section data-section="overview">
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
            <ol className="mt-8 space-y-4">
              {[
                {
                  title: "Create a product shell",
                  body: "In Composer, bind a product shell to your git remote, your live URL, and a version endpoint (e.g. GET /version) that returns the deployed git SHA.",
                },
                {
                  title: "Confirm your deploy and version endpoint",
                  body: "Make sure your host deploys automatically on push to your deploy branch, and that the version endpoint is publicly reachable without a control-plane login — the deploy gate polls it directly.",
                },
                {
                  title: "Describe your goal",
                  body: "Open Composer's goal capture screen and state the change in plain language, e.g. “Change the homepage CTA label to ‘Get started’.” Note anything the change must not touch.",
                },
                {
                  title: "Accept the draft queue",
                  body: "For anything beyond a one-line goal, Composer splits it into a small queue of focused steps instead of one mega-mission. Accept the draft as-is for a first run.",
                },
                {
                  title: "Set your limits",
                  body: "Choose a max iteration count, the streak of consecutive live passes required to finish (2 is a reasonable first value), and an optional spend cap.",
                },
                {
                  title: "Start the run",
                  body: "Each iteration is automatic: the builder pushes real commits, the deploy gate waits until your version endpoint matches the new SHA, and a tester checks only the live app and returns PASS or FAIL.",
                },
                {
                  title: "Watch it iterate",
                  body: "A FAIL carries the tester's feedback into the next build automatically. A PASS advances the streak. You do not need to intervene between iterations.",
                },
                {
                  title: "Confirm your first pass",
                  body: "The mission finishes on its own once the required streak is reached. Open your live URL to confirm the change actually shipped.",
                },
              ].map((step, index) => (
                <li key={step.title} className="card flex gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-soft font-display text-sm font-bold text-purple"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-display text-base font-semibold">{step.title}</p>
                    <p className="mt-1 text-sm text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
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
            <pre className="mt-6 overflow-x-auto rounded-card border border-border bg-surface p-4 text-sm leading-relaxed">
              <code className="font-mono text-ink-soft">{`Build → Deploy gate → Test
   ↑                    │
   └──── FAIL ────┘
        PASS streak → done`}</code>
            </pre>

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
              tree &mdash; not just a claim of being done. Empty &ldquo;success&rdquo; commits and
              force-pushed or rewritten history are rejected as proof-of-work.
            </p>

            <h3
              id="wait-for-the-deploy-gate-to-confirm-your-push"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Wait for the deploy gate to confirm your push
              <HeadingAnchor id="wait-for-the-deploy-gate-to-confirm-your-push" />
            </h3>
            <p className="mt-3 text-muted">
              After a push, the deploy gate polls your product's version endpoint until it returns
              the SHA that was just pushed (matching is case-insensitive; the full SHA or a
              long-enough prefix counts). If the version endpoint is behind auth, wrong, or bound to
              a different product than the live URL under test, the gate times out and the run looks
              stuck even though the build succeeded.
            </p>

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
              A real product goal is often several missions, not one. Composer's planner expands a
              multi-part goal into a handful of focused steps &mdash; each easier to accept on the
              live site, easier to resume on failure, and less likely to be partially completed by a
              builder. Scope every step to the correct product shell (product app, control plane, or
              sandbox); pointing acceptance checks at one shell's repo while the live URL belongs to
              another is a common deploy-gate poison pill. The control plane itself can be improved
              by the same loop, as long as it has its own cloneable remote and version signal.
            </p>

            <h3
              id="turn-on-infrastructure-provisioning-carefully"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Turn on infrastructure provisioning carefully
              <HeadingAnchor id="turn-on-infrastructure-provisioning-carefully" />
            </h3>
            <p className="mt-3 text-muted">
              Some missions can plan or provision infrastructure before the build starts. Treat
              planner output as untrusted input to an allowlist, prefer binding a known cloud
              project identity over creating new ones, and fail closed when identity checks fail.
              Leave optional provisioning off until the core build-deploy-test loop is reliable on
              its own.
            </p>

            <h3
              id="avoid-the-common-design-pitfalls"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Avoid the common design pitfalls
              <HeadingAnchor id="avoid-the-common-design-pitfalls" />
            </h3>
            <ul className="mt-3 space-y-2 pl-6 text-sm text-ink-soft marker:text-muted list-disc">
              <li>
                Keep the version signal public and reachable by the deploy gate &mdash; auth
                blocking it makes loops look stuck even when the build is fine.
              </li>
              <li>
                Never trust agent claims over git reality; require a real, content-changing,
                fast-forward commit.
              </li>
              <li>
                Keep cloud tokens and credentials out of builder and tester environments entirely.
              </li>
            </ul>

            <h3
              id="know-the-core-components"
              className="group scroll-mt-24 mt-8 font-display text-xl font-semibold"
            >
              Know the core components
              <HeadingAnchor id="know-the-core-components" />
            </h3>
            <div className="mt-4 overflow-x-auto">
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
                    ["Ratchet loop", "Orchestration: builder → deploy gate → live tester → streak"],
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
            <p className="mt-4 text-sm text-muted">
              Ratchet is not a general chat UI for product end users, not a drop-in CI replacement,
              not &ldquo;overnight helpers ship features&rdquo; on their own, and not a place to put
              secrets in agent prompts.
            </p>

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
            <ul className="mt-6 space-y-3">
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
          </section>
        </div>
      </div>

      <BackToTop />
    </ModulePage>
  );
}
