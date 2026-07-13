export type FaqItem = {
  question: string;
  answer: string;
};

export const faqItems: FaqItem[] = [
  {
    question: "Do you throw away the MVP?",
    answer:
      "No. The validated UX, workflows, product decisions, and useful data are the starting point. The audit identifies what can remain, what must be hardened, and what should be rebuilt.",
  },
  {
    question: "Which AI-built stacks do you work with?",
    answer:
      "vygo can assess products created with Lovable, Cursor, Replit, Bolt, v0, Supabase, Firebase, and conventional React, Node.js, Python, Go, and cloud stacks. Tool names describe compatibility, not formal partnerships.",
  },
  {
    question: "What does the Production Readiness Audit include?",
    answer:
      "A code, architecture, data, security, scalability, operations, and compliance-readiness review; a threat model; a keep-versus-rebuild map; a prioritized findings report; and a fixed-price plan.",
  },
  {
    question: "Is the $15K audit required?",
    answer:
      "The audit is the normal starting point because it creates a defensible scope and price. For unusually well-documented systems, vygo may adjust the process after an initial review.",
  },
  {
    question: "Can you guarantee SOC 2 certification?",
    answer:
      "No responsible engineering firm can guarantee an independent auditor’s decision. vygo implements the technical and operational controls, evidence workflows, policies, testing, and audit support needed to pursue SOC 2 readiness efficiently.",
  },
  {
    question: "Who owns the code and infrastructure?",
    answer:
      "The client owns the code, infrastructure, documentation, and IP produced for the engagement, subject to the final contract and any clearly identified third-party components.",
  },
  {
    question: "Can you start immediately?",
    answer:
      "Capacity depends on the current senior engineering pods. The website shows the next real opening. Urgent, contract-blocking situations should be described in the application so they can be reviewed appropriately. Applying does not form a client engagement until a separate agreement is signed. For hard deadlines, privacy requests, or legal notices, email hello@vygo.ai with the details.",
  },
  {
    question: "What happens after launch?",
    answer:
      "Clients receive documentation, runbooks, and a full walkthrough. vygo Ops is available for monitoring, incident response, security updates, compliance-readiness upkeep, and ongoing engineering.",
  },
  {
    question: "Can we pay cash and keep all of our equity?",
    // Editorial: do not publish numeric premiums/equity % until counsel approves;
    // gate numbers via commercialFlags.showExactEquityTerms / showCashOnlyPremium.
    answer:
      "A cash-only option is available. Exact equity percentages and cash-only premiums are published only after legal counsel approves the public wording.",
  },
  {
    question: "What if we only need a small bug fix?",
    answer:
      "vygo is built for production risk, architecture, security, compliance readiness, and scale—not isolated low-cost patches. The audit may identify a smaller remediation path or determine that another provider is a better fit.",
  },
];
