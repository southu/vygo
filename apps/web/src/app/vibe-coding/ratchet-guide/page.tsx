import type { Metadata } from "next";
import { ModulePage } from "@/components/vibe-coding/ModulePage";
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
 * How-to guide: task-based sections in the order a new user actually works
 * (what Ratchet does → first mission → the build/deploy/test loop → advanced
 * usage), rather than the pack's feature/file order. The six rendered docs and
 * the full pack manifest are preserved as "Go further" reading material —
 * nothing from the prior guide is removed, only relocated under the section
 * a beginner needs it in.
 */
export default function RatchetGuidePage() {
  return (
    <ModulePage module={module}>
      <section className="section-pad border-t border-border" data-section="overview">
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">Understand what Ratchet does</h2>
          <p className="mt-4 text-lg text-muted">
            Ratchet is a control plane for AI software work that only calls a change
            &ldquo;done&rdquo; once the live site agrees. Every mission runs a build-and-verify
            loop: a coding agent builds and pushes real commits, a deploy gate waits for the live
            app to catch up, and a read-only tester checks the deployed product before the run is
            allowed to advance. A mission finishes only after a streak of consecutive live-verified
            passes &mdash; like a mechanical ratchet, the loop only moves forward.
          </p>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface" data-section="quick-start">
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">Run your first mission</h2>
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
        </div>
      </section>

      <section className="section-pad border-t border-border" data-section="core-workflow">
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">Run the build, deploy, and test loop</h2>
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

          <h3 className="mt-8 font-display text-xl font-semibold">Build real, provable changes</h3>
          <p className="mt-3 text-muted">
            The coding agent changes the product and must produce real git history: an actual commit
            that advances the branch, matches the pushed remote, and leaves a clean working tree
            &mdash; not just a claim of being done. Empty &ldquo;success&rdquo; commits and
            force-pushed or rewritten history are rejected as proof-of-work.
          </p>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Wait for the deploy gate to confirm your push
          </h3>
          <p className="mt-3 text-muted">
            After a push, the deploy gate polls your product's version endpoint until it returns the
            SHA that was just pushed (matching is case-insensitive; the full SHA or a long-enough
            prefix counts). If the version endpoint is behind auth, wrong, or bound to a different
            product than the live URL under test, the gate times out and the run looks stuck even
            though the build succeeded.
          </p>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Test only the live, deployed app
          </h3>
          <p className="mt-3 text-muted">
            Once the gate confirms the deploy, a read-only tester exercises the live app only, never
            the builder's own claims about what changed. The tester returns a structured PASS or
            FAIL: FAIL carries actionable feedback into the next build iteration, and PASS advances
            a streak counter. The loop keeps repeating build &rarr; deploy gate &rarr; test until
            the required streak of consecutive passes is reached.
          </p>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Know what &ldquo;done&rdquo; means at every layer
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
        </div>
      </section>

      <section
        className="section-pad border-t border-border bg-surface"
        data-section="going-further"
      >
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">Go further with advanced usage</h2>
          <p className="mt-4 text-muted">
            Once your first mission has passed, these patterns cover real product work and the rest
            of the pack.
          </p>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Plan multi-step campaigns instead of one mega-mission
          </h3>
          <p className="mt-3 text-muted">
            A real product goal is often several missions, not one. Composer's planner expands a
            multi-part goal into a handful of focused steps &mdash; each easier to accept on the
            live site, easier to resume on failure, and less likely to be partially completed by a
            builder. Scope every step to the correct product shell (product app, control plane, or
            sandbox); pointing acceptance checks at one shell's repo while the live URL belongs to
            another is a common deploy-gate poison pill. The control plane itself can be improved by
            the same loop, as long as it has its own cloneable remote and version signal.
          </p>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Turn on infrastructure provisioning carefully
          </h3>
          <p className="mt-3 text-muted">
            Some missions can plan or provision infrastructure before the build starts. Treat
            planner output as untrusted input to an allowlist, prefer binding a known cloud project
            identity over creating new ones, and fail closed when identity checks fail. Leave
            optional provisioning off until the core build-deploy-test loop is reliable on its own.
          </p>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Avoid the common design pitfalls
          </h3>
          <ul className="mt-3 space-y-2 pl-6 text-sm text-ink-soft marker:text-muted list-disc">
            <li>
              Keep the version signal public and reachable by the deploy gate &mdash; auth blocking
              it makes loops look stuck even when the build is fine.
            </li>
            <li>
              Never trust agent claims over git reality; require a real, content-changing,
              fast-forward commit.
            </li>
            <li>
              Keep cloud tokens and credentials out of builder and tester environments entirely.
            </li>
          </ul>

          <h3 className="mt-8 font-display text-xl font-semibold">Know the core components</h3>
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
                  ["Credentials boundary", "Secrets stay brokered; agents never hold cloud tokens"],
                  ["Product shells", "One product = one repo + one live URL + one version signal"],
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

          <h3 className="mt-8 font-display text-xl font-semibold">Read the full system guide</h3>
          <p className="mt-3 text-muted">
            The six key documents of the {manifest.version} pack, rendered as pages on this site and
            chained prev/next in read order.
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

          <h3 className="mt-10 font-display text-xl font-semibold">
            Browse every file in the pack
          </h3>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="chip" data-pack-version>
              {manifest.version}
            </span>
            <p className="text-sm text-muted">
              Every document in the sanitized pack, in manifest order. Entries marked &ldquo;Guide
              page&rdquo; are rendered on this site; the rest open as the pack&apos;s plain markdown
              or self-contained HTML, served alongside it.
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
        </div>
      </section>
    </ModulePage>
  );
}
