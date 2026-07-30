// Relative import (not the "@/" alias) so this pure data module — and the
// campaign it exports — can be loaded directly by the node:test suite, which
// does not resolve tsconfig path aliases.
import type { CampaignConfig, CampaignCta } from "../../lib/campaign/types";

/**
 * Campaign 2 landing surface — scalable learning support for L&D and people
 * leaders.
 *
 * Independently addressable at /learning-development-leaders, this page serves
 * L&D leaders, engineering-enablement / developer-experience leads, and
 * people/ops leaders at organizations where multiple teams ship AI-built
 * prototypes and need a consistent, self-serve way to raise production quality.
 * Its single, visually dominant action is a waitlist application submitted
 * on-page; a completed waitlist application (NOT an assessment) is this
 * campaign's primary conversion.
 *
 * Every claim is grounded in already-approved language from the campaign brief
 * (docs/paid-campaign-landing-pages.md, Campaign 2) and its cited sources:
 *   - Free, no-signup, no-paywall, product-design-docs assurances:
 *     content/guide-offer.ts.
 *   - The Ratchet loop + non-negotiables (a real, teachable build-and-verify
 *     method) and the "what it is / is not" definition: content/vibe-coding.ts.
 *   - Key-person risk ("Only one person understands the code") and the
 *     production-engineering framing: content/homepage.ts.
 *   - Apply / waitlist framing (an application is not a client relationship;
 *     work begins only under a signed agreement): content/waitlist.ts,
 *     content/legal.ts. Approved CTA vocabulary: content/ctas.ts.
 *   - Compatibility-not-partnership footnote for tool names: content/faq.ts.
 *
 * No testimonials, logos, case studies, learner counts, or invented outcome
 * numbers appear — none exist in the repository (see brief Guardrails).
 */

/** Slug, route path, and canonical for the campaign. */
export const LEARNING_DEV_LEADERS_SLUG = "learning-development-leaders";
export const LEARNING_DEV_LEADERS_PATH = `/${LEARNING_DEV_LEADERS_SLUG}`;
export const LEARNING_DEV_LEADERS_CANONICAL = `https://www.vygo.ai${LEARNING_DEV_LEADERS_PATH}`;

/**
 * The single, visually dominant conversion action: apply on the on-page
 * waitlist form. An in-page anchor so every prominent CTA scrolls to the same
 * waitlist application on this page rather than navigating away.
 */
export const APPLY_LABEL = "Apply for the next opening";
export const APPLY_HREF = "#waitlist";

/** Explicit, indexable robots policy for the campaign page metadata. */
export const LEARNING_DEV_LEADERS_ROBOTS = { index: true, follow: true } as const;

const applyCta: CampaignCta = {
  label: APPLY_LABEL,
  href: APPLY_HREF,
  variant: "primary",
};

export const learningDevelopmentLeadersCampaign: CampaignConfig = {
  id: LEARNING_DEV_LEADERS_SLUG,
  slug: LEARNING_DEV_LEADERS_SLUG,
  path: LEARNING_DEV_LEADERS_PATH,
  meta: {
    title: "Give every team a free build-and-verify playbook for AI-built software | vygo.ai",
    description:
      "For L&D and enablement leaders: point every team at the same free, self-serve build-and-verify discipline — the Ratchet system guide and the Vibe Coding Hub — with a direct path to senior production engineering when a product is ready. Free, no signup, no paywall. Apply for the next opening.",
    canonical: LEARNING_DEV_LEADERS_CANONICAL,
    ogTitle: "A free, self-serve build-and-verify playbook for every team",
    ogDescription:
      "Standardize how your teams take AI-built software from prototype toward production with vygo's free Ratchet system guide and Vibe Coding Hub — no signup, no paywall. Apply for the next production opening.",
    ogImage: "https://www.vygo.ai/web-app-manifest-512x512.png",
    ogImageAlt: "vygo.ai",
  },
  nav: {
    homeHref: "/",
    homeLabel: "vygo.ai home",
    links: [
      { label: "The loop", href: "#how-it-works" },
      { label: "Objections", href: "#objections" },
    ],
    // Single campaign conversion link in the primary navigation.
    cta: applyCta,
  },
  footer: {
    summary:
      "vygo's free Ratchet system guide and Vibe Coding Hub give every team the same self-serve build-and-verify discipline for AI-built software — no signup, no paywall. Apply to bring in senior production engineering when a product is ready.",
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
        eyebrow: "Scalable learning support for L&D and enablement leaders",
        heading: "Give every team the same free build-and-verify playbook",
        subheading:
          "Your teams can vibe-code working prototypes fast, but production discipline is inconsistent from team to team. Point all of them at one free, self-serve learning path — the Ratchet system guide and the Vibe Coding Hub — then bring in vygo for senior production engineering when a product is ready.",
        bullets: [
          "Free, no signup and no paywall — the full v1.2 pack.",
          "A shared build-and-verify discipline any team can follow themselves.",
          "A direct path to senior production engineering when a product outgrows the playbook.",
        ],
        // Decision point: the on-page waitlist application.
        primaryCta: applyCta,
        secondaryCta: {
          label: "See the loop",
          href: "#how-it-works",
          variant: "secondary",
        },
      },
    },
    {
      id: "problem",
      type: "benefits",
      data: {
        eyebrow: "The operational problem",
        title: "Fast prototypes, inconsistent production discipline",
        intro:
          "Teams can build working prototypes quickly, but quality and production discipline vary across teams, and there is no shared, verifiable build-and-verify playbook to standardize on. Enablement leaders need something scalable and free to point every team at — without hiring for it.",
        items: [
          {
            title: "No shared standard across teams",
            body: "Each team takes AI-built software toward production its own way. Without one repeatable build-and-verify discipline, quality depends on who happens to be in the room.",
          },
          {
            title: "“Only one person understands the code.”",
            body: "Key-person risk is real: tests, documentation, clean boundaries, repeatable deployments, and runbooks are what let a team carry a product forward without losing what made it valuable.",
          },
          {
            title: "Hard to scale by hiring",
            body: "You cannot hire your way to consistency fast enough. Enablement leaders need a self-serve path every team can follow on its own.",
          },
          {
            title: "Prototypes stall before production",
            body: "A prototype proves demand; carrying it to production is a different discipline. Teams need a clear, teachable loop for what happens next.",
          },
        ],
      },
    },
    {
      id: "value",
      type: "benefits",
      data: {
        eyebrow: "How vygo helps",
        title: "A free, self-serve learning path — plus a path to engineering",
        intro:
          "vygo's real, already-published free learning assets give every team a shared build-and-verify discipline. This is product-design documentation and a hub — not training cohorts, a course, an LMS, or certifications.",
        items: [
          {
            title: "The Ratchet system guide",
            body: "The complete v1.2 pack as one free zip: overview, architecture, the loop contract, Composer, Vault, design principles, and the phase A–E rebuild checklist. Free, no signup and no paywall.",
          },
          {
            title: "The Vibe Coding Hub",
            body: "Where the loop, the rules, and the guide live. Steering AI builders with clear goals while every step is proven against the live product.",
          },
          {
            title: "A shared discipline, not a person",
            body: "Iterating in small, verifiable steps against the deployed product — build, pass a live deploy gate, get tested, repeat until a streak of passes — so quality does not depend on one hero.",
          },
          {
            title: "A direct path to senior engineering",
            body: "When a product outgrows the playbook, apply for the next production opening to bring in senior production engineering under vygo's fixed method.",
          },
        ],
      },
    },
    {
      id: "benefits",
      type: "benefits",
      data: {
        eyebrow: "For enablement leaders",
        title: "Scalable, self-serve, and free",
        intro:
          "Point every team at the same free playbook and standardize how AI-built software moves toward production — without adding headcount.",
        items: [
          {
            title: "Standardize quality across teams",
            body: "One build-and-verify loop every team can follow gives you a consistent way to raise production quality, team to team.",
          },
          {
            title: "Self-serve by design",
            body: "Free, no signup and no paywall: teams get the full guide and hub without a gate, so adoption does not wait on you.",
          },
          {
            title: "No secrets required",
            body: "The guide contains no API keys, no vault passwords, and no host credentials. It teaches public-safe product concepts only.",
          },
          {
            title: "A clear escalation path",
            body: "When a product is ready for production engineering, the same page routes leaders to apply for the next opening — no separate hunt for how to engage.",
          },
        ],
      },
    },
    {
      id: "how-it-works",
      type: "method",
      data: {
        eyebrow: "The loop",
        title: "The build-and-verify loop your teams standardize on",
        intro:
          "Every mission runs the same ratchet, and it never moves backward. This is the shared discipline the guide and hub teach.",
        steps: [
          {
            name: "Goal",
            body: "A human states the outcome — the team sets goals and constraints while an AI builder writes and pushes the code.",
          },
          {
            name: "Multi-step missions",
            body: "The goal is queued as roughly 4–8 verifiable steps, never one mega-prompt expected to finish a product overnight.",
          },
          {
            name: "Build",
            body: "The AI builder pushes code against the deployed product, not a local hope.",
          },
          {
            name: "Live deploy gate",
            body: "/version must report the new SHA, so the gate can prove what is really live before anything is graded.",
          },
          {
            name: "Test",
            body: "A tester grades the live site. Local trees and an agent's claim of “done” do not count — live is truth.",
          },
          {
            name: "Streak of passes",
            body: "Consecutive passes close the loop. A FAIL sends the mission back to Build with the tester's report; the ratchet just holds.",
          },
        ],
      },
    },
    {
      id: "proof",
      type: "benefits",
      data: {
        eyebrow: "Why it holds up",
        title: "A real, teachable method — and honestly labeled assets",
        intro:
          "The proof here is the method and the assurances themselves, drawn from vygo's live content. No learner counts, “teams trained,” or outcome numbers are claimed — none exist.",
        items: [
          {
            title: "Free, no signup, no paywall",
            body: "The guide is free — the full v1.2 pack. It is product-design documentation, not access to anyone's running VPC, and it never asks for secrets.",
          },
          {
            title: "Non-negotiables that make it verifiable",
            body: "Live is truth; /version must report the deploy SHA; no secrets in the builder environment; multi-step goals of roughly 4–8 steps, never one mega-prompt.",
          },
          {
            title: "The hub, labeled honestly",
            body: "The Ratchet system guide is available today; further Vibe Coding Hub topics — writing missions, live verify & testing, models & costs, case studies — publish as they ship and are labeled coming soon.",
          },
          {
            title: "Compatible with how teams build",
            body: "The approach is compatible with products created using tools like Lovable, Cursor, Replit, Bolt, and v0. These tool names describe compatibility, not formal partnerships or endorsement.",
          },
        ],
      },
    },
    {
      id: "objections",
      type: "faq",
      data: {
        eyebrow: "Before you apply",
        title: "Questions enablement leaders ask",
        items: [
          {
            question: "Is the guide gated?",
            answer:
              "No. It is free, with no signup and no paywall, and it contains no secrets. Teams download the full v1.2 pack directly — no login and no form.",
          },
          {
            question: "Is this a course or certification?",
            answer:
              "No. It is product-design documentation and a hub, not training, an LMS, or certification. It teaches a repeatable build-and-verify method your teams can adopt themselves.",
          },
          {
            question: "What happens when we apply?",
            answer:
              "Submitting an application does not create a client relationship. vygo reviews it against the next available opening, and work begins only under a signed agreement.",
          },
          {
            question: "Which AI-built stacks does this work with?",
            answer:
              "The method is compatible with products built using tools like Lovable, Cursor, Replit, Bolt, and v0. Tool names describe compatibility, not formal partnerships.",
          },
        ],
      },
    },
    {
      id: "waitlist",
      type: "waitlist",
      data: {
        eyebrow: "Apply for the next opening",
        title: "Bring in senior production engineering when a product is ready",
        intro:
          "Tell us what your teams built, where it is getting stuck, and what deadline matters. vygo reviews applications against the next available Production Readiness Audit and engineering opening. Submitting this application does not create a client relationship; work begins only under a signed agreement.",
      },
    },
    {
      id: "closing",
      type: "closingCta",
      data: {
        eyebrow: "Standardize what happens after the prototype",
        title: "Give every team the same free playbook",
        body: "Point your teams at the free Ratchet system guide and Vibe Coding Hub — then apply for the next opening when a product is ready for senior production engineering.",
        // Same on-page waitlist application as every other prominent CTA.
        primaryCta: { ...applyCta, variant: "on-dark" },
        secondaryCta: {
          label: "See the loop",
          href: "#how-it-works",
          variant: "ghost-on-dark",
        },
      },
    },
  ],
};
