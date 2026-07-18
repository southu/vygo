/**
 * Diagnostic prompt generator for the Readiness Check flow.
 * Built from the shared report schema so prompt fields and parser cannot drift.
 */
import {
  READINESS_REPORT_CONTRACT_VERSION,
  READINESS_REPORT_V1_END,
  READINESS_REPORT_V1_FIELDS,
  READINESS_REPORT_V1_START,
} from "./report-schema.js";
import {
  resolvePromptVariant,
  type BuiltWithOption,
  type PromptVariant,
  type ReadinessStage1Answers,
} from "./readiness-intake.js";

export const READINESS_PROMPT_REASSURANCE =
  "This prompt is read-only. It never asks the AI to change code, and it excludes secrets, keys, and customer data." as const;

/** Endpoint the customer's AI POSTs analysis results back to (see api/readiness/[op].ts "submit"). */
export const READINESS_SUBMIT_URL = "https://www.vygo.ai/api/readiness/submit" as const;

const FIXED_RULES_LINES = [
  "RULES (fixed — do not relax):",
  "1. Read-only: inspect and report only. Do not modify files, run destructive commands, or propose code changes.",
  "2. Never include secrets/values: no API keys, tokens, passwords, connection strings, env values, or customer PII.",
  "3. Mark UNKNOWN if a field is unverifiable from available context.",
  "4. Grade against production standards (security, reliability, operability) — not demo or prototype standards.",
  "5. Output ONLY the report block between the delimiters below. No preamble, no markdown outside the block.",
] as const;

function fieldChecklist(): string {
  return READINESS_REPORT_V1_FIELDS.map((f) => `- ${f}`).join("\n");
}

function contextBlock(answers: ReadinessStage1Answers): string {
  const blockers = answers.blockers.length > 0 ? answers.blockers.join("; ") : "UNKNOWN";
  const deadline =
    answers.deadline === "Yes within 30 days" || answers.deadline === "Yes within 90 days"
      ? `${answers.deadline}${answers.deadlineDetail?.trim() ? ` — ${answers.deadlineDetail.trim()}` : ""}`
      : answers.deadline || "UNKNOWN";

  return [
    "CONTEXT FROM INTAKE (for orientation only — still verify in the codebase):",
    `- Product: ${answers.productDescription.trim() || "UNKNOWN"}`,
    `- Who uses it: ${answers.whoUses || "UNKNOWN"}`,
    `- Built with: ${answers.builtWith || "UNKNOWN"}`,
    `- Blockers: ${blockers}`,
    `- Deadline: ${deadline}`,
  ].join("\n");
}

function howToSteps(toolName: string, variant: PromptVariant): string[] {
  if (variant === "A") {
    return [
      `1. Open your AI coding agent (${toolName}) in the project root and paste the prompt below.`,
      "2. Let the agent inspect the repository read-only and produce the report block.",
      "3. Copy the full report block (including delimiters) and return to vygo when ready to paste it.",
    ];
  }
  return [
    `1. Open ${toolName} with your project context available in the chat.`,
    "2. Paste the prompt below. For any field you cannot verify from the chat context, mark it UNKNOWN.",
    "3. Copy the full report block (including delimiters) and return to vygo when ready to paste it.",
  ];
}

/**
 * Short 3-step how-to for the Stage 2 UI (not embedded in the copyable prompt).
 */
export function buildPromptHowTo(builtWith: string): {
  variant: PromptVariant;
  toolName: string;
  steps: string[];
} | null {
  const variant = resolvePromptVariant(builtWith);
  if (!variant) return null;
  const toolName = builtWith || "your tool";
  return { variant, toolName, steps: howToSteps(toolName, variant) };
}

export type BuildDiagnosticPromptInput = {
  answers: ReadinessStage1Answers;
  /** Override tool display name; defaults to answers.builtWith. */
  toolName?: string;
  /**
   * Per-session submission token minted via /api/readiness/token. When present,
   * it is embedded in the prompt and a submit-back instruction block is appended.
   */
  submissionToken?: string;
};

/**
 * Instruction block appended after the analysis instructions, addressed to the
 * customer's AI: submit the results back to Vygo only if it has web/tool access.
 * Field names mirror the /api/readiness/submit contract (submission_token required,
 * results/results_text optional payload).
 */
function submissionInstructionBlock(token: string): string[] {
  return [
    "SUBMIT RESULTS BACK TO VYGO (instructions for the AI running this prompt):",
    "AFTER you have produced the report block above, IF you have web/tool access (an HTTP client, a web request tool, or code execution), submit the analysis results back to Vygo as JSON:",
    "1. Method: POST",
    `2. URL: ${READINESS_SUBMIT_URL}`,
    "3. Headers: Content-Type: application/json",
    "4. Body: a single JSON object with these exact fields:",
    "   {",
    `     "submission_token": "${token}",`,
    '     "results": { "<report field name>": "<value or UNKNOWN>" },',
    '     "results_text": "<the full report block as plain text, including delimiters>"',
    "   }",
    '   - "submission_token" (string, required): the submission token embedded above — include it in the body exactly as shown.',
    '   - "results" (object, optional): the completed report fields as structured JSON.',
    '   - "results_text" (string, optional): the raw report block text.',
    '   Always include "submission_token"; include "results" and/or "results_text".',
    "5. If you do NOT have web/tool access, do not attempt the request — tell the user to paste the report block back into the Vygo readiness page instead.",
    "6. Once the POST succeeds (HTTP 200), confirm to the user that the analysis results were successfully submitted to Vygo.",
  ];
}

/**
 * Full diagnostic prompt text shown in the monospace block (copyable).
 */
export function buildDiagnosticPrompt(input: BuildDiagnosticPromptInput): {
  variant: PromptVariant;
  prompt: string;
} | null {
  const builtWith = input.answers.builtWith;
  if (!builtWith) return null;
  const variant = resolvePromptVariant(builtWith);
  if (!variant) return null;

  const toolName = input.toolName?.trim() || builtWith;
  const variantHeader =
    variant === "A"
      ? `VARIANT A — agent with repository access (${toolName})`
      : `VARIANT B — builder chat (${toolName}); mark unverifiable fields UNKNOWN`;

  const variantInstructions =
    variant === "A"
      ? [
          `You are assisting a production readiness review inside ${toolName}.`,
          "Open the project root and inspect the codebase read-only.",
          "Prefer evidence from source, config, and infrastructure files. Do not invent deployment facts.",
        ]
      : [
          `You are assisting a production readiness review inside ${toolName} (builder chat — limited or no full-repo access).`,
          "Use only information available in this conversation and any attached project context.",
          "If a field cannot be verified, write exactly: UNKNOWN",
          "Do not guess production architecture, secrets layout, or security controls.",
        ];

  const lines = [
    `VYGO READINESS DIAGNOSTIC PROMPT (contract v${READINESS_REPORT_CONTRACT_VERSION})`,
    variantHeader,
    "",
    ...variantInstructions,
    "",
    contextBlock(input.answers),
    "",
    ...FIXED_RULES_LINES,
    "",
    "FIELDS TO COMPLETE (fixed set — do not rename):",
    fieldChecklist(),
    "",
    "OUTPUT FORMAT — emit exactly this structure:",
    READINESS_REPORT_V1_START,
    ...READINESS_REPORT_V1_FIELDS.map((f) =>
      f === "confidence" ? `${f}: <number 0..1>` : `${f}: <value or UNKNOWN>`,
    ),
    READINESS_REPORT_V1_END,
    "",
    "Remember: read-only, no secrets/values, UNKNOWN if unverifiable, production standards, output ONLY the report block.",
  ];

  const submissionToken = input.submissionToken?.trim() || "";
  if (!submissionToken) {
    return { variant, prompt: lines.join("\n") };
  }

  // Token line goes before the analysis instructions, the submission block after
  // them — the analysis instructions themselves stay byte-identical.
  const withSubmission = [
    lines[0],
    lines[1],
    "",
    `SUBMISSION TOKEN (unique to this readiness session): ${submissionToken}`,
    ...lines.slice(2),
    "",
    ...submissionInstructionBlock(submissionToken),
  ];

  return { variant, prompt: withSubmission.join("\n") };
}

export function isRepoAccessTool(builtWith: BuiltWithOption | string): boolean {
  return resolvePromptVariant(builtWith) === "A";
}

export function isBuilderChatTool(builtWith: BuiltWithOption | string): boolean {
  return resolvePromptVariant(builtWith) === "B";
}
