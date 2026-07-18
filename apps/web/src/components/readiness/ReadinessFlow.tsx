"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  BLOCKER_OPTIONS,
  BUILT_WITH_OPTIONS,
  DEADLINE_OPTIONS,
  EMPTY_STAGE1,
  MAX_BLOCKERS,
  PASTE_SECRETS_BLOCK_MESSAGE,
  PRODUCT_DESCRIPTION_MAX,
  READINESS_PROMPT_REASSURANCE,
  WHO_USES_OPTIONS,
  buildConfirmationFindings,
  buildDiagnosticPrompt,
  buildPromptHowTo,
  deadlineNeedsDetail,
  describeSize,
  describeStack,
  isFeaturesOnlySoftOffRamp,
  isMalformedStructuredPaste,
  isNotBuiltYet,
  parseReadinessPastePartial,
  scanPasteForSecrets,
  structuredReadinessFromReport,
  type BlockerOption,
  type BuiltWithOption,
  type DeadlineOption,
  type ReadinessStage1Answers,
  type SizeClassification,
  type SizeMetric,
  type StackEntry,
  type WhoUsesOption,
} from "@vygo/validation";
import { readinessContent } from "@/content/readiness";
import {
  createReadinessSession,
  draftFromStage1,
  emailReadinessPrompt,
  getReadinessSession,
  getReadinessSubmissionStatus,
  logReadinessLead,
  parseReadinessPaste,
  patchReadinessSession,
  pasteTextFromDraft,
  stage1FromDraft,
  submitReadinessResults,
  type ParseResponse,
  type ScoreResponse,
} from "@/lib/readiness/api";
import {
  loadReadinessLocal,
  saveReadinessLocal,
  type ReadinessLocalState,
} from "@/lib/readiness/storage";
import { readinessAnalyticsEventCatalog, trackAnalytics } from "@/lib/analytics";
import { ScoreGateForm } from "@/components/readiness/ScoreGateForm";
import { AssessmentProgress } from "@/components/readiness/AssessmentProgress";
import { AnswerCallout } from "@/components/readiness/AnswerCallout";
import { ConfirmStackCard, ConfirmSizeCard } from "@/components/readiness/StackSizeCards";
import { FindingsList } from "@/components/readiness/FindingsList";
import {
  calloutForBlockers,
  calloutForBuiltWith,
  calloutForDeadline,
  calloutForProductDescription,
  calloutForWhoUses,
  type AnswerCalloutPayload,
} from "@/lib/readiness/answer-callouts";

// Retain event-name literals in the client bundle for live JS checks.
void readinessAnalyticsEventCatalog();

type View =
  | "loading"
  | "stage1"
  | "off_ramp_not_built"
  | "off_ramp_features"
  | "stage2"
  | "stage3"
  | "confirm"
  | "gate"
  | "error";

const STAGE1_STEPS = [
  "productDescription",
  "whoUses",
  "builtWith",
  "blockers",
  "deadline",
] as const;
type Stage1Step = (typeof STAGE1_STEPS)[number];

/** Full main-path step count: 5 intake + prompt + paste + confirm + gate. */
const FLOW_TOTAL_STEPS = STAGE1_STEPS.length + 4;
const FLOW_STEP_STAGE2 = STAGE1_STEPS.length + 1;
const FLOW_STEP_STAGE3 = STAGE1_STEPS.length + 2;
const FLOW_STEP_CONFIRM = STAGE1_STEPS.length + 3;
const FLOW_STEP_GATE = STAGE1_STEPS.length + 4;

/**
 * Interval for polling the ingest status endpoint while the prompt screen
 * waits on the customer's AI (plain polling — this stack has no SSE).
 */
const INGEST_POLL_INTERVAL_MS = 4000;

function mergeStage1(partial: Partial<ReadinessStage1Answers>): ReadinessStage1Answers {
  return {
    productDescription: partial.productDescription ?? "",
    whoUses: (partial.whoUses as WhoUsesOption | "") ?? "",
    builtWith: (partial.builtWith as BuiltWithOption | "") ?? "",
    blockers: Array.isArray(partial.blockers) ? [...partial.blockers] : [],
    deadline: (partial.deadline as DeadlineOption | "") ?? "",
    deadlineDetail: partial.deadlineDetail ?? "",
  };
}

function resumeTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get("token")?.trim();
    return t && t.length >= 16 ? t : null;
  } catch {
    return null;
  }
}

/**
 * Mint a per-session submission token (embedded in the diagnostic prompt so the
 * customer's AI can POST results back to /api/readiness/submit). Best-effort:
 * returns null when the edge is unreachable and the prompt renders without it.
 */
async function mintSubmissionToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/readiness/token", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: unknown };
    const t = typeof data.token === "string" ? data.token.trim() : "";
    return t || null;
  } catch (e) {
    console.error("Could not fetch readiness submission token", e);
    return null;
  }
}

type ConfirmState = {
  stack: string;
  size: string;
  findings: string[];
  parseStatus: string;
  pending: boolean;
  /** Structured stack technologies (grouped into badge chips on confirm). */
  stackEntries: StackEntry[];
  /** Today's free-text stack paragraph, kept to surface any unparsed remainder. */
  stackText: string;
  /** Structured size metrics rendered as stat tiles. */
  sizeMetrics: SizeMetric[];
  /** Coarse size classification for the one-line summary sentence. */
  sizeClassification: SizeClassification | null;
  /** Verbatim pasted text, shown by the raw fallback when nothing parses. */
  raw: string;
};

/**
 * Derive the structured stack/size fields for the confirm screen from an
 * already-parsed report. Pure display shaping — reuses the validation layer's
 * structured view rather than re-parsing the raw paste.
 */
function structuredConfirmFields(
  report: Parameters<typeof structuredReadinessFromReport>[0],
  raw = "",
): Pick<ConfirmState, "stackEntries" | "stackText" | "sizeMetrics" | "sizeClassification"> {
  const structured = structuredReadinessFromReport(report, raw);
  return {
    stackEntries: structured.stack,
    stackText: structured.stackText,
    sizeMetrics: structured.size.metrics,
    sizeClassification: structured.size.classification,
  };
}

export function ReadinessFlow() {
  const c = readinessContent;
  const [view, setView] = useState<View>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [submissionToken, setSubmissionToken] = useState<string | null>(null);
  const [stage1, setStage1] = useState<ReadinessStage1Answers>(EMPTY_STAGE1);
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [emailFeedback, setEmailFeedback] = useState("");

  // Stage 3 paste-back
  const [pasteText, setPasteText] = useState("");
  const [secretLines, setSecretLines] = useState<number[]>([]);
  const [secretMessage, setSecretMessage] = useState("");
  const [pasteSubmitting, setPasteSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Ingest watch: waiting on the customer's AI to POST results back.
  const [submissionExpired, setSubmissionExpired] = useState(false);
  /** received_at of the ingest record already rendered (consume-once). */
  const ingestedRef = useRef<string | null>(null);

  const step: Stage1Step = STAGE1_STEPS[stepIndex] ?? "productDescription";

  const buildLocal = useCallback(
    (
      nextStage1: ReadinessStage1Answers,
      stage: string,
      sessionToken: string | null,
      extra?: Partial<ReadinessLocalState>,
    ): ReadinessLocalState => ({
      token: sessionToken,
      stage,
      stage1: nextStage1,
      email: email || undefined,
      pasteText: extra?.pasteText ?? pasteText,
      updatedAt: new Date().toISOString(),
      ...extra,
    }),
    [email, pasteText],
  );

  const persist = useCallback(
    async (
      nextStage1: ReadinessStage1Answers,
      stage: string,
      extraDraft?: Record<string, unknown>,
      sessionToken?: string | null,
      localExtra?: Partial<ReadinessLocalState>,
    ) => {
      const t = sessionToken ?? token;
      const draft = draftFromStage1(nextStage1, {
        email: email || undefined,
        pasteText: (localExtra?.pasteText ?? pasteText) || undefined,
        // Draft PATCHes replace the whole draft (see api/_lib/readiness.ts
        // patchSessionRow), so the submission token must be re-included on
        // every persist or a later write would silently drop it and break
        // resume-after-reload while waiting on the AI's POST.
        submissionToken: submissionToken || undefined,
        ...extraDraft,
      });
      const local = buildLocal(nextStage1, stage, t, localExtra);
      saveReadinessLocal(local);
      if (!t) return;
      try {
        await patchReadinessSession(t, { stage, draft });
      } catch {
        // Local persist still works; server retry on next action.
      }
    },
    [token, email, pasteText, submissionToken, buildLocal],
  );

  // Bootstrap: resume from ?token= or localStorage, else create session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fromUrl = resumeTokenFromUrl();
        const local = loadReadinessLocal();
        let sessionToken = fromUrl || local?.token || null;
        let restoredStage1 = mergeStage1(local?.stage1 ?? {});
        let restoredStage = local?.stage || "intake";
        let restoredEmail = local?.email || "";
        let restoredPaste = local?.pasteText || "";
        const didResume = Boolean(fromUrl || local?.token);
        // Tracks whether we had to mint a fresh submission token this load (vs.
        // reusing one already embedded in a previously generated prompt) so a
        // resumed stage2 view can backfill it into the draft before the user
        // does anything else — otherwise a second reload would mint yet
        // another token and orphan any results already posted under this one.
        let submissionTokenPromise: Promise<string | null> = Promise.resolve(null);
        let mintedFreshSubmissionToken = false;

        if (sessionToken) {
          try {
            const remote = await getReadinessSession(sessionToken);
            if (cancelled) return;
            sessionToken = remote.token;
            restoredStage = remote.stage || restoredStage;
            restoredStage1 = mergeStage1({
              ...restoredStage1,
              ...stage1FromDraft(remote.draft || {}),
            });
            if (typeof remote.draft?.email === "string") {
              restoredEmail = remote.draft.email;
            }
            const remotePaste = pasteTextFromDraft(remote.draft || {});
            if (remotePaste) restoredPaste = remotePaste;
            if (didResume) {
              trackAnalytics("session_resumed", { stage: restoredStage });
            }

            // Reuse the submission token already embedded in a previously
            // generated prompt (persisted to the draft) instead of minting a
            // fresh one on every reload — a re-mint would silently orphan any
            // results the customer's AI already posted under the old token,
            // breaking auto-display on refresh.
            const remoteSubmissionToken =
              typeof remote.draft?.submissionToken === "string"
                ? remote.draft.submissionToken.trim()
                : "";
            if (remoteSubmissionToken) {
              setSubmissionToken(remoteSubmissionToken);
              submissionTokenPromise = Promise.resolve(remoteSubmissionToken);
            } else {
              mintedFreshSubmissionToken = true;
              submissionTokenPromise = mintSubmissionToken();
              void submissionTokenPromise.then((t) => {
                if (!cancelled && t) setSubmissionToken(t);
              });
            }

            const off = remote.draft?.offRamp as { kind?: string } | undefined;
            if (off?.kind === "not_built_yet" || isNotBuiltYet(restoredStage1.builtWith)) {
              setToken(sessionToken);
              setStage1(restoredStage1);
              setEmail(restoredEmail);
              setPasteText(restoredPaste);
              trackAnalytics("off_ramp_hit", { reason: "not_built_yet" });
              setView("off_ramp_not_built");
              return;
            }

            // Already scored — open shareable snapshot when we have an id.
            if (
              restoredStage === "scored" &&
              typeof remote.draft?.submissionId === "string" &&
              remote.draft.submissionId
            ) {
              window.location.assign(
                `/readiness/snapshot?id=${encodeURIComponent(String(remote.draft.submissionId))}`,
              );
              return;
            }

            // Resume stage 3 / confirm / gate from server stage or draft.
            if (
              restoredStage === "paste" ||
              restoredStage === "stage3" ||
              restoredStage === "confirm" ||
              restoredStage === "gate" ||
              remote.draft?.parseStatus
            ) {
              setToken(sessionToken);
              setStage1(restoredStage1);
              setEmail(restoredEmail);
              setPasteText(restoredPaste);
              saveReadinessLocal({
                token: sessionToken,
                stage: restoredStage,
                stage1: restoredStage1,
                email: restoredEmail || undefined,
                pasteText: restoredPaste,
                updatedAt: new Date().toISOString(),
              });
              if (restoredStage === "gate") {
                setView("gate");
                return;
              }
              if (restoredStage === "confirm" || remote.draft?.report) {
                const report =
                  remote.draft?.report &&
                  typeof remote.draft.report === "object" &&
                  !Array.isArray(remote.draft.report)
                    ? (remote.draft.report as Parameters<typeof describeStack>[0])
                    : parseReadinessPastePartial(restoredPaste);
                const findings = buildConfirmationFindings(report, 6);
                setConfirm({
                  stack: describeStack(report),
                  size: describeSize(report),
                  findings,
                  parseStatus: String(remote.draft?.parseStatus || "partial"),
                  pending: remote.draft?.parseStatus === "pending" || findings.length === 0,
                  raw: restoredPaste,
                  ...structuredConfirmFields(report, restoredPaste),
                });
                setView("confirm");
                return;
              }
              setView("stage3");
              return;
            }
          } catch {
            // Stale token — create fresh.
            sessionToken = null;
          }
        }

        if (!sessionToken) {
          const created = await createReadinessSession({
            stage: "intake",
            draft: draftFromStage1(restoredStage1, {
              pasteText: restoredPaste || undefined,
            }),
          });
          if (cancelled) return;
          sessionToken = created.token;
          // Brand-new (or previously-stale) session: no submission token could
          // have been persisted yet, so mint one now. Once the user completes
          // stage 1, goNext()'s persist() call embeds it in the draft.
          mintedFreshSubmissionToken = true;
          submissionTokenPromise = mintSubmissionToken();
          void submissionTokenPromise.then((t) => {
            if (!cancelled && t) setSubmissionToken(t);
          });
        }

        if (cancelled) return;
        setToken(sessionToken);
        setStage1(restoredStage1);
        setEmail(restoredEmail);
        setPasteText(restoredPaste);
        saveReadinessLocal({
          token: sessionToken,
          stage: restoredStage,
          stage1: restoredStage1,
          email: restoredEmail || undefined,
          pasteText: restoredPaste,
          updatedAt: new Date().toISOString(),
        });

        // Resume stage 2 if intake complete.
        if (
          restoredStage === "prompt" ||
          restoredStage === "stage2" ||
          (restoredStage1.productDescription &&
            restoredStage1.whoUses &&
            restoredStage1.builtWith &&
            restoredStage1.blockers?.length &&
            restoredStage1.deadline &&
            !isNotBuiltYet(restoredStage1.builtWith) &&
            !isFeaturesOnlySoftOffRamp(restoredStage1.blockers ?? []))
        ) {
          if (
            restoredStage1.builtWith &&
            !isNotBuiltYet(restoredStage1.builtWith) &&
            restoredStage1.productDescription &&
            restoredStage1.whoUses &&
            restoredStage1.deadline
          ) {
            if (
              isFeaturesOnlySoftOffRamp(restoredStage1.blockers ?? []) &&
              restoredStage !== "prompt" &&
              restoredStage !== "stage2" &&
              restoredStage !== "paste" &&
              restoredStage !== "stage3"
            ) {
              trackAnalytics("off_ramp_hit", { reason: "features_only" });
              setView("off_ramp_features");
              return;
            }
            trackAnalytics("stage_started", { stage: "stage2" });
            // Resumed straight into the waiting screen with a token minted
            // this load (none was persisted yet) — backfill it into the
            // draft now so a subsequent reload reuses it instead of minting
            // another and orphaning any results already posted under this one.
            if (mintedFreshSubmissionToken && sessionToken) {
              const resolvedSubmissionToken = await submissionTokenPromise;
              if (!cancelled && resolvedSubmissionToken) {
                void patchReadinessSession(sessionToken, {
                  stage: restoredStage || "prompt",
                  draft: draftFromStage1(restoredStage1, {
                    email: restoredEmail || undefined,
                    pasteText: restoredPaste || undefined,
                    submissionToken: resolvedSubmissionToken,
                  }),
                }).catch(() => {
                  /* best-effort backfill; next persist() retries */
                });
              }
            }
            setView("stage2");
            return;
          }
        }
        trackAnalytics("stage_started", { stage: "stage1" });
        setView("stage1");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
        setView("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const promptBundle = useMemo(() => {
    if (!stage1.builtWith || isNotBuiltYet(stage1.builtWith)) return null;
    return buildDiagnosticPrompt({
      answers: stage1,
      submissionToken: submissionToken ?? undefined,
    });
  }, [stage1, submissionToken]);

  const howTo = useMemo(() => {
    if (!stage1.builtWith) return null;
    return buildPromptHowTo(stage1.builtWith);
  }, [stage1.builtWith]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case "productDescription":
        return stage1.productDescription.trim().length > 0;
      case "whoUses":
        return Boolean(stage1.whoUses);
      case "builtWith":
        return Boolean(stage1.builtWith);
      case "blockers":
        return stage1.blockers.length >= 1 && stage1.blockers.length <= MAX_BLOCKERS;
      case "deadline":
        return Boolean(stage1.deadline);
      default:
        return false;
    }
  }, [step, stage1]);

  /** Answer-specific callout for the active stage-1 step (honest echo only). */
  const stage1Callout: AnswerCalloutPayload | null = useMemo(() => {
    switch (step) {
      case "productDescription":
        return calloutForProductDescription(stage1.productDescription);
      case "whoUses":
        return stage1.whoUses ? calloutForWhoUses(stage1.whoUses) : null;
      case "builtWith":
        return stage1.builtWith && !isNotBuiltYet(stage1.builtWith)
          ? calloutForBuiltWith(stage1.builtWith)
          : null;
      case "blockers":
        return calloutForBlockers(stage1.blockers);
      case "deadline":
        return stage1.deadline ? calloutForDeadline(stage1.deadline, stage1.deadlineDetail) : null;
      default:
        return null;
    }
  }, [step, stage1]);

  const onSelectBuiltWith = async (value: BuiltWithOption) => {
    const next = { ...stage1, builtWith: value };
    setStage1(next);
    if (isNotBuiltYet(value)) {
      await persist(next, "off_ramp_not_built", {
        offRamp: { kind: "not_built_yet", loggedAt: new Date().toISOString() },
      });
      try {
        await logReadinessLead({
          token,
          reason: "not_built_yet",
          answers: next,
        });
      } catch {
        // still show off-ramp
      }
      trackAnalytics("off_ramp_hit", { reason: "not_built_yet" });
      setView("off_ramp_not_built");
      return;
    }
    await persist(next, "intake");
  };

  const toggleBlocker = async (option: BlockerOption) => {
    const has = stage1.blockers.includes(option);
    let blockers: BlockerOption[];
    if (has) {
      blockers = stage1.blockers.filter((b) => b !== option);
    } else {
      if (stage1.blockers.length >= MAX_BLOCKERS) return;
      blockers = [...stage1.blockers, option];
    }
    const next = { ...stage1, blockers };
    setStage1(next);
    await persist(next, "intake");
  };

  const goNext = async () => {
    if (!canAdvance) return;

    if (step === "blockers" && isFeaturesOnlySoftOffRamp(stage1.blockers)) {
      await persist(stage1, "off_ramp_features", {
        offRamp: { kind: "features_only", loggedAt: new Date().toISOString() },
      });
      try {
        await logReadinessLead({
          token,
          reason: "features_only",
          answers: stage1,
        });
      } catch {
        // still show off-ramp
      }
      trackAnalytics("off_ramp_hit", { reason: "features_only" });
      setView("off_ramp_features");
      return;
    }

    if (stepIndex < STAGE1_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      await persist(stage1, "intake");
      return;
    }

    // Complete stage 1 → stage 2
    trackAnalytics("stage_completed", { stage: "stage1" });
    await persist(stage1, "prompt");
    trackAnalytics("stage_started", { stage: "stage2" });
    setView("stage2");
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const onCopy = async () => {
    if (!promptBundle?.prompt) return;
    try {
      await navigator.clipboard.writeText(promptBundle.prompt);
      setCopied(true);
      trackAnalytics("prompt_copied", { variant: promptBundle.variant });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = promptBundle.prompt;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        trackAnalytics("prompt_copied", { variant: promptBundle.variant });
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        setCopied(false);
      }
    }
  };

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !promptBundle?.prompt || emailStatus === "sending") return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailStatus("error");
      setEmailFeedback("Enter a valid email address.");
      return;
    }
    setEmailStatus("sending");
    setEmailFeedback("");
    try {
      await emailReadinessPrompt({
        email: trimmed,
        token,
        prompt: promptBundle.prompt,
      });
      setEmailStatus("success");
      setEmailFeedback(c.stage2.emailSuccess);
      trackAnalytics("prompt_emailed", { ok: true });
      await persist(stage1, "prompt", { email: trimmed });
    } catch {
      setEmailStatus("error");
      setEmailFeedback(c.stage2.emailError);
    }
  };

  const goToStage3 = async () => {
    setSecretLines([]);
    setSecretMessage("");
    trackAnalytics("stage_completed", { stage: "stage2" });
    await persist(stage1, "paste", { pasteText });
    trackAnalytics("stage_started", { stage: "stage3" });
    setView("stage3");
  };

  const onPasteChange = (value: string) => {
    setPasteText(value);
    // Clear secret highlight while editing
    if (secretLines.length) {
      setSecretLines([]);
      setSecretMessage("");
    }
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
    pasteDebounceRef.current = setTimeout(() => {
      const local = buildLocal(stage1, "paste", token, { pasteText: value });
      saveReadinessLocal(local);
      if (token) {
        void patchReadinessSession(token, {
          stage: "paste",
          draft: draftFromStage1(stage1, {
            email: email || undefined,
            pasteText: value,
          }),
        }).catch(() => {
          /* local only */
        });
      }
    }, 600);
  };

  /**
   * Parse results text and render the confirm analysis. Shared by the manual
   * paste path and the automatic ingest path so the SAME payload renders the
   * SAME analysis either way. Never call with text that failed the secret scan.
   */
  const runParseAndConfirm = async (text: string) => {
    // Client partial for graceful pending if endpoint is not live.
    const clientPartial = parseReadinessPastePartial(text);
    const clientFindings = buildConfirmationFindings(clientPartial, 6);
    const clientConfirm: ConfirmState = {
      stack: describeStack(clientPartial),
      size: describeSize(clientPartial),
      findings: clientFindings,
      parseStatus: clientFindings.length > 0 ? "partial" : "pending",
      pending: true,
      raw: text,
      ...structuredConfirmFields(clientPartial, text),
    };

    // Persist draft (paste text) without waiting for parse — still no secrets.
    saveReadinessLocal(buildLocal(stage1, "paste", token, { pasteText: text }));

    if (!token) {
      setConfirm(clientConfirm);
      setView("confirm");
      return;
    }

    try {
      const result: ParseResponse = await parseReadinessPaste({ token, paste: text });
      const findings =
        result.findings.length > 0
          ? result.findings.slice(0, 6)
          : clientFindings.length > 0
            ? clientFindings
            : [];
      // Ensure 4–6 findings when we have data; pad from client if needed.
      let merged = findings;
      if (merged.length < 4 && clientFindings.length > merged.length) {
        const seen = new Set(merged);
        for (const f of clientFindings) {
          if (merged.length >= 6) break;
          if (!seen.has(f)) {
            merged = [...merged, f];
            seen.add(f);
          }
        }
      }
      if (result.parseStatus === "ok") {
        trackAnalytics("parse_success", { parseStatus: result.parseStatus });
      } else if (result.parseStatus === "partial" || result.parseStatus === "pending") {
        trackAnalytics("parse_normalized", { parseStatus: result.parseStatus });
      } else {
        trackAnalytics("parse_failed", { parseStatus: result.parseStatus });
      }
      trackAnalytics("stage_completed", { stage: "stage3" });
      const structuredReport =
        result.report && typeof result.report === "object" && !Array.isArray(result.report)
          ? (result.report as Parameters<typeof structuredReadinessFromReport>[0])
          : clientPartial;
      setConfirm({
        stack: result.stack || clientConfirm.stack,
        size: result.size || clientConfirm.size,
        findings: merged.slice(0, 6),
        parseStatus: result.parseStatus,
        pending: result.parseStatus === "pending" || merged.length === 0,
        raw: text,
        ...structuredConfirmFields(structuredReport, text),
      });
      trackAnalytics("stage_started", { stage: "confirm" });
      setView("confirm");
    } catch (err) {
      const e = err as Error & { code?: string; lines?: number[] };
      if (e.code === "SECRETS_DETECTED") {
        setSecretLines(Array.isArray(e.lines) ? e.lines : []);
        setSecretMessage(PASTE_SECRETS_BLOCK_MESSAGE);
        trackAnalytics("secret_scan_blocked", { hitCount: e.lines?.length ?? 0, source: "server" });
        return;
      }
      trackAnalytics("parse_failed", { code: e.code || "network" });
      // Graceful pending: show client-side confirmation.
      setConfirm(clientConfirm);
      trackAnalytics("stage_started", { stage: "confirm" });
      setView("confirm");
      // Still save draft on session without re-sending paste if possible
      try {
        await patchReadinessSession(token, {
          stage: "confirm",
          draft: draftFromStage1(stage1, {
            email: email || undefined,
            pasteText: text,
            source: "paste",
            parseStatus: "pending",
            report: clientPartial as Record<string, unknown>,
          }),
        });
      } catch {
        /* ignore */
      }
    }
  };

  // Live ref so the ingest poll loop below always calls the latest closure
  // without restarting its interval on every render.
  const runParseAndConfirmRef = useRef(runParseAndConfirm);
  useEffect(() => {
    runParseAndConfirmRef.current = runParseAndConfirm;
  });

  /**
   * Watch for the customer's AI POSTing results back (ingest). While the prompt
   * screen is up with a live submission token, poll the status endpoint on an
   * interval; landed results render through the same analysis path as a manual
   * paste (no reload), and an expired/unknown token stops the wait so the page
   * can offer a start-over.
   */
  useEffect(() => {
    if (view !== "stage2" || !submissionToken || submissionExpired) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      const status = await getReadinessSubmissionStatus(submissionToken);
      if (cancelled) return;
      switch (status.kind) {
        case "pending":
          schedule(INGEST_POLL_INTERVAL_MS);
          return;
        case "rate_limited":
          schedule(Math.max(INGEST_POLL_INTERVAL_MS, status.retryAfterSeconds * 1000));
          return;
        case "unavailable":
          // Transient network/5xx — keep waiting, back off a little.
          schedule(INGEST_POLL_INTERVAL_MS * 2);
          return;
        case "expired":
          trackAnalytics("ingest_expired", {});
          setSubmissionExpired(true);
          return;
        case "ready": {
          // Consume-once: never re-render the same landed record twice.
          if (status.receivedAt && ingestedRef.current === status.receivedAt) {
            schedule(INGEST_POLL_INTERVAL_MS);
            return;
          }
          const text =
            status.resultsText.trim() ||
            (status.results ? JSON.stringify(status.results, null, 2) : "");
          if (!text) {
            schedule(INGEST_POLL_INTERVAL_MS);
            return;
          }
          ingestedRef.current = status.receivedAt ?? `ready-${Date.now()}`;
          trackAnalytics("ingest_landed", { source: "api" });
          setPasteText(text);
          await runParseAndConfirmRef.current(text);
          return;
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [view, submissionToken, submissionExpired]);

  /**
   * Client-side secret scan MUST run before any network send of paste contents.
   * On hit: block submit, highlight lines, show fixed message — no fetch.
   */
  const onPasteSubmit = async () => {
    if (pasteSubmitting) return;
    // Flush/cancel paste debounce so it cannot overwrite the parse result.
    if (pasteDebounceRef.current) {
      clearTimeout(pasteDebounceRef.current);
      pasteDebounceRef.current = null;
    }
    trackAnalytics("paste_attempted", { lengthBucket: pasteText.length > 2000 ? "long" : "short" });
    const scan = scanPasteForSecrets(pasteText);
    if (!scan.clean) {
      setSecretLines(scan.lines);
      setSecretMessage(PASTE_SECRETS_BLOCK_MESSAGE);
      trackAnalytics("secret_scan_blocked", {
        hitCount: scan.hits.length,
        kind: scan.hits[0]?.kind ?? "unknown",
      });
      // Still persist redacted draft server-side (server re-redacts) so retrieval
      // never returns the planted secret; client never sends unredacted via parse.
      if (token) {
        void patchReadinessSession(token, {
          stage: "paste",
          draft: draftFromStage1(stage1, {
            email: email || undefined,
            pasteText,
          }),
        }).catch(() => {
          /* local only */
        });
      }
      // Do NOT send parse request with paste contents.
      return;
    }
    setSecretLines([]);
    setSecretMessage("");
    setPasteSubmitting(true);

    // Paste fallback → the SAME ingest endpoint (POST /api/readiness/submit)
    // with the SAME per-session submission token as the direct API path (the
    // token embedded in the diagnostic prompt), so a pasted delimited report
    // lands in the same stored submission record — no parallel store.
    // Best-effort: the interactive parse/confirm flow below must not depend on it.
    void (async () => {
      const ingestToken = submissionToken ?? (await mintSubmissionToken());
      if (!ingestToken) return;
      if (!submissionToken) setSubmissionToken(ingestToken);
      try {
        await submitReadinessResults({ submissionToken: ingestToken, resultsText: pasteText });
      } catch {
        // Ingest submit is best-effort; the parse flow below still captures the paste.
      }
    })();

    try {
      await runParseAndConfirm(pasteText);
    } finally {
      setPasteSubmitting(false);
    }
  };

  const onLooksRight = async () => {
    trackAnalytics("stage_completed", { stage: "confirm" });
    // Cancel any pending paste-debounce PATCH so it cannot race after confirm.
    if (pasteDebounceRef.current) {
      clearTimeout(pasteDebounceRef.current);
      pasteDebounceRef.current = null;
    }
    // Re-attach a client-side partial report so scoring still has evidence even
    // if a prior partial PATCH dropped the server parse payload (server also
    // merges drafts and re-parses pasteText as a fallback).
    const clientPartial = pasteText ? parseReadinessPastePartial(pasteText) : {};
    await persist(stage1, "confirm", {
      pasteText,
      source: "paste",
      parseStatus: confirm?.parseStatus || "ok",
      confirmedAt: new Date().toISOString(),
      ...(Object.keys(clientPartial).length > 0
        ? { report: clientPartial as Record<string, unknown> }
        : {}),
    });
    setConfirm((prev) =>
      prev ? { ...prev, pending: false, parseStatus: prev.parseStatus || "ok" } : prev,
    );
    // Stage 5: gate scored results (name/email/consent + Turnstile) before scores.
    trackAnalytics("stage_started", { stage: "gate" });
    setView("gate");
  };

  const onScored = (result: ScoreResponse) => {
    trackAnalytics("gate_completed", { ok: true });
    if (result.bucket) {
      trackAnalytics("bucket_assigned", { bucket: result.bucket });
    }
    trackAnalytics("stage_completed", { stage: "gate" });
    const path =
      result.snapshotPath || `/readiness/snapshot?id=${encodeURIComponent(result.snapshotId)}`;
    if (typeof window !== "undefined") {
      window.location.assign(path);
    }
  };

  const onSomethingOff = () => {
    setConfirm(null);
    setView("stage3");
  };

  /** Expired/unknown submission token: reset to the top of the readiness flow. */
  const onStartOver = async () => {
    trackAnalytics("start_over", { from: "ingest_expired" });
    ingestedRef.current = null;
    setSubmissionExpired(false);
    setSubmissionToken(null);
    setStage1(EMPTY_STAGE1);
    setStepIndex(0);
    setPasteText("");
    setConfirm(null);
    setSecretLines([]);
    setSecretMessage("");
    saveReadinessLocal({
      token,
      stage: "intake",
      stage1: EMPTY_STAGE1,
      email: email || undefined,
      updatedAt: new Date().toISOString(),
    });
    if (token) {
      void patchReadinessSession(token, {
        stage: "intake",
        draft: draftFromStage1(EMPTY_STAGE1),
      }).catch(() => {
        /* local reset still applies */
      });
    }
    // Mint a fresh submission token so the next generated prompt has a live link.
    void mintSubmissionToken().then((t) => {
      if (t) setSubmissionToken(t);
    });
    setView("stage1");
  };

  // Highlight helper: line numbers for secret scan overlay
  const pasteLines = useMemo(() => pasteText.replace(/\r\n/g, "\n").split("\n"), [pasteText]);

  if (view === "loading") {
    return (
      <div className="readiness-step-panel mt-8" aria-busy="true" data-testid="readiness-loading">
        <p className="text-sm text-muted">Loading your readiness check…</p>
      </div>
    );
  }

  if (view === "error") {
    return (
      <div
        className="readiness-step-panel mt-8 border-red/30"
        role="alert"
        data-testid="readiness-error"
      >
        <p className="font-semibold text-ink">We could not start the check.</p>
        <p className="mt-2 text-sm text-muted">{errorMessage}</p>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (view === "off_ramp_not_built") {
    return (
      <div className="readiness-assessment mt-8" data-testid="readiness-off-ramp-not-built">
        <AssessmentProgress
          current={Math.min(stepIndex + 1, FLOW_TOTAL_STEPS)}
          total={FLOW_TOTAL_STEPS}
          label="Path check"
        />
        <div className="readiness-step-panel mt-4">
          <h2 className="font-display text-2xl font-bold text-ink">{c.offRampNotBuilt.title}</h2>
          <p className="mt-4 text-ink-soft">{c.offRampNotBuilt.body}</p>
          <Link href="/" className="btn-primary mt-6 inline-flex">
            {c.offRampNotBuilt.cta}
          </Link>
        </div>
      </div>
    );
  }

  if (view === "off_ramp_features") {
    return (
      <div className="readiness-assessment mt-8" data-testid="readiness-off-ramp-features">
        <AssessmentProgress
          current={Math.min(stepIndex + 1, FLOW_TOTAL_STEPS)}
          total={FLOW_TOTAL_STEPS}
          label="Path check"
        />
        <div className="readiness-step-panel mt-4">
          <h2 className="font-display text-2xl font-bold text-ink">{c.offRampFeatures.title}</h2>
          <p className="mt-4 text-ink-soft">{c.offRampFeatures.body}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="btn-primary"
              data-testid="readiness-features-continue"
              onClick={() => {
                setStepIndex(STAGE1_STEPS.indexOf("blockers"));
                setView("stage1");
              }}
            >
              {c.offRampFeatures.continueAnyway}
            </button>
            <Link href="/" className="btn-secondary">
              {c.offRampFeatures.stop}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (view === "gate") {
    return (
      <ScoreGateForm
        token={token || ""}
        initialEmail={email}
        source="paste"
        onScored={onScored}
        progressCurrent={FLOW_STEP_GATE}
        progressTotal={FLOW_TOTAL_STEPS}
      />
    );
  }

  if (view === "confirm" && confirm) {
    // Force the verbatim raw fallback when the paste is syntactically malformed
    // structured input (e.g. truncated JSON): never scrape stray tech substrings
    // out of broken JSON into a misleading partial STACK. Also show it when
    // nothing structured parsed at all but we still have raw text to display.
    const rawText = confirm.raw.trim();
    const showRawFallback =
      rawText.length > 0 &&
      (isMalformedStructuredPaste(confirm.raw) ||
        (confirm.stackEntries.length === 0 &&
          confirm.sizeMetrics.length === 0 &&
          confirm.findings.length === 0));
    const confirmCallout: AnswerCalloutPayload | null =
      !showRawFallback && confirm.stack
        ? {
            id: "confirm-stack",
            text: `Got it — stack noted as ${confirm.stack}${confirm.size ? `; size: ${confirm.size}` : ""}.`,
          }
        : null;
    return (
      <div className="readiness-assessment mt-8" data-testid="readiness-confirm">
        <AssessmentProgress
          current={FLOW_STEP_CONFIRM}
          total={FLOW_TOTAL_STEPS}
          label="Confirm findings"
        />
        <p className="eyebrow mt-4">{c.stage3.progressLabel}</p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {confirm.pending ? c.confirm.pendingTitle : c.confirm.title}
        </h2>
        {confirm.pending ? (
          <p className="mt-3 text-sm text-muted" data-testid="readiness-confirm-pending">
            {c.confirm.pendingBody}
          </p>
        ) : null}

        {showRawFallback ? (
          <div className="readiness-step-panel mt-6" data-testid="readiness-confirm-raw-fallback">
            <p className="eyebrow">Pasted input</p>
            <p className="mt-2 text-sm text-muted">
              We couldn&apos;t read a structured result from this paste. Here&apos;s exactly what
              you pasted — re-paste your Readiness Check output, or continue.
            </p>
            <pre
              data-testid="readiness-confirm-raw-text"
              className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-canvas px-3.5 py-3 text-sm text-ink-soft"
            >
              {confirm.raw}
            </pre>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <ConfirmStackCard
                label={c.confirm.stackLabel}
                entries={confirm.stackEntries}
                stackText={confirm.stackText || confirm.stack}
              />
              <ConfirmSizeCard
                label={c.confirm.sizeLabel}
                metrics={confirm.sizeMetrics}
                classification={confirm.sizeClassification}
              />
            </div>

            <FindingsList
              label={c.confirm.findingsLabel}
              findings={confirm.findings}
              emptyText="Findings will appear once parsing completes. You can re-paste or continue."
            />
          </>
        )}

        <AnswerCallout callout={confirmCallout} />

        <div className="mt-8 flex flex-col items-start gap-4">
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => void onLooksRight()}
            data-testid="readiness-confirm-looks-right"
          >
            {c.confirm.looksRight}
          </button>
          <button
            type="button"
            className="text-sm font-semibold text-purple underline underline-offset-2 hover:text-purple-dark"
            onClick={onSomethingOff}
            data-testid="readiness-confirm-something-off"
          >
            {c.confirm.looksWrong}
          </button>
        </div>
      </div>
    );
  }

  const stage3PasteCallout: AnswerCalloutPayload | null =
    pasteText.trim().length >= 8
      ? {
          id: "paste-received",
          text: `Got it — received your diagnostic paste (${pasteText.trim().length.toLocaleString()} characters).`,
        }
      : null;

  /** Stage 3 paste-back panel — always mounted so the page/DOM always contains the large textarea. */
  const stage3Panel = (
    <div
      className={view === "stage3" ? "readiness-assessment mt-8" : "sr-only"}
      data-testid="readiness-stage3"
      aria-hidden={view === "stage3" ? undefined : true}
    >
      {view === "stage3" ? (
        <AssessmentProgress
          current={FLOW_STEP_STAGE3}
          total={FLOW_TOTAL_STEPS}
          label="Paste results"
        />
      ) : null}
      <p className={`eyebrow ${view === "stage3" ? "mt-4" : ""}`}>{c.stage3.progressLabel}</p>
      <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {c.stage3.title}
      </h2>
      <p className="mt-3 text-base text-muted">{c.stage3.body}</p>

      <div className="readiness-step-panel mt-6">
        <label htmlFor="readiness-paste" className="text-sm font-medium text-ink-soft">
          {c.stage3.textareaLabel}
        </label>
        <textarea
          id="readiness-paste"
          ref={pasteTextareaRef}
          name="paste"
          rows={16}
          value={pasteText}
          onChange={(ev) => onPasteChange(ev.target.value)}
          placeholder={c.stage3.textareaPlaceholder}
          className="mt-2 w-full rounded-xl border border-border bg-canvas px-3 py-3 font-mono text-xs leading-relaxed text-ink sm:text-sm"
          data-testid="readiness-paste-textarea"
          spellCheck={false}
          autoComplete="off"
          tabIndex={view === "stage3" ? 0 : -1}
        />
        <p className="mt-3 text-sm text-muted" data-testid="readiness-paste-helper">
          {c.stage3.noSendHelper}
        </p>
        {view === "stage3" ? <AnswerCallout callout={stage3PasteCallout} /> : null}
      </div>

      {secretLines.length > 0 && view === "stage3" ? (
        <div
          className="mt-3 rounded-xl border border-red/40 bg-red/5 p-3"
          role="alert"
          data-testid="readiness-secrets-block"
        >
          <p className="text-sm font-semibold text-red" data-testid="readiness-secrets-message">
            {secretMessage || PASTE_SECRETS_BLOCK_MESSAGE}
          </p>
          <p className="mt-1 text-xs text-muted">
            Flagged line{secretLines.length === 1 ? "" : "s"}: {secretLines.join(", ")}
          </p>
          <div
            className="mt-3 max-h-48 overflow-auto rounded-lg border border-border bg-trust p-2 font-mono text-xs text-white/90"
            data-testid="readiness-secrets-highlight"
            aria-label="Highlighted lines with secrets"
          >
            {pasteLines.map((line, idx) => {
              const lineNo = idx + 1;
              const hit = secretLines.includes(lineNo);
              return (
                <div
                  key={lineNo}
                  className={hit ? "rounded bg-red/40 px-1 text-white" : "px-1 text-white/70"}
                  data-secret-line={hit ? "true" : "false"}
                  data-line={lineNo}
                >
                  <span className="mr-2 inline-block w-8 text-right text-white/40">{lineNo}</span>
                  {line || " "}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "stage3" ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setView("stage2")}
            data-testid="readiness-paste-back"
          >
            {c.stage3.back}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pasteSubmitting || pasteText.trim().length < 8}
            onClick={() => void onPasteSubmit()}
            data-testid="readiness-paste-submit"
          >
            {pasteSubmitting ? c.stage3.submitting : c.stage3.submit}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (view === "stage3") {
    return stage3Panel;
  }

  if (view === "stage2" && promptBundle && howTo) {
    const stage2Callout: AnswerCalloutPayload = {
      id: "stage2-tool",
      text: `Got it — prompt ready for ${howTo.toolName}${stage1.productDescription.trim() ? ` · noted “${stage1.productDescription.trim().slice(0, 80)}${stage1.productDescription.trim().length > 80 ? "…" : ""}”` : ""}.`,
    };
    return (
      <div
        className="readiness-assessment mt-8"
        data-testid="readiness-stage2"
        data-variant={promptBundle.variant}
      >
        <AssessmentProgress
          current={FLOW_STEP_STAGE2}
          total={FLOW_TOTAL_STEPS}
          label="Diagnostic prompt"
        />
        <p className="eyebrow mt-4">{c.stage2.progressLabel}</p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {c.stage2.title}
        </h2>

        <AnswerCallout callout={stage2Callout} />

        <div className="readiness-step-panel mt-6">
          <h3 className="font-display text-lg font-semibold text-ink">{c.stage2.howToTitle}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            {howTo.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p
            className="mt-4 rounded-lg border border-green/25 bg-green/5 px-3 py-2 text-sm text-ink-soft"
            data-testid="readiness-reassurance"
          >
            {READINESS_PROMPT_REASSURANCE}
          </p>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink-soft">
              Prompt for <span className="font-semibold text-ink">{howTo.toolName}</span>
              {promptBundle.variant === "A" ? " (Variant A)" : " (Variant B)"}
            </p>
            <button
              type="button"
              className={copied ? "btn-secondary" : "btn-primary"}
              onClick={onCopy}
              data-testid="readiness-copy"
              data-copied={copied ? "true" : "false"}
              aria-live="polite"
            >
              {copied ? c.stage2.copied : c.stage2.copy}
            </button>
          </div>
          <pre
            className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-border bg-trust p-4 text-left font-mono text-xs leading-relaxed text-white/90 sm:text-sm"
            data-testid="readiness-prompt-block"
            tabIndex={0}
          >
            {promptBundle.prompt}
          </pre>
        </div>

        {submissionToken ? (
          <div
            className="readiness-step-panel mt-6"
            data-testid="readiness-waiting"
            aria-live="polite"
          >
            {submissionExpired ? (
              <div data-testid="readiness-waiting-expired">
                <h3 className="font-display text-lg font-semibold text-ink">
                  {c.waiting.expiredTitle}
                </h3>
                <p className="mt-1 text-sm text-muted">{c.waiting.expiredBody}</p>
                <button
                  type="button"
                  className="btn-primary mt-4"
                  onClick={() => void onStartOver()}
                  data-testid="readiness-start-over"
                >
                  {c.waiting.startOver}
                </button>
              </div>
            ) : (
              <div>
                <p
                  className="text-sm font-medium text-ink"
                  data-testid="readiness-waiting-status"
                  role="status"
                >
                  {c.waiting.status}
                </p>
                <p className="mt-1 text-sm text-muted">{c.waiting.helper}</p>
              </div>
            )}
          </div>
        ) : null}

        <div className="readiness-step-panel mt-6" data-testid="readiness-email-panel">
          <h3 className="font-display text-lg font-semibold text-ink">{c.stage2.emailMe}</h3>
          <p className="mt-1 text-sm text-muted">{c.stage2.resumeHint}</p>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={onEmailSubmit}>
            <label className="sr-only" htmlFor="readiness-email">
              Email
            </label>
            <input
              id="readiness-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder={c.stage2.emailPlaceholder}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="min-h-11 w-full flex-1 rounded-xl border border-border bg-canvas px-3 text-sm text-ink"
              data-testid="readiness-email-input"
            />
            <button
              type="submit"
              className="btn-secondary shrink-0"
              disabled={emailStatus === "sending"}
              data-testid="readiness-email-submit"
            >
              {emailStatus === "sending" ? c.stage2.emailSending : c.stage2.emailSubmit}
            </button>
          </form>
          {emailFeedback ? (
            <p
              className={`mt-3 text-sm ${emailStatus === "success" ? "text-green-dark" : "text-red"}`}
              role="status"
              data-testid="readiness-email-feedback"
              data-status={emailStatus}
            >
              {emailFeedback}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void goToStage3()}
            data-testid="readiness-go-paste"
          >
            {c.stage2.pasteResults}
          </button>
          <p className="text-sm">
            <Link
              href={
                token
                  ? `${c.stage2.cantRunHref}?token=${encodeURIComponent(token)}`
                  : c.stage2.cantRunHref
              }
              className="font-semibold text-purple hover:text-purple-dark"
              data-testid="readiness-cant-run"
              onClick={() => trackAnalytics("fallback_taken", { from: "stage2" })}
            >
              {c.stage2.cantRun}
            </Link>
          </p>
        </div>

        {stage3Panel}
      </div>
    );
  }

  // Stage 1
  const q = c.stage1.questions;
  const optionBase =
    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition-colors";
  const optionSelected = "border-purple bg-purple-soft/40";
  const optionIdle = "border-border bg-canvas hover:border-purple/40";
  const optionDisabled = "cursor-not-allowed border-border bg-canvas opacity-50";

  return (
    <div
      className="readiness-assessment mt-8"
      data-testid="readiness-stage1"
      data-step={step}
      data-visual-system="results-shared"
    >
      <AssessmentProgress current={stepIndex + 1} total={FLOW_TOTAL_STEPS} label="Intake" />
      <p className="eyebrow mt-4">
        {c.stage1.progressLabel} · {stepIndex + 1}/{STAGE1_STEPS.length}
      </p>

      <div className="readiness-step-panel mt-4" data-visual-system="results-shared">
        {step === "productDescription" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {q.productDescription.label}
            </legend>
            <p className="mt-2 text-sm text-muted">{q.productDescription.helper}</p>
            <textarea
              name="productDescription"
              rows={3}
              maxLength={PRODUCT_DESCRIPTION_MAX}
              value={stage1.productDescription}
              onChange={(ev) => {
                const productDescription = ev.target.value.slice(0, PRODUCT_DESCRIPTION_MAX);
                setStage1((s) => ({ ...s, productDescription }));
              }}
              onBlur={() => void persist(stage1, "intake")}
              placeholder={q.productDescription.placeholder}
              className="mt-4 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-ink"
              data-testid="readiness-q1"
            />
            <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
              {stage1.productDescription.length}/{PRODUCT_DESCRIPTION_MAX}
            </p>
          </fieldset>
        ) : null}

        {step === "whoUses" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {q.whoUses.label}
            </legend>
            <div
              className="mt-4 flex flex-col gap-2"
              role="radiogroup"
              aria-label={q.whoUses.label}
            >
              {WHO_USES_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`${optionBase} ${
                    stage1.whoUses === opt ? optionSelected : optionIdle
                  }`}
                >
                  <input
                    type="radio"
                    name="whoUses"
                    value={opt}
                    checked={stage1.whoUses === opt}
                    onChange={() => {
                      const next = { ...stage1, whoUses: opt };
                      setStage1(next);
                      void persist(next, "intake");
                    }}
                    className="mt-0.5"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === "builtWith" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {q.builtWith.label}
            </legend>
            <div
              className="mt-4 flex flex-col gap-2"
              role="radiogroup"
              aria-label={q.builtWith.label}
              data-testid="readiness-q3"
            >
              {BUILT_WITH_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`${optionBase} ${
                    stage1.builtWith === opt ? optionSelected : optionIdle
                  }`}
                >
                  <input
                    type="radio"
                    name="builtWith"
                    value={opt}
                    checked={stage1.builtWith === opt}
                    onChange={() => void onSelectBuiltWith(opt)}
                    className="mt-0.5"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === "blockers" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {q.blockers.label}
            </legend>
            <p className="mt-2 text-sm text-muted">{q.blockers.helper}</p>
            <div className="mt-4 flex flex-col gap-2" data-testid="readiness-q4">
              {BLOCKER_OPTIONS.map((opt) => {
                const checked = stage1.blockers.includes(opt);
                const disabled = !checked && stage1.blockers.length >= MAX_BLOCKERS;
                return (
                  <label
                    key={opt}
                    className={`${optionBase} ${
                      checked ? optionSelected : disabled ? optionDisabled : optionIdle
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="blockers"
                      value={opt}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => void toggleBlocker(opt)}
                      className="mt-0.5"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              {stage1.blockers.length}/{MAX_BLOCKERS} selected
            </p>
          </fieldset>
        ) : null}

        {step === "deadline" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {q.deadline.label}
            </legend>
            <div
              className="mt-4 flex flex-col gap-2"
              role="radiogroup"
              aria-label={q.deadline.label}
              data-testid="readiness-q5"
            >
              {DEADLINE_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`${optionBase} ${
                    stage1.deadline === opt ? optionSelected : optionIdle
                  }`}
                >
                  <input
                    type="radio"
                    name="deadline"
                    value={opt}
                    checked={stage1.deadline === opt}
                    onChange={() => {
                      const next = {
                        ...stage1,
                        deadline: opt,
                        deadlineDetail: deadlineNeedsDetail(opt) ? stage1.deadlineDetail : "",
                      };
                      setStage1(next);
                      void persist(next, "intake");
                    }}
                    className="mt-0.5"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {deadlineNeedsDetail(stage1.deadline) ? (
              <div className="mt-4" data-testid="readiness-deadline-detail">
                <label htmlFor="deadlineDetail" className="text-sm font-medium text-ink-soft">
                  {q.deadline.detailLabel}
                </label>
                <input
                  id="deadlineDetail"
                  type="text"
                  name="deadlineDetail"
                  value={stage1.deadlineDetail}
                  onChange={(ev) =>
                    setStage1((s) => ({ ...s, deadlineDetail: ev.target.value.slice(0, 280) }))
                  }
                  onBlur={() => void persist(stage1, "intake")}
                  placeholder={q.deadline.detailPlaceholder}
                  className="mt-2 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-ink"
                />
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <AnswerCallout callout={stage1Callout} />

        <div className="mt-6 flex flex-wrap gap-3">
          {stepIndex > 0 ? (
            <button type="button" className="btn-secondary" onClick={goBack}>
              {c.stage1.back}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={!canAdvance}
            onClick={() => void goNext()}
            data-testid="readiness-continue"
            data-callout-blocks="false"
            aria-disabled={!canAdvance}
          >
            {c.stage1.continue}
          </button>
        </div>
      </div>

      {stage3Panel}
    </div>
  );
}
