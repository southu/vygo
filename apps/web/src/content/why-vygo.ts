export const whyVygoContent = {
  hero: {
    eyebrow: "Why vygo.ai",
    quote:
      "A security questionnaire is blocking your deal. Your enterprise buyer wants the product — they need the controls. That is exactly what vygo.ai is built to solve.",
  },
  market: {
    heading: "AI-built software is moving faster than production readiness",
    stats: [
      {
        value: "$4.7–7.4B",
        detail: "Vibe coding tools market in 2026, growing 17–38% annually",
      },
      {
        value: "45%",
        detail: "of AI-generated code contains high-risk OWASP Top-10 vulnerabilities",
      },
      {
        value: "63%",
        detail: "of vibe coding users are non-developers who can't harden production themselves",
      },
      {
        value: "25%",
        detail: "of YC startups rely heavily on AI-generated code for core systems",
      },
    ],
  },
  providers: {
    heading: "Two types of providers",
    intro:
      "The difference is whether the work closes today's ticket or clears the path to enterprise production.",
    options: [
      {
        eyebrow: "Budget / tactical shops",
        price: "$5K–$25K",
        description: "Surface fixes, no compliance path, and no senior-only guarantee.",
        featured: false,
      },
      {
        eyebrow: "Production engineering firms",
        price: "$75K–$350K+",
        description:
          "Re-architect the foundation, build compliance and security in by design, and stay accountable after launch. This is where vygo.ai competes.",
        featured: true,
      },
    ],
  },
} as const;
