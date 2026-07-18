import { CodeBlock } from "@/components/vibe-coding/CodeBlock";
import type { Step } from "@/components/vibe-coding/StepCard";
import { guideOffer } from "@/content/guide-offer";

/**
 * Setup prompt pasted into an AI coding tool after unzipping the guide pack.
 * Mirrors "AI prompt pack" prompt A (content/vibe-coding/ratchet-guide/ai-prompts.md)
 * with an added unzip instruction, so the two stay in sync in spirit.
 *
 * Shared by the /vibe-coding landing page (setup-first section) and the
 * /vibe-coding/ratchet-guide "Get set up" step — one source of truth so the
 * copyable prompt text never drifts between the two surfaces.
 */
const guideZipFilename = guideOffer.ctas.startFree.href.split("/").pop();
export const setupPrompt = `Unzip ${guideZipFilename} in this folder, then read the pack in order: README.md, then overview → architecture → principles → layout → loop-and-missions.

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
export const setupSteps: Step[] = [
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
