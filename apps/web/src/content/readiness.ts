/** Copy for the public Readiness Check flow (/readiness). */

export const readinessContent = {
  page: {
    eyebrow: "Readiness Check",
    title: "Is your product production-ready?",
    body: "Answer a few questions. We’ll generate a read-only diagnostic prompt tailored to how you build — no secrets, no code changes.",
  },
  stage1: {
    progressLabel: "Stage 1 of 3 — intake",
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
    progressLabel: "Stage 2 of 3 — diagnostic prompt",
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
    pasteResults: "I've run it — paste results",
    resumeHint: "Your progress is saved. Use the resume link in email or keep this tab.",
  },
  stage3: {
    progressLabel: "Stage 3 of 3 — paste results",
    title: "Paste your diagnostic report",
    body: "Paste the full report from your AI tool. Chat wrapping and markdown code fences are fine — strip secrets first.",
    textareaLabel: "Diagnostic report paste",
    textareaPlaceholder:
      "Paste the VYGO-READINESS-REPORT block here (markdown fences and line wrapping are OK)…",
    submit: "Submit report",
    submitting: "Checking…",
    secretsMessage: "Remove secrets before submitting.",
    back: "Back to prompt",
    draftSaved: "Draft saved",
  },
  confirm: {
    title: "Here's what we learned",
    pendingTitle: "Here's what we learned so far",
    pendingBody:
      "We're still finishing the full parse. You can continue with what we have, or re-paste if something looks incomplete.",
    stackLabel: "Stack",
    sizeLabel: "Size",
    findingsLabel: "Findings",
    looksRight: "Looks right → continue",
    somethingOff: "Something's off",
    repaste: "Re-paste report",
    editHint: "You can re-paste or tweak key fields below.",
  },
  fallback: {
    eyebrow: "Fallback questionnaire",
    title: "Can't run the diagnostic agent?",
    body: "Answer these plain-language questions. We map them to the same readiness report as the automated path — with lower confidence and wider indicative ranges.",
    submit: "Submit answers",
    submitting: "Saving…",
    successTitle: "Saved — manual path",
    successBody:
      "Your answers are stored on this session with source=manual and confidence=low. You can close this tab and resume later with your token.",
    back: "Back to readiness check",
    continueToReadiness: "Return to readiness check",
  },
} as const;
