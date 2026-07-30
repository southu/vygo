// Relative import (not the "@/" alias) so this pure data module — and the
// campaign it exports — can be loaded directly by the node:test suite, which
// does not resolve tsconfig path aliases.
import type { CampaignConfig, CampaignCta, CampaignImage } from "../../lib/campaign/types";

/**
 * Campaign 3 landing surface — workforce capability & builder engagement for
 * engineering leaders.
 *
 * Independently addressable at /leaders/workforce-capability, this page serves
 * Heads of Engineering, VPs of Engineering, and CTOs whose developers ship
 * AI-built software quickly but hit a capability gap at production — security,
 * reliability, ownership — and whose builders are stuck maintaining fragile
 * systems only one person understands. Its single, visually dominant action is
 * a waitlist application submitted on-page; a completed waitlist application
 * (NOT an assessment) is this campaign's primary conversion.
 *
 * Every claim is grounded in already-approved language and permissible proof
 * from the campaign brief (docs/paid-campaign-landing-pages.md, Campaign 3) and
 * its cited sources:
 *   - The capability gap, key-person risk, and "the production layer AI tools do
 *     not provide by themselves": content/homepage.ts (pains, capabilities).
 *   - "We keep / we replace or harden" — the prototype is the head start:
 *     content/homepage.ts (keepReplace).
 *   - "A codebase your team can own" — architecture docs, runbooks, tests, full
 *     IP handoff: content/homepage.ts (capabilities, why), content/faq.ts.
 *   - Fixed methodology, weekly demos + staging access, dedicated QA & UAT Lead
 *     on every build (separate from the engineers): content/method.ts,
 *     content/faq.ts.
 *   - Senior-only delivery, fixed price after audit, full IP handoff:
 *     content/homepage.ts (why), content/why-vygo.ts.
 *   - Apply / waitlist framing (an application is not a client relationship;
 *     work begins only under a signed agreement): content/waitlist.ts,
 *     content/legal.ts. Approved CTA vocabulary: content/ctas.ts.
 *   - Readiness-only (no guaranteed SOC 2 certification): content/faq.ts,
 *     content/legal.ts. Compatibility-not-partnership footnote: content/faq.ts.
 *
 * No testimonials, logos, case studies, delivery-speed claims, success rates,
 * retention numbers, or invented capability-uplift metrics appear — none exist
 * in the repository (see brief Guardrails). The distinct measurement definition
 * from Campaign 2 (capability/qualified-application-led vs. enablement-led) is a
 * marketing-measurement concern and introduces no new on-page claim.
 */

/** Slug, route path, canonical, and stable page id for the campaign. */
export const WORKFORCE_CAPABILITY_ID = "leaders-workforce-capability";
export const WORKFORCE_CAPABILITY_SLUG = WORKFORCE_CAPABILITY_ID;
export const WORKFORCE_CAPABILITY_PATH = "/leaders/workforce-capability";
export const WORKFORCE_CAPABILITY_CANONICAL = `https://www.vygo.ai${WORKFORCE_CAPABILITY_PATH}`;

/**
 * The single, visually dominant conversion action: apply on the on-page
 * waitlist form. An in-page anchor so every prominent CTA scrolls to the same
 * waitlist application on this page rather than navigating away.
 */
export const APPLY_LABEL = "Apply for the next opening";
export const APPLY_HREF = "#waitlist";

/** Explicit, indexable robots policy for the campaign page metadata. */
export const WORKFORCE_CAPABILITY_ROBOTS = { index: true, follow: true } as const;

const applyCta: CampaignCta = {
  label: APPLY_LABEL,
  href: APPLY_HREF,
  variant: "primary",
};

/**
 * Campaign-specific content image: a diagram-led, no-photography figure (per the
 * brief's imagery direction) on the shared brand tokens — a validated prototype,
 * the vygo production layer, and a production-grade codebase the team owns. Its
 * source URL is unique to this campaign, distinct from the other two landing
 * pages, and it carries descriptive alt text.
 */
export const CAPABILITY_LADDER_IMAGE: CampaignImage = {
  src: "/campaign/workforce-capability/capability-ladder.svg",
  width: 800,
  height: 520,
  alt: "Three stages from a validated prototype, through the vygo production layer, to a production-grade codebase your team owns — architecture docs, runbooks, tests, and full IP handoff.",
  lazy: true,
};

export const leadersWorkforceCapabilityCampaign: CampaignConfig = {
  id: WORKFORCE_CAPABILITY_ID,
  slug: WORKFORCE_CAPABILITY_SLUG,
  path: WORKFORCE_CAPABILITY_PATH,
  meta: {
    title:
      "Close the gap between shipping prototypes and shipping production-grade software | vygo.ai",
    description:
      "For Heads of Engineering, VP Eng, and CTOs: turn a team that ships AI-built prototypes into one that ships production-grade software. Senior engineers rebuild the foundation and hand your team a codebase they can own — architecture docs, runbooks, and tests — with a fixed method and full IP handoff. Apply for the next opening.",
    canonical: WORKFORCE_CAPABILITY_CANONICAL,
    ogTitle: "Turn a prototype team into a production team — with a codebase you own",
    ogDescription:
      "vygo re-engineers the foundation beneath your AI-built product and hands off architecture docs, runbooks, tests, and full IP — fixed method, senior-only delivery, QA/UAT on every build. Apply for the next opening.",
    ogImage: "https://www.vygo.ai/web-app-manifest-512x512.png",
    ogImageAlt: "vygo.ai",
  },
  nav: {
    homeHref: "/",
    homeLabel: "vygo.ai home",
    links: [
      { label: "The method", href: "#method" },
      { label: "Objections", href: "#objections" },
    ],
    // Single campaign conversion link in the primary navigation.
    cta: applyCta,
  },
  footer: {
    summary:
      "vygo closes the gap between shipping prototypes and shipping production-grade software: senior engineers rebuild the foundation and hand your team a codebase they can own — architecture docs, runbooks, tests, and full IP. A fixed method, not open-ended consulting. Apply for the next opening.",
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
        eyebrow: "Workforce capability for engineering leaders",
        heading: "Your team ships prototypes. We help them ship production-grade software.",
        subheading:
          "Your developers build working AI-built products fast, then hit a capability gap at production — fragile auth, no environment separation, missing tests, and a codebase only one person understands. vygo's senior engineers rebuild the foundation and hand your team a codebase they can own, so the team's capability lifts with the product.",
        bullets: [
          "Senior-only delivery and a fixed price after a two-week audit — not open-ended consulting.",
          "A codebase your team can own: architecture docs, runbooks, tests, and full IP handoff.",
          "Independent QA & UAT on every build — verification separate from the engineers who wrote the code.",
        ],
        // Decision point: the on-page waitlist application.
        primaryCta: applyCta,
        secondaryCta: {
          label: "See the method",
          href: "#method",
          variant: "secondary",
        },
      },
    },
    {
      id: "problem",
      type: "benefits",
      data: {
        eyebrow: "The capability gap",
        title: "Fast prototypes, then a wall at production",
        intro:
          "A prototype proves demand quickly. When real users, sensitive data, enterprise buyers, and operational pressure arrive, the engineering requirements change — and a team that ships fast can stall carrying the product the rest of the way. That is not a product failure; it is the next stage of engineering.",
        items: [
          {
            title: "“Only one person understands the code.”",
            body: "Key-person risk caps the whole team. Tests, documentation, clean boundaries, repeatable deployments, and runbooks are what let a team carry the product forward without losing what made it valuable.",
          },
          {
            title: "Fragile foundations under real load",
            body: "Auto-generated monoliths without clear contracts, fragile auth and missing authorization, one-click infrastructure with no environment separation, and absent test coverage break when real customers arrive.",
          },
          {
            title: "A security questionnaire is blocking the deal",
            body: "The buyer already wants the product. Missing controls, evidence, logging, and an access model stall the review — and the team has no clear path to move it forward.",
          },
          {
            title: "Builders stuck firefighting instead of building",
            body: "Console-log debugging and missing incident response keep senior builders maintaining fragile systems instead of shipping. The capability gap caps both product outcomes and the team's growth.",
          },
        ],
      },
    },
    {
      id: "capabilities",
      type: "benefits",
      data: {
        eyebrow: "The angle",
        title: "The production layer AI tools do not provide by themselves",
        intro:
          "vygo closes the gap between a working prototype and production-grade software. Senior engineers build in the production layer AI builders skip — and the work leaves your team more capable, not more dependent.",
        items: [
          {
            title: "Production engineering",
            body: "Typed services, versioned APIs, reliable background jobs, automated tests, code review, CI/CD, and maintainable architecture — the foundation a team can extend.",
          },
          {
            title: "Security by design",
            body: "Threat modeling, secure defaults, SAST and dependency scanning, secrets management, least privilege, and remediation before launch — not bolted on after.",
          },
          {
            title: "Identity and access",
            body: "SSO and SAML where required, MFA, role-based access control, tenant isolation, service-account discipline, and full audit trails.",
          },
          {
            title: "Scale and reliability",
            body: "Infrastructure as code, separate environments, autoscaling strategy, performance testing, observability, SLOs, backups, and disaster-recovery planning.",
          },
        ],
      },
    },
    {
      id: "method",
      type: "method",
      data: {
        eyebrow: "How the work runs",
        title: "A fixed methodology, not open-ended consulting",
        intro:
          "The validated product stays visible throughout the rebuild — weekly demos and staging access rather than waiting months for a reveal. The audit defines the scope and a fixed price before the build begins, and nothing goes live without independent QA sign-off.",
        steps: [
          {
            name: "Audit",
            body: "A two-week review of code, architecture, security, scalability, and compliance-readiness gaps. You receive a prioritized findings report, a keep-versus-rebuild map, and a fixed-price plan — yours to keep either way.",
          },
          {
            name: "Architect",
            body: "Define the target platform without erasing validated product behavior: target architecture and data model, environment and delivery pipeline, and the security and compliance-readiness roadmap.",
          },
          {
            name: "Rebuild",
            body: "Re-engineer core services while preserving the validated UX and workflows, with weekly demos and staging access so the product stays visible the whole way.",
          },
          {
            name: "QA & UAT on every build",
            body: "Every engagement includes a dedicated QA & UAT Lead — separate from the engineers writing the code — so the people checking the work are never the people who built it. Nothing goes live without independent QA sign-off.",
          },
          {
            name: "Harden",
            body: "Prove the platform survives real load, failure, and operational use: security, load, backup and recovery testing, observability and alerting, and operational control implementation.",
          },
          {
            name: "Own",
            body: "Handoff of the complete product, source code, and infrastructure with architecture documentation, runbooks, and a full walkthrough — full IP, no lock-in, so your team carries it forward.",
          },
        ],
        media: CAPABILITY_LADDER_IMAGE,
      },
    },
    {
      id: "ownership",
      type: "benefits",
      data: {
        eyebrow: "The outcome",
        title: "A codebase your team can own",
        intro:
          "The prototype your team built is the head start, not something to erase. vygo keeps the validated work and re-engineers the rest, then hands the whole thing over — so the workforce's capability lifts with the product.",
        items: [
          {
            title: "The work you already did is the head start",
            body: "vygo keeps the validated UX, user-approved workflows, product rules and domain knowledge, and useful data migrated safely — the audit maps what to keep, harden, or rebuild.",
          },
          {
            title: "Documentation your team can extend",
            body: "Architecture documentation, runbooks, test suites, and deployment instructions ship with the build, so another qualified engineer — or your own team — can take it forward.",
          },
          {
            title: "Full IP handoff, no lock-in",
            body: "You receive the complete product, source code, and infrastructure. The client owns the code, infrastructure, documentation, and IP produced for the engagement.",
          },
          {
            title: "Accountability after launch",
            body: "The same team that rebuilt the product can stay accountable for uptime, security, and compliance-readiness evidence — everything stays documented so another qualified team could take over.",
          },
        ],
      },
    },
    {
      id: "evidence",
      type: "benefits",
      data: {
        eyebrow: "Why it holds up",
        title: "How the engagement is built to be verifiable",
        intro:
          "The proof here is the method and the approved assurances themselves, drawn from vygo's live content. No delivery-speed claims, success rates, retention numbers, or capability-uplift metrics are stated — none exist.",
        items: [
          {
            title: "Senior-only delivery",
            body: "Senior people on the work — no junior bench learning on your product.",
          },
          {
            title: "Fixed price after audit",
            body: "The two-week Production Readiness Audit defines the scope and a fixed price before the build begins, so the engagement is a defined project, not open-ended consulting.",
          },
          {
            title: "Independent QA & UAT on every build",
            body: "A dedicated QA & UAT Lead, separate from the engineers, runs functional and user-acceptance testing before launch on every engagement. You approve what ships; vygo verifies it works.",
          },
          {
            title: "Compatible with how your team builds",
            body: "vygo can assess products created with tools like Lovable, Cursor, Replit, Bolt, and v0. These tool names describe compatibility, not formal partnerships or endorsement.",
          },
        ],
      },
    },
    {
      id: "objections",
      type: "faq",
      data: {
        eyebrow: "Before you apply",
        title: "Questions engineering leaders ask",
        items: [
          {
            question: "Will you throw away what we built?",
            answer:
              "No. The validated UX, workflows, product decisions, and useful data are the starting point. The audit identifies what can remain, what must be hardened, and what should be rebuilt.",
          },
          {
            question: "Is this open-ended consulting?",
            answer:
              "No. It is a fixed methodology with a fixed price set after a two-week Production Readiness Audit, so the scope and cost are defined before the build begins.",
          },
          {
            question: "Who tests the software before launch?",
            answer:
              "Every engagement includes a dedicated QA & UAT Lead who verifies the software — separate from the engineers writing the code — and runs functional and user-acceptance testing before launch. Nothing goes live without independent QA sign-off.",
          },
          {
            question: "Do we get locked in?",
            answer:
              "No. You receive full IP handoff — the complete product, source code, infrastructure, documentation, and runbooks — so another qualified team could take over. There is no lock-in.",
          },
          {
            question: "Can you guarantee SOC 2 certification?",
            answer:
              "No responsible firm can guarantee an independent auditor's decision. vygo implements the technical and operational controls, evidence workflows, policies, testing, and audit support needed to pursue SOC 2 readiness — readiness work, not a certification guarantee.",
          },
        ],
      },
    },
    {
      id: "waitlist",
      type: "waitlist",
      data: {
        eyebrow: "Apply for the next opening",
        title: "Bring in senior engineering to close the capability gap",
        intro:
          "Tell us what your team built, where it is getting stuck, and what deadline matters. vygo reviews applications against the next available Production Readiness Audit and engineering opening. Submitting this application does not create a client relationship; work begins only under a signed agreement.",
      },
    },
    {
      id: "closing",
      type: "closingCta",
      data: {
        eyebrow: "Close the prototype-to-production gap",
        title: "Turn a prototype team into a production team",
        body: "Senior engineers rebuild the foundation and hand your team a codebase they can own — architecture docs, runbooks, tests, and full IP. Apply for the next opening.",
        // Same on-page waitlist application as every other prominent CTA.
        primaryCta: { ...applyCta, variant: "on-dark" },
        secondaryCta: {
          label: "See the method",
          href: "#method",
          variant: "ghost-on-dark",
        },
      },
    },
  ],
};
