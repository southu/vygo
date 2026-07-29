/**
 * Campaign workspace content model.
 *
 * A self-contained, server-rendered dataset that powers the operator campaign
 * workspace at /campaigns. Everything here is emitted into live page source so
 * the deployed app can be verified black-box: workspace, briefs, owners, the
 * drafting/review/launch readiness stages with acceptance checks, the ordered
 * work queue, per-milestone evidence, and the weekly evidence summary.
 *
 * The selected Vygo folder and repository are kept explicit here and surfaced
 * on every task so contributors always know where the work belongs.
 */

/** The Vygo folder and repository every campaign task belongs to. */
export const CAMPAIGN_CONTEXT = {
  /** Vygo project folder these campaigns ship from. */
  folder: "vygo",
  /** Canonical clone URL. */
  repoUrl: "https://github.com/southu/vygo.git",
  /** Short owner/name form. */
  repoName: "southu/vygo",
  /** Human label used in the UI. */
  repoLabel: "github.com/southu/vygo",
} as const;

export type StageId = "drafting" | "review" | "launch";

export type Stage = {
  id: StageId;
  order: number;
  label: string;
  summary: string;
  /** Acceptance checks that must pass before work leaves this stage. */
  acceptanceChecks: string[];
};

/** Launch-readiness stages, in the order work flows through them. */
export const STAGES: Stage[] = [
  {
    id: "drafting",
    order: 1,
    label: "Drafting",
    summary: "Shape the brief, the offer, and the assets. Get to a reviewable first cut.",
    acceptanceChecks: [
      "Brief objective, audience, and primary channel are written down",
      "Draft copy and hero asset exist and are linked",
      "Owner assigned and target launch date set",
    ],
  },
  {
    id: "review",
    order: 2,
    label: "Review",
    summary: "Pressure-test claims, compliance, and tracking before anything ships.",
    acceptanceChecks: [
      "Copy reviewed for claims and brand voice",
      "Analytics events and UTM tags defined and verified",
      "Legal/privacy sign-off recorded where required",
    ],
  },
  {
    id: "launch",
    order: 3,
    label: "Launch",
    summary: "Ship, watch the first signals, and capture evidence of the outcome.",
    acceptanceChecks: [
      "Assets published to the live channel and reachable",
      "Post-launch metrics wired to the dashboard",
      "Milestone evidence captured within 48 hours",
    ],
  },
];

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export type Milestone = {
  id: string;
  title: string;
  /** Concise evidence of the outcome for this milestone. */
  evidence: string;
  captured: boolean;
};

export type CampaignTask = {
  id: string;
  /** Position in the coherent campaign queue (1 = run next). */
  queueOrder: number;
  title: string;
  brief: string;
  campaignId: string;
  stage: StageId;
  owner: string;
  ownerRole: string;
  status: TaskStatus;
  acceptanceChecks: { label: string; done: boolean }[];
  milestone: Milestone;
};

export type Campaign = {
  id: string;
  name: string;
  brief: {
    objective: string;
    audience: string;
    channels: string[];
    keyMessage: string;
    successMetric: string;
  };
  owner: string;
  stage: StageId;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "launch-readiness-check",
    name: "Readiness Check launch",
    brief: {
      objective: "Drive qualified sign-ups to the AI Readiness Check from founder-led channels.",
      audience: "Seed / Series A founders evaluating an AI build partner.",
      channels: ["Email", "LinkedIn", "Website"],
      keyMessage: "See exactly where your product is not yet launch-ready — in ten minutes.",
      successMetric: "150 completed readiness checks in the first two weeks.",
    },
    owner: "Harper Jones",
    stage: "review",
  },
  {
    id: "vibe-coding-series",
    name: "Vibe-coding content series",
    brief: {
      objective: "Publish the vibe-coding guide series and convert readers to the waitlist.",
      audience: "Technical founders and operators shipping with AI agents.",
      channels: ["Blog", "Newsletter", "Social"],
      keyMessage: "Ship real software with agents — here is the operating manual.",
      successMetric: "8% waitlist conversion from series readers.",
    },
    owner: "Dana Okafor",
    stage: "drafting",
  },
  {
    id: "careers-hiring-push",
    name: "Founding team hiring push",
    brief: {
      objective: "Fill two founding engineer roles from the careers page and referrals.",
      audience: "Senior engineers who want early ownership and real scope.",
      channels: ["Careers page", "Referrals", "LinkedIn"],
      keyMessage: "Build vygo.ai from the ground floor — real ownership, real scope.",
      successMetric: "12 qualified applications and 2 signed offers.",
    },
    owner: "Sam Rivera",
    stage: "launch",
  },
];

/**
 * The coherent campaign queue: ordered work items an operator runs through
 * top to bottom. Every task carries its owner, stage, acceptance checks, and
 * milestone evidence, plus the shared folder/repo context.
 */
export const CAMPAIGN_TASKS: CampaignTask[] = [
  {
    id: "task-brief-readiness",
    queueOrder: 1,
    title: "Finalize Readiness Check launch brief",
    brief: "Lock objective, audience, and the ten-minute promise before review.",
    campaignId: "launch-readiness-check",
    stage: "drafting",
    owner: "Harper Jones",
    ownerRole: "Campaign lead",
    status: "done",
    acceptanceChecks: [
      { label: "Objective, audience, and channel written down", done: true },
      { label: "Draft hero copy linked", done: true },
      { label: "Owner and launch date set", done: true },
    ],
    milestone: {
      id: "ms-brief-readiness",
      title: "Brief signed off",
      evidence: "Brief approved 2026-07-21; hero copy + audience locked in the shared doc.",
      captured: true,
    },
  },
  {
    id: "task-review-readiness-tracking",
    queueOrder: 2,
    title: "Verify analytics + UTM tracking for Readiness Check",
    brief: "Confirm every CTA fires the right event and carries a UTM before launch.",
    campaignId: "launch-readiness-check",
    stage: "review",
    owner: "Priya Nair",
    ownerRole: "Growth analyst",
    status: "in_progress",
    acceptanceChecks: [
      { label: "Copy reviewed for claims and voice", done: true },
      { label: "Analytics events + UTM tags verified", done: false },
      { label: "Privacy sign-off recorded", done: false },
    ],
    milestone: {
      id: "ms-review-readiness",
      title: "Tracking verified",
      evidence: "3 of 5 CTAs confirmed firing readiness_check_start; 2 pending QA on staging.",
      captured: false,
    },
  },
  {
    id: "task-draft-vibe-series",
    queueOrder: 3,
    title: "Draft vibe-coding series part 2",
    brief: "Write the second installment and its newsletter teaser.",
    campaignId: "vibe-coding-series",
    stage: "drafting",
    owner: "Dana Okafor",
    ownerRole: "Content lead",
    status: "in_progress",
    acceptanceChecks: [
      { label: "Outline approved", done: true },
      { label: "Draft body written", done: false },
      { label: "Newsletter teaser drafted", done: false },
    ],
    milestone: {
      id: "ms-draft-vibe",
      title: "Part 2 draft ready",
      evidence: "Outline approved 2026-07-24; 900 of ~1,600 words drafted.",
      captured: false,
    },
  },
  {
    id: "task-review-vibe-claims",
    queueOrder: 4,
    title: "Review vibe-coding claims + privacy audit",
    brief: "Run the privacy audit and claims review on the series before publish.",
    campaignId: "vibe-coding-series",
    stage: "review",
    owner: "Marcus Lee",
    ownerRole: "Editorial reviewer",
    status: "todo",
    acceptanceChecks: [
      { label: "Claims reviewed against product reality", done: false },
      { label: "Privacy audit completed", done: false },
      { label: "Links and citations checked", done: false },
    ],
    milestone: {
      id: "ms-review-vibe",
      title: "Series cleared for publish",
      evidence: "Pending — privacy audit scheduled for the week of 2026-08-03.",
      captured: false,
    },
  },
  {
    id: "task-launch-careers",
    queueOrder: 5,
    title: "Launch founding-engineer roles",
    brief: "Publish both roles, wire application tracking, and open referrals.",
    campaignId: "careers-hiring-push",
    stage: "launch",
    owner: "Sam Rivera",
    ownerRole: "Talent lead",
    status: "in_progress",
    acceptanceChecks: [
      { label: "Roles published and reachable", done: true },
      { label: "Application analytics wired to dashboard", done: true },
      { label: "Milestone evidence captured", done: false },
    ],
    milestone: {
      id: "ms-launch-careers",
      title: "Roles live and tracked",
      evidence: "Both roles live on /careers since 2026-07-27; 4 applications captured so far.",
      captured: true,
    },
  },
];

export type WeeklyEvidenceSummary = {
  weekOf: string;
  headline: string;
  highlights: string[];
  metrics: { label: string; value: string }[];
};

/** Published weekly evidence summaries, newest first. */
export const WEEKLY_EVIDENCE: WeeklyEvidenceSummary[] = [
  {
    weekOf: "2026-07-27",
    headline: "Careers roles live; Readiness Check tracking in final QA.",
    highlights: [
      "Founding-engineer roles launched on /careers with application analytics wired.",
      "Readiness Check tracking review reached 3 of 5 CTAs verified.",
      "Vibe-coding series part 2 crossed the halfway mark in drafting.",
    ],
    metrics: [
      { label: "Tasks completed", value: "3" },
      { label: "Applications captured", value: "4" },
      { label: "CTAs verified", value: "3 / 5" },
    ],
  },
  {
    weekOf: "2026-07-20",
    headline: "Readiness Check brief signed off and moved into review.",
    highlights: [
      "Readiness Check launch brief approved and locked.",
      "Analytics event catalog drafted for all launch CTAs.",
      "Careers roles entered launch prep.",
    ],
    metrics: [
      { label: "Tasks completed", value: "2" },
      { label: "Briefs signed off", value: "1" },
      { label: "Stages advanced", value: "2" },
    ],
  },
];

/** Lookup helpers. */
export function getCampaign(id: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

export function getTask(id: string): CampaignTask | undefined {
  return CAMPAIGN_TASKS.find((t) => t.id === id);
}

export function getTasksForCampaign(campaignId: string): CampaignTask[] {
  return CAMPAIGN_TASKS.filter((t) => t.campaignId === campaignId).sort(
    (a, b) => a.queueOrder - b.queueOrder,
  );
}

export function getQueue(): CampaignTask[] {
  return [...CAMPAIGN_TASKS].sort((a, b) => a.queueOrder - b.queueOrder);
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};
