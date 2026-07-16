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
};

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

  return { variant, prompt: lines.join("\n") };
}

export function isRepoAccessTool(builtWith: BuiltWithOption | string): boolean {
  return resolvePromptVariant(builtWith) === "A";
}

export function isBuilderChatTool(builtWith: BuiltWithOption | string): boolean {
  return resolvePromptVariant(builtWith) === "B";
}
