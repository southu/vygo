// Relative import (not the "@/" alias) so this pure data module — and the
// campaign it exports — can be loaded directly by the node:test suite, which
// does not resolve tsconfig path aliases.
import type { CampaignConfig, CampaignCta } from "../../lib/campaign/types";

/**
 * Campaign 1 landing surface — the AI production-readiness assessment.
 *
 * Independently addressable at /ai-workforce-capability-assessment, this page
 * serves problem-aware visitors evaluating their AI or workforce capability
 * needs. Its single, visually dominant action starts vygo's existing, free
 * Readiness Check assessment; assessment completion (not a waitlist
 * application) is this campaign's primary conversion.
 *
 * Every claim is grounded in already-approved language and permissible proof
 * from the campaign brief (docs/paid-campaign-landing-pages.md, Campaign 1):
 *   - Assessment framing + "no secrets, no code changes": content/readiness.ts.
 *   - "surface the security, scalability, and operational gaps before they cost
 *     you a deal or an outage": content/homepage.ts.
 *   - Compatible build tools + compatibility-not-partnership footnote:
 *     content/faq.ts, content/legal.ts.
 *   - Market-context statistics, presented as industry data and never as vygo's
 *     own outcomes: content/why-vygo.ts (mirrored on vygo.ai/why-vygo).
 * No testimonials, logos, case studies, or invented outcome numbers appear.
 */

/** Slug, route path, and canonical for the campaign. */
export const AI_WORKFORCE_ASSESSMENT_SLUG = "ai-workforce-capability-assessment";
export const AI_WORKFORCE_ASSESSMENT_PATH = `/${AI_WORKFORCE_ASSESSMENT_SLUG}`;
export const AI_WORKFORCE_ASSESSMENT_CANONICAL = `https://www.vygo.ai${AI_WORKFORCE_ASSESSMENT_PATH}`;

/**
 * The single, visually dominant assessment-start action. Reused verbatim for
 * the three approved decision-point CTAs (nav, hero, closing). A relative,
 * same-origin destination so the conversion layer can append preserved
 * attribution parameters onto the assessment-start handoff.
 */
export const START_ASSESSMENT_LABEL = "Take the Readiness Check";
export const START_ASSESSMENT_HREF = "/readiness";

/** Explicit, indexable robots policy for the campaign page metadata. */
export const AI_WORKFORCE_ASSESSMENT_ROBOTS = { index: true, follow: true } as const;

const startAssessmentCta: CampaignCta = {
  label: START_ASSESSMENT_LABEL,
  href: START_ASSESSMENT_HREF,
  variant: "primary",
};

export const aiWorkforceAssessmentCampaign: CampaignConfig = {
  id: AI_WORKFORCE_ASSESSMENT_SLUG,
  slug: AI_WORKFORCE_ASSESSMENT_SLUG,
  path: AI_WORKFORCE_ASSESSMENT_PATH,
  meta: {
    title: "AI Production-Readiness Assessment — a free, read-only capability check | vygo.ai",
    description:
      "Evaluate your AI-built product's production readiness with a free, read-only assessment. A few guided questions surface the security, scalability, and operational gaps before they cost you a deal or an outage — no secrets, no code changes. Get a scored readiness snapshot.",
    canonical: AI_WORKFORCE_ASSESSMENT_CANONICAL,
    ogTitle: "Evaluate your AI production readiness — free, read-only, in minutes",
    ogDescription:
      "Answer a few guided questions and get a scored, read-only readiness snapshot across five assessment dimensions — no code access, no secrets, no code changes.",
    ogImage: "https://www.vygo.ai/web-app-manifest-512x512.png",
    ogImageAlt: "vygo.ai",
  },
  nav: {
    homeHref: "/",
    homeLabel: "vygo.ai home",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "FAQ", href: "#faq" },
    ],
    // Decision point 1 of 3 for the assessment-start action.
    cta: startAssessmentCta,
  },
  footer: {
    summary:
      "The Readiness Check is a free, read-only self-diagnostic for AI-built products. It surfaces security, scalability, and operational gaps — no secrets and no code changes.",
    legalLinks: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Accessibility", href: "/accessibility" },
    ],
    copyright: "vygo",
  },
  sections: [
    {
      id: "hero",
      type: "hero",
      data: {
        eyebrow: "AI production-readiness assessment",
        heading: "Evaluate your AI-built product's production readiness — free and read-only",
        subheading:
          "Answer a few guided questions and we'll generate a read-only diagnostic prompt tailored to how you build. It surfaces the security, scalability, and operational gaps in your product before they cost you a deal or an outage — no secrets, no code changes.",
        bullets: [
          "Free, read-only self-diagnostic — no code access.",
          "A scored Readiness Radar across five assessment dimensions.",
          "Top findings and indicative engagement ranges you can email to yourself.",
        ],
        // Decision point 2 of 3 for the assessment-start action.
        primaryCta: startAssessmentCta,
        secondaryCta: {
          label: "See how the assessment works",
          href: "#how-it-works",
          variant: "secondary",
        },
      },
    },
    {
      id: "benefits",
      type: "benefits",
      data: {
        eyebrow: "What you get",
        title: "A read-only capability check, built for AI-built products",
        intro:
          "The Readiness Check is a free self-diagnostic for teams that already have a working build and real usage pressure. It reads how you build and reflects it back as a scored snapshot.",
        items: [
          {
            title: "Free and read-only",
            body: "A read-only self-diagnostic with no code access — no secrets and no code changes are ever required to complete it.",
          },
          {
            title: "Tailored to how you build",
            body: "A few guided questions generate a diagnostic prompt matched to your stack, so the findings reflect your product rather than a generic checklist.",
          },
          {
            title: "Scored across five dimensions",
            body: "See a Readiness Radar that scores security, scalability, and operational readiness across five assessment dimensions on one view.",
          },
          {
            title: "Findings you can keep",
            body: "Finish at a scored readiness snapshot with your top findings and indicative engagement ranges, which you can email to yourself.",
          },
        ],
      },
    },
    {
      id: "reassurance",
      type: "assurance",
      data: {
        eyebrow: "How your inputs are handled",
        title: "Read-only by design",
        intro:
          "The assessment is a self-diagnostic. It never asks for code access, and secrets are redacted before anything is stored.",
        items: [
          "Free",
          "Read-only",
          "No code access",
          "No secrets",
          "No code changes",
          "Results you can email to yourself",
        ],
      },
    },
    {
      id: "how-it-works",
      type: "method",
      data: {
        eyebrow: "How it works",
        title: "Three steps to a scored readiness snapshot",
        intro:
          "The assessment runs entirely from your own inputs. You can complete it on mobile or desktop, using only the keyboard.",
        steps: [
          {
            name: "Intake",
            body: "Tell us about your project and how it's built — a few guided questions, no code and no secrets.",
          },
          {
            name: "Get a tailored diagnostic prompt",
            body: "We generate a read-only diagnostic prompt matched to your stack. Run it against your own AI assistant; nothing leaves your control.",
          },
          {
            name: "Paste your results",
            body: "Paste the results back to reach your scored readiness snapshot across five assessment dimensions, with top findings you can keep.",
          },
        ],
      },
    },
    {
      id: "proof",
      type: "benefits",
      data: {
        eyebrow: "Why it matters",
        title: "Production readiness is lagging the pace of AI-built software",
        intro:
          "Market context on AI-built software — industry data published on vygo.ai/why-vygo, presented as market context and not as vygo's own performance outcomes.",
        items: [
          {
            title: "$4.7–7.4B market in 2026",
            body: "The vibe-coding tools market is projected at $4.7–7.4B in 2026, growing 17–38% annually. Industry market data, cited on vygo.ai/why-vygo — not a vygo outcome.",
          },
          {
            title: "45% of AI-generated code",
            body: "Industry research finds 45% of AI-generated code contains high-risk OWASP Top-10 vulnerabilities. Cited on vygo.ai/why-vygo as market context — not a vygo outcome.",
          },
          {
            title: "63% are non-developers",
            body: "63% of vibe-coding users are non-developers who can't harden production themselves. Industry research, cited on vygo.ai/why-vygo — not a vygo outcome.",
          },
          {
            title: "25% of YC startups",
            body: "25% of YC startups rely heavily on AI-generated code for core systems. Industry data, cited on vygo.ai/why-vygo — not a vygo outcome.",
          },
        ],
      },
    },
    {
      id: "faq",
      type: "faq",
      data: {
        eyebrow: "Before you start",
        title: "Questions about the assessment",
        items: [
          {
            question: "Is this just a lead-gen gate?",
            answer:
              "No. The Readiness Check is free and read-only. Your scored results are shown after a short name and work-email gate, and no code or secrets are required to complete it.",
          },
          {
            question: "Will you see my code or secrets?",
            answer:
              "No. It is a read-only diagnostic — no secrets and no code changes. Anything secret-shaped is redacted before it is stored.",
          },
          {
            question: "What if we're too early?",
            answer:
              "The check is built for products that already have a working build and real usage pressure. If there's no working build yet, the flow off-ramps honestly and invites you back after your MVP.",
          },
          {
            question: "What do I get at the end?",
            answer:
              "A scored readiness snapshot across five assessment dimensions, with your top findings and indicative engagement ranges, which you can email to yourself.",
          },
          {
            question: "Do you work with my stack?",
            answer:
              "The check is compatible with products built using tools like Lovable, Cursor, Replit, Bolt, and v0. These tool names describe compatibility only — they do not imply a partnership or endorsement.",
          },
        ],
      },
    },
    {
      id: "closing",
      type: "closingCta",
      data: {
        eyebrow: "Start your assessment",
        title: "Ready to evaluate your production readiness?",
        body: "Take the free, read-only Readiness Check and get your scored snapshot across five assessment dimensions — no secrets, no code changes.",
        // Decision point 3 of 3 for the assessment-start action.
        primaryCta: { ...startAssessmentCta, variant: "on-dark" },
        secondaryCta: {
          label: "See how the assessment works",
          href: "#how-it-works",
          variant: "ghost-on-dark",
        },
      },
    },
  ],
};
