import type { CampaignConfig } from "@/lib/campaign/types";

const PATH = "/campaign/student-success";
const CANONICAL = "https://www.vygo.ai/campaign/student-success";

/**
 * Representative campaign. All copy is grounded in vygo's approved positioning
 * (keep the validated product, rebuild the foundation, hand off full IP) framed
 * for teams scaling an AI-built student success product. No testimonials, logos,
 * or numeric outcome claims — only approved content and verified destinations.
 */
export const studentSuccessCampaign: CampaignConfig = {
  id: "student-success",
  slug: "student-success",
  path: PATH,
  meta: {
    title: "Student Success Campaign — Production Engineering for AI-Built Apps | vygo.ai",
    description:
      "vygo re-engineers validated student success products built with Lovable, Cursor, Replit, Bolt, and v0 into secure, scalable software with compliance readiness — keeping the product your users rely on.",
    canonical: CANONICAL,
    ogTitle: "Turn your AI-built student success product into production-grade software",
    ogDescription:
      "Keep the validated product, rebuild the foundation beneath it, and hand off full IP. Senior production engineering with fixed-price work after a Production Readiness Audit.",
    ogImage: "https://www.vygo.ai/campaign/student-success/og.png",
    ogImageAlt: "vygo.ai — production engineering for AI-built software",
  },
  nav: {
    homeHref: "/",
    homeLabel: "vygo.ai home",
    links: [
      { label: "How it works", href: "#method" },
      { label: "FAQ", href: "#faq" },
    ],
    cta: { label: "Apply", href: "#lead", variant: "primary" },
  },
  footer: {
    summary:
      "vygo provides senior production engineering that preserves the validated product, rebuilds the foundation beneath it, and hands off full IP.",
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
        eyebrow: "Student success campaign",
        heading: "Turn your AI-built student success product into production-grade software",
        subheading:
          "Your MVP proved the market. vygo re-engineers validated products built with tools like Lovable, Cursor, Replit, Bolt, and v0 into secure, scalable software with compliance readiness — while keeping the product your users already rely on.",
        bullets: [
          "Keep the validated product; rebuild the foundation beneath it.",
          "Senior production engineering with fixed-price work after an audit.",
          "Full IP handoff — the software is yours.",
        ],
        primaryCta: { label: "Apply for the next opening", href: "#lead", variant: "primary" },
        secondaryCta: {
          label: "See the readiness audit",
          href: "/audit",
          variant: "secondary",
        },
      },
    },
    {
      id: "benefits",
      type: "benefits",
      data: {
        eyebrow: "Why vygo",
        title: "Built for teams scaling a student success product",
        intro:
          "When adoption climbs, the foundation beneath an AI-built product has to carry real users, institutional buyers, and data-protection expectations.",
        items: [
          {
            title: "Keep what works",
            body: "We preserve the validated product your students and staff already use, and rebuild the foundation underneath it.",
          },
          {
            title: "Ready for procurement",
            body: "Security controls, identity, and data protection are engineered in, so institutional and enterprise review is something you can pass.",
          },
          {
            title: "Fixed-price after audit",
            body: "A Production Readiness Audit turns unknowns into a prioritized plan with fixed-price engineering — not an open-ended rebuild.",
          },
          {
            title: "Full IP handoff",
            body: "You own the result. vygo hands off the software, the documentation, and the operational runbook.",
          },
        ],
      },
    },
    {
      id: "method",
      type: "method",
      data: {
        eyebrow: "The method",
        title: "A fixed path from audit to operations",
        intro:
          "vygo follows one repeatable route from a two-week Production Readiness Audit through rebuild, hardening, compliance readiness, and ongoing operations.",
        steps: [
          {
            name: "Production Readiness Audit",
            body: "Two weeks of prioritized findings, a keep-versus-rebuild map, and a fixed-price plan.",
          },
          {
            name: "Rebuild the foundation",
            body: "Re-engineer the architecture, data model, and infrastructure beneath the validated product.",
          },
          {
            name: "Harden",
            body: "Security controls, identity, data protection, and offensive testing before you scale.",
          },
          {
            name: "Compliance readiness",
            body: "Evidence and controls prepared for institutional and enterprise review.",
          },
          {
            name: "Operations and handoff",
            body: "Runbooks, monitoring, and a full IP handoff so your team can operate with confidence.",
          },
        ],
        media: {
          src: "/campaign/student-success/hero-1200.png",
          srcSet:
            "/campaign/student-success/hero-800.png 800w, /campaign/student-success/hero-1200.png 1200w",
          sizes: "(max-width: 768px) 100vw, 560px",
          width: 1200,
          height: 630,
          alt: "vygo.ai — production engineering for AI-built software",
          lazy: true,
        },
      },
    },
    {
      id: "assurance",
      type: "assurance",
      data: {
        eyebrow: "Security and compliance",
        title: "Security and compliance, engineered in",
        intro: "Production engineering includes the controls institutional buyers expect.",
        items: [
          "Security controls and identity built into the rebuild",
          "Data protection aligned to how student information is handled",
          "Offensive testing before you scale",
          "Compliance readiness with prepared evidence",
        ],
      },
    },
    {
      id: "faq",
      type: "faq",
      data: {
        eyebrow: "FAQ",
        title: "Questions from founders",
        items: [
          {
            question: "Will you replace the product our users rely on?",
            answer:
              "No. vygo keeps the validated product and rebuilds the foundation beneath it, so the experience your users know stays intact.",
          },
          {
            question: "How does an engagement start?",
            answer:
              "With a two-week Production Readiness Audit: prioritized findings, a keep-versus-rebuild map, and a fixed-price plan.",
          },
          {
            question: "Who owns the software at the end?",
            answer: "You do. Every engagement ends with a full IP handoff.",
          },
          {
            question: "Which build tools do you work with?",
            answer: "Products built with tools such as Lovable, Cursor, Replit, Bolt, and v0.",
          },
        ],
      },
    },
    {
      id: "lead",
      type: "lead",
      data: {
        eyebrow: "Apply",
        title: "Apply for the next production opening",
        intro:
          "Tell us where to reach you and we'll review your product against available openings.",
        nameLabel: "Full name",
        emailLabel: "Work email",
        consentLabel:
          "I agree that vygo may use my details to respond to this enquiry, in line with the",
        submitLabel: "Check my details",
        successMessage:
          "Your details are complete. Finish your application below to reach the vygo team.",
        footnote:
          "vygo reviews applications against available openings. Submitting this form does not create a client relationship.",
      },
    },
  ],
};
