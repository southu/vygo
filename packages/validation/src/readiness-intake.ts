/**
 * Stage-1 readiness intake options and routing helpers.
 * Shared by web (UI labels) and any server-side validation of drafts.
 */

export const PRODUCT_DESCRIPTION_MAX = 200 as const;

export const WHO_USES_OPTIONS = [
  "Just me",
  "My internal team",
  "External users free",
  "External users paying",
  "Enterprise customers or enterprise sales cycle",
] as const;

export type WhoUsesOption = (typeof WHO_USES_OPTIONS)[number];

export const BUILT_WITH_OPTIONS = [
  "Lovable",
  "Cursor",
  "Replit",
  "Bolt",
  "v0",
  "Claude Code",
  "Windsurf",
  "Mixed–multiple tools",
  "Other–hand-written",
  "Not built yet",
] as const;

export type BuiltWithOption = (typeof BUILT_WITH_OPTIONS)[number];

export const BLOCKER_OPTIONS = [
  "broke or struggles with real usage",
  "security questionnaire or review blocking a deal",
  "customer IT won't approve rollout",
  "only one person understands the code",
  "nothing broken — want solid before launch",
  "mainly need new features built",
] as const;

export type BlockerOption = (typeof BLOCKER_OPTIONS)[number];

export const MAX_BLOCKERS = 2 as const;

export const DEADLINE_OPTIONS = [
  "Yes within 30 days",
  "Yes within 90 days",
  "No hard deadline",
] as const;

export type DeadlineOption = (typeof DEADLINE_OPTIONS)[number];

/** Tools with repo access → Variant A prompt instructions. */
export const VARIANT_A_TOOLS = [
  "Cursor",
  "Claude Code",
  "Windsurf",
  "Mixed–multiple tools",
  "Other–hand-written",
] as const;

/** Builder-chat tools → Variant B (mark UNKNOWN when unverifiable). */
export const VARIANT_B_TOOLS = ["Lovable", "Replit", "Bolt", "v0"] as const;

export type PromptVariant = "A" | "B";

export function isBuiltWithOption(value: string): value is BuiltWithOption {
  return (BUILT_WITH_OPTIONS as readonly string[]).includes(value);
}

export function isWhoUsesOption(value: string): value is WhoUsesOption {
  return (WHO_USES_OPTIONS as readonly string[]).includes(value);
}

export function isBlockerOption(value: string): value is BlockerOption {
  return (BLOCKER_OPTIONS as readonly string[]).includes(value);
}

export function isDeadlineOption(value: string): value is DeadlineOption {
  return (DEADLINE_OPTIONS as readonly string[]).includes(value);
}

export function resolvePromptVariant(builtWith: string): PromptVariant | null {
  if ((VARIANT_A_TOOLS as readonly string[]).includes(builtWith)) return "A";
  if ((VARIANT_B_TOOLS as readonly string[]).includes(builtWith)) return "B";
  return null;
}

/** Hard off-ramp: product not built yet. */
export function isNotBuiltYet(builtWith: string): boolean {
  return builtWith === "Not built yet";
}

/**
 * Soft off-ramp when the only selected blocker is feature work.
 * If any reliability/security/foundation blocker is also selected, allow continue.
 */
export function isFeaturesOnlySoftOffRamp(blockers: readonly string[]): boolean {
  if (blockers.length === 0) return false;
  const unique = [...new Set(blockers)];
  return unique.length === 1 && unique[0] === "mainly need new features built";
}

export function deadlineNeedsDetail(deadline: string): boolean {
  return deadline === "Yes within 30 days" || deadline === "Yes within 90 days";
}

export type ReadinessStage1Answers = {
  productDescription: string;
  whoUses: WhoUsesOption | "";
  builtWith: BuiltWithOption | "";
  blockers: BlockerOption[];
  deadline: DeadlineOption | "";
  deadlineDetail: string;
};

export type ReadinessDraft = {
  stage1?: Partial<ReadinessStage1Answers>;
  email?: string;
  offRamp?: {
    kind: "not_built_yet" | "features_only";
    loggedAt?: string;
  };
  promptVariant?: PromptVariant;
  stage?: string;
};

export const EMPTY_STAGE1: ReadinessStage1Answers = {
  productDescription: "",
  whoUses: "",
  builtWith: "",
  blockers: [],
  deadline: "",
  deadlineDetail: "",
};
