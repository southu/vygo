/** Copy for the public Readiness Check flow (/readiness). */

export const readinessContent = {
  page: {
    eyebrow: "Readiness Check",
    title: "Is your product production-ready?",
    body: "Answer a few questions. We’ll generate a read-only diagnostic prompt tailored to how you build — no secrets, no code changes.",
  },
  radar: {
    eyebrow: "Readiness Radar",
    title: "What a readiness report looks like",
    body: "Five assessment dimensions on one radial view — scored from a live self-assessment. Hover or tab to any dimension to see its top critical risk factor.",
    hint: "Hover, tap, or tab to a dimension node to reveal its top critical risk — click a node to jump to its deep dive.",
  },
  project: {
    progressLabel: "Start — choose a project",
    title: "Which project is this analysis for?",
    body: "Pick a project you've analysed before, or name a new one. Every run is saved under its project, so you can start a fresh analysis anytime without touching earlier results.",
    existingGroupLabel: "Existing project",
    existingHelper: "Continue an existing project's history.",
    newOptionLabel: "New project label",
    newInputLabel: "New project name",
    newPlaceholder: "e.g. Acme production app",
    defaultProject: "Default project",
    start: "Start analysis",
    starting: "Starting…",
    continue: "Continue to intake",
    started:
      "New analysis run started — it's in progress. Your earlier completed results stay available.",
    projectPrefix: "Project",
    /**
     * Guardrail messages surfaced in-flow when a start is blocked. Each is a
     * distinct, DOM-visible alert so a block is never silent. `duplicate` and
     * `rateLimit` deliberately differ in wording (and colour) so the two
     * guardrails read as different situations to the user.
     */
    duplicateTitle: "An analysis is already running for this project",
    duplicateBodyPrefix: "We didn't start a second analysis for ",
    duplicateBodySuffix:
      " because one is already in progress. Wait for it to finish before starting another — or start a new analysis for a different project.",
    duplicatePointerLabel: "Running analysis reference:",
    duplicatePointerLink: "View your analyses",
    rateLimitTitle: "You've hit the analysis start limit",
    rateLimitBody:
      "You've started a lot of analyses in a short time, so we've paused new starts for now. Please wait a little while and try again — your existing runs and results are safe.",
    blockedTitle: "We couldn't start this analysis",
    blockedBody:
      "We couldn't confirm it was safe to start a new run just now, so we've held off rather than start one silently. Please try again in a moment.",
  },
  newAnalysis: {
    label: "New analysis",
    runAgain: "Run again",
    landingHint:
      "Already have a completed analysis? Start a new one for any project — your earlier results stay available.",
    historyLabel: "View analysis history",
    historyHint: "Browse every past run grouped by project, with each project's current result.",
  },
  stage1: {
    progressLabel: "Stage 1 of 3 — intake",
    questions: {
      productDescription: {
        id: "productDescription",
        label: "What does your product do?",
        helper: "One short sentence, or name the tools/platforms it relies on. Max 200 characters.",
        placeholder: "e.g. Scheduling for clinics — HubSpot, Salesforce, Slack",
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
    /**
     * Prompt-running stage marker. Names the stage explicitly so the running
     * step (prompt displayed, paused for the user to run it externally) is
     * clearly identifiable — distinct from the later paste-results stage.
     */
    runningMarker: "Prompt-running stage — run this in your tool, then continue",
    /**
     * Optional direct-submit shortcut shown inside the prompt-running stage. The
     * primary advance stays the explicit "I've run it — paste results" proceed
     * action; this lets a user who already has the report submit it here without
     * stepping through the proceed action first. Purely user-initiated — never
     * triggered by background mission completion or polling.
     */
    alreadyRanTitle: "Already have the report?",
    alreadyRanHelper:
      "Paste the report from your tool here to submit it now — or use “I've run it — paste results” below to open the full paste step. Nothing advances on its own.",
    resumeHint: "Your progress is saved. Use the resume link in email or keep this tab.",
    /**
     * Prompt-generation failure (Stage 2). Shown when we reached Stage 2 but the
     * tailored diagnostic prompt could not be built from the Stage 1 answers.
     * Distinct in wording from both the generic bootstrap error ("We could not
     * start the check.") and the Stage 3 paste-parse-failure copy so a user can
     * tell at a glance that it was prompt generation — not intake or paste —
     * that broke. Shares the failed-state shape: heading + detail + next action.
     */
    generationErrorTitle: "We couldn't generate your diagnostic prompt",
    generationErrorBody:
      "We reached Stage 2 but couldn't turn your Stage 1 answers into a usable diagnostic prompt. This is on our side, not your paste — rebuild Stage 1 and we'll generate a fresh prompt.",
    generationErrorAction: "Rebuild Stage 1",
  },
  waiting: {
    // Exact status line shown while polling for the AI's POSTed results.
    status: "waiting for your AI to send results…",
    helper:
      "Keep this tab open — your analysis appears here automatically when it arrives. No AI send access? Paste the report yourself instead.",
    expiredTitle: "This results link expired",
    expiredBody:
      "Submission links stay valid for 30 minutes. Start over to generate a fresh prompt with a fresh link.",
    startOver: "Start over",
  },
  stage3: {
    progressLabel: "Stage 3 of 3 — paste results",
    title: "Paste your diagnostic report",
    body: "Paste the full report from your AI tool. Chat wrapping and markdown code fences are fine — strip secrets first.",
    textareaLabel: "Diagnostic report paste",
    textareaPlaceholder:
      "Paste the VYGO-READINESS-REPORT block here (markdown fences and line wrapping are OK)…",
    noSendHelper:
      "My AI couldn't send it — no problem. Paste the delimited results block (with the === begin/end marker lines) here and submit it yourself. It goes to the same endpoint your AI would use, so nothing is lost.",
    submit: "Submit report",
    submitting: "Checking…",
    secretsMessage: "Remove secrets before submitting.",
    /**
     * Stage 3 prompt reference. The tailored diagnostic prompt generated at
     * Stage 2 is shown again here (collapsed by default) so the paste step is
     * self-contained: a user who lands on Stage 3 can re-read or re-copy the
     * exact prompt they were meant to run without stepping back to Stage 2.
     */
    promptReferenceTitle: "Your diagnostic prompt",
    promptReferenceHelper:
      "This is the prompt from Stage 2 — run it in your AI tool, then paste the report it produces below.",
    promptReferenceCopy: "Copy prompt",
    promptReferenceCopied: "Copied",
    back: "Back to prompt",
    draftSaved: "Draft saved",
    /**
     * Neutral "nothing pasted yet" prompt-to-paste. NOT an error — shown while
     * the paste field is empty in place of a silently-disabled submit button.
     * Deliberately calm in tone (no "we couldn't…") so it reads differently from
     * both the prompt-generation failure and the paste-parse failure.
     */
    emptyPrompt:
      "Paste your Readiness Check output above to continue. Nothing is sent until you submit — we'll check the structure then.",
  },
  confirm: {
    title: "Here's what we learned",
    pendingTitle: "Here's what we learned so far",
    pendingBody:
      "We're still finishing the full parse. Hang tight — once it's read a structured result you'll be able to confirm the findings. If it looks incomplete you can re-paste.",
    /**
     * Paste-parse failure (Stage 3). The ONE message for a genuinely
     * malformed/non-matching paste or a real parse error — fired only when the
     * server reports parseStatus "manual"/"error" or the parse request itself
     * failed on the server, never for a benign still-parsing/partial state
     * (that uses pendingTitle/pendingBody above). Worded distinctly from the
     * Stage 2 prompt-generation failure so it's clear the paste — not prompt
     * generation — is what didn't match.
     */
    parseFailedTitle: "We couldn't read a structured result",
    parseFailedBody:
      "This paste didn't match the expected VYGO-READINESS-REPORT structure, so we couldn't read a structured result from it. Re-paste the full report (including the === begin/end marker lines) — we can only continue once a structured result is read.",
    stackLabel: "Stack",
    sizeLabel: "Size",
    findingsLabel: "Findings",
    looksRight: "Looks right → continue",
    somethingOff: "Something's off",
    looksWrong: "Looks wrong? Re-paste results",
    repaste: "Re-paste report",
    editHint: "You can re-paste or tweak key fields below.",
  },
  gate: {
    progressLabel: "Almost done — results gate",
    title: "See your scored readiness results",
    body: "Share your name and work email so we can show your scorecard and recommended engagement. Company is optional.",
    nameLabel: "Full name",
    namePlaceholder: "Jane Founder",
    emailLabel: "Work email",
    emailPlaceholder: "you@company.com",
    companyLabel: "Company (optional)",
    companyPlaceholder: "Acme Inc",
    privacyLabel:
      "I accept the Privacy Policy and Terms of Use for processing my readiness results.",
    submit: "Show my results",
    submitting: "Scoring…",
    error: "Could not score right now. Check the fields and try again.",
  },
  snapshot: {
    eyebrow: "Readiness report",
    title: "Your production readiness report",
    recommendedLabel: "Recommended engagement",
    findingsLabel: "Top findings",
    pricingLabel: "Indicative engagement ranges",
    emailCopy: "Email me a copy of this snapshot",
    emailSending: "Sending…",
    emailSuccess: "Accepted — check your inbox shortly.",
    emailError: "Could not queue the email. Try again.",
    loading: "Loading report…",
    notFound: "This snapshot could not be found.",
    scoringFailedTitle: "We could not score this submission",
    scoringFailedBody:
      "The assessment answers were missing, incomplete, or malformed, so no readiness score could be computed. Nothing was fabricated in place of a score.",
    alreadySubmitted: "This assessment was already submitted. Showing your existing results.",
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
