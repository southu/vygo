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
  comparison: {
    heading: "Built for the path to enterprise production",
    intro:
      "A tactical patch can close a ticket. Production engineering closes the underlying gaps.",
    columns: ["What buyers need", "Budget / tactical shops", "vygo.ai"],
    rows: [
      ["Production architecture", "Surface-level fixes", "Foundation rebuilt for scale"],
      ["Security controls", "Point-in-time remediation", "Designed into the system"],
      [
        "Compliance readiness",
        "Not typically included",
        "Controls, evidence, and operating practices",
      ],
      ["Delivery team", "Mixed staffing", "Senior-only engineering"],
      ["After launch", "Handoff at completion", "Ongoing operational accountability"],
    ],
  },
  claims: {
    heading: "Why teams choose vygo.ai",
    items: [
      {
        title: "Senior people do the work",
        body: "The engineers making the architecture decisions are the engineers building the system.",
      },
      {
        title: "Scope becomes a fixed price",
        body: "The Production Readiness Audit turns uncertainty into a prioritized plan and fixed-price rebuild scope.",
      },
      {
        title: "Security is part of delivery",
        body: "Controls, evidence, and compliance-ready operating practices are built in rather than added at the end.",
      },
      {
        title: "Accountability continues after launch",
        body: "The same team can remain responsible for uptime, security, and continued product delivery through vygo Ops.",
      },
    ],
  },
  cta: {
    heading: "Turn the enterprise blocker into a production plan.",
    body: "Tell us what the buyer needs, what is blocking the deal, and when the deadline matters.",
    label: "Apply for the next opening",
    href: "/waitlist",
  },
} as const;
