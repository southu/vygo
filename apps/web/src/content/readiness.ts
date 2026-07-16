/** Copy for the public Readiness Check flow (/readiness). */

export const readinessContent = {
  page: {
    eyebrow: "Readiness Check",
    title: "Is your product production-ready?",
    body: "Answer a few questions. We’ll generate a read-only diagnostic prompt tailored to how you build — no secrets, no code changes.",
  },
  stage1: {
    progressLabel: "Stage 1 of 2 — intake",
    questions: {
      productDescription: {
        id: "productDescription",
        label: "What does your product do?",
        helper: "One short sentence. Max 200 characters.",
        placeholder: "e.g. Scheduling tool for multi-location clinics",
      },
      whoUses: {
        id: "whoUses",
        label: "Who uses it today?",
      },
      builtWith: {
        id: "builtWith",
        label: "Primarily built with?",
      },
      blockers: {
        id: "blockers",
        label: "What's blocking you?",
        helper: "Select up to 2.",
      },
      deadline: {
        id: "deadline",
        label: "Deadline or live deal?",
        detailLabel: "Optional detail",
        detailPlaceholder: "e.g. Enterprise pilot kickoff next month",
      },
    },
    continue: "Continue",
    back: "Back",
  },
  offRampNotBuilt: {
    title: "Not a fit yet — come back after MVP",
    body: "vygo works with products that already have a working build and real usage pressure. When you have an MVP in market (or nearly there), start this check again and we’ll meet you with a production-grade diagnostic.",
    cta: "Back to vygo.ai",
  },
  offRampFeatures: {
    title: "vygo rebuilds foundations — not feature roadmaps",
    body: "If the main need is shipping new product features, we’re probably not the right partner right now. We specialize in security, reliability, and production foundations under a validated product. If reliability or security concerns are also in play, you can continue.",
    continueAnyway: "I also have reliability or security concerns — choose them",
    stop: "Thanks — not right now",
  },
  stage2: {
    progressLabel: "Stage 2 of 2 — diagnostic prompt",
    title: "Your tailored diagnostic prompt",
    howToTitle: "How to run it",
    copy: "Copy prompt",
    copied: "Copied",
    emailMe: "Email me this prompt",
    emailPlaceholder: "you@company.com",
    emailSubmit: "Send prompt",
    emailSending: "Sending…",
    emailSuccess: "Sent — check your inbox for the prompt and a resume link.",
    emailError: "Could not send right now. Try again or copy the prompt instead.",
    cantRun: "Can't run this?",
    cantRunHref: "/readiness/fallback",
    resumeHint: "Your progress is saved. Use the resume link in email or keep this tab.",
  },
  fallback: {
    eyebrow: "Fallback questionnaire",
    title: "Can't run the diagnostic agent?",
    body: "A structured questionnaire is coming soon. For now, email hello@vygo.ai with a short description of your product and stack, or return to the readiness check when you can run the prompt.",
    back: "Back to readiness check",
  },
} as const;
