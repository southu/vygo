/**
 * Guide-update workflow core — the SELECT -> DRAFT -> (approve) -> PUBLISH ->
 * BOOKKEEPING pipeline that turns pending learnings into published guide
 * revisions, with a human review gate between DRAFT and PUBLISH.
 *
 * This module is pure orchestration over two append-only stores:
 *  - the learnings log (@vygo/validation/learnings-log), whose entries move
 *    pending-in-guide -> draft -> incorporated; and
 *  - the guide revisions store ({@link ./guide-revisions}), which records each
 *    published revision id and the learnings it incorporated.
 *
 * Nothing here commits, pushes, or deploys — DRAFT only mutates the working
 * tree (the review area) and writes a draft record; PUBLISH flips the log to
 * incorporated and appends the revision. The thin CLI (scripts/guide-update.ts)
 * owns the git side and the human approval gate.
 *
 * No publish/deploy credentials are read, embedded, or emitted here; generated
 * draft and revision text is scrubbed by {@link assertNoCredentialMaterial}.
 */
import {
  DEFAULT_LEARNINGS_LOG_PATH,
  learningDisplayName,
  markDraft,
  markIncorporated,
  readLog,
  type LearningEntry,
} from "./learnings-log.js";
import {
  appendRevision,
  DEFAULT_GUIDE_REVISIONS_PATH,
  GuideRevisionsError,
  ISO_DATE_RE,
  nextRevisionId,
  readGuideRevisions,
  type GuideRevision,
} from "./guide-revisions.js";

/** Error raised for workflow-level problems (bad selection, guard failures). */
export class GuideUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideUpdateError";
  }
}

/**
 * Credential-material patterns that must never appear in generated draft or
 * revision content, nor in anything the site renders. Mirrors the mission's
 * acceptance check so a bad learning summary can never smuggle a token through
 * the workflow onto the published page.
 */
const CREDENTIAL_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "RAILWAY_TOKEN", re: /RAILWAY_TOKEN/ },
  { name: "API_KEY", re: /API_KEY/ },
  { name: "api_key assignment", re: /api_key=/i },
  { name: "bearer token", re: /Bearer\s+[A-Za-z0-9._~+/-]{8,}/ },
];

/** Throw if `text` contains credential material. Used to guard generated copy. */
export function assertNoCredentialMaterial(text: string, where: string): void {
  for (const { name, re } of CREDENTIAL_PATTERNS) {
    if (re.test(text)) {
      throw new GuideUpdateError(
        `refusing to proceed: ${where} contains credential-like material (${name})`,
      );
    }
  }
}

/** A single learning as carried through the workflow. */
export interface DraftLearning {
  id: string;
  name: string;
  summary: string;
  source_link: string;
  affected_sections: string[];
}

/** A proposed, held-for-review revision of the guide page. */
export interface DraftRevision {
  /** The revision id this draft will publish under (stable through publish). */
  id: string;
  /** Publish date (ISO YYYY-MM-DD). */
  date: string;
  title: string;
  summary: string;
  /** Learnings selected into this revision. */
  learnings: DraftLearning[];
  /** Ready-to-paste changelog markdown naming each learning + the revision id. */
  changelog_markdown: string;
  /** Ready-to-paste guide section-edit content (per affected section). */
  section_edits_markdown: string;
  /** ISO 8601 creation timestamp. */
  created: string;
  status: "draft";
}

export interface WorkflowPaths {
  logPath?: string;
  revisionsPath?: string;
}

/**
 * SELECT: resolve the given learning ids to entries eligible for drafting.
 * Eligible = currently pending-in-guide, or already draft (idempotent re-draft).
 * Throws on unknown ids, already-incorporated ids, empty selection, or dupes.
 */
export function selectPending(
  learningIds: string[],
  options: { logPath?: string } = {},
): LearningEntry[] {
  if (learningIds.length === 0) {
    throw new GuideUpdateError("no learnings selected — pass at least one pending learning id");
  }
  const seen = new Set<string>();
  for (const id of learningIds) {
    if (seen.has(id)) throw new GuideUpdateError(`learning id "${id}" selected more than once`);
    seen.add(id);
  }
  const log = readLog(options.logPath ?? DEFAULT_LEARNINGS_LOG_PATH);
  const byId = new Map(log.entries.map((entry) => [entry.id, entry]));
  const selected: LearningEntry[] = [];
  for (const id of learningIds) {
    const entry = byId.get(id);
    if (!entry) throw new GuideUpdateError(`learning id "${id}" not found in the learnings log`);
    if (entry.status === "incorporated") {
      throw new GuideUpdateError(`learning id "${id}" is already incorporated`);
    }
    selected.push(entry);
  }
  return selected;
}

function toDraftLearning(entry: LearningEntry): DraftLearning {
  return {
    id: entry.id,
    name: learningDisplayName(entry),
    summary: entry.summary,
    source_link: entry.source_link,
    affected_sections: [...entry.affected_sections],
  };
}

function buildChangelogMarkdown(
  revisionId: string,
  date: string,
  learnings: DraftLearning[],
): string {
  const lines = [
    `### ${revisionId} — guide revision ${date}`,
    "",
    "Incorporated learnings:",
    "",
    ...learnings.map(
      (learning) =>
        `- **${learning.name}** (${learning.id}) — incorporated ${date}, revision ${revisionId}. Source: ${learning.source_link}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function buildSectionEditsMarkdown(learnings: DraftLearning[]): string {
  const blocks = learnings.map((learning) => {
    const sections = learning.affected_sections.join(", ") || "(unspecified)";
    return [
      `#### ${learning.name} (${learning.id})`,
      `Affected guide section(s): ${sections}`,
      "",
      learning.summary,
    ].join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}

/**
 * DRAFT: build a proposed revision for the selected pending learnings and flip
 * each selected entry pending-in-guide -> draft in the learnings log (a
 * working-tree change that is the review area — not committed here). Returns the
 * draft record; the caller persists it and holds it for approval. Nothing is
 * published, committed, or deployed.
 */
export function buildDraft(
  input: {
    learningIds: string[];
    date: string;
    title: string;
    summary: string;
    now?: string;
  },
  options: WorkflowPaths = {},
): DraftRevision {
  const { learningIds, date, title, summary } = input;
  if (!ISO_DATE_RE.test(date)) {
    throw new GuideUpdateError(`date must be ISO YYYY-MM-DD, got "${date}"`);
  }
  const logPath = options.logPath ?? DEFAULT_LEARNINGS_LOG_PATH;
  const revisionsPath = options.revisionsPath ?? DEFAULT_GUIDE_REVISIONS_PATH;
  const now = input.now ?? new Date().toISOString();

  const selected = selectPending(learningIds, { logPath });
  const learnings = selected.map(toDraftLearning);

  const revisionId = nextRevisionId(readGuideRevisions(revisionsPath), date);

  const changelog_markdown = buildChangelogMarkdown(revisionId, date, learnings);
  const section_edits_markdown = buildSectionEditsMarkdown(learnings);

  const draft: DraftRevision = {
    id: revisionId,
    date,
    title,
    summary,
    learnings,
    changelog_markdown,
    section_edits_markdown,
    created: now,
    status: "draft",
  };

  // Guard the generated copy before it is written anywhere reviewable.
  assertNoCredentialMaterial(
    [title, summary, changelog_markdown, section_edits_markdown].join("\n"),
    "draft content",
  );

  // Flip the selected entries into draft (the review-area working-tree change).
  for (const id of learningIds) {
    markDraft(id, { path: logPath, now });
  }

  return draft;
}

export interface PublishResult {
  revision: GuideRevision;
  incorporated: LearningEntry[];
}

/**
 * PUBLISH + BOOKKEEPING: on approval, flip each drafted learning to
 * incorporated (stamping the incorporation date), and append a guide revision
 * that records the revision id and names every learning it incorporated. Does
 * not commit or push — the CLI does that so the normal deploy pipeline ships it
 * (or, for `manual` publishes, records that the operator pasted it).
 */
export function publishDraft(
  draft: DraftRevision,
  options: WorkflowPaths & { publishedVia?: "git" | "manual"; now?: string } = {},
): PublishResult {
  const logPath = options.logPath ?? DEFAULT_LEARNINGS_LOG_PATH;
  const revisionsPath = options.revisionsPath ?? DEFAULT_GUIDE_REVISIONS_PATH;
  const publishedVia = options.publishedVia ?? "git";
  const now = options.now ?? new Date().toISOString();
  const date = draft.date;

  if (!ISO_DATE_RE.test(date)) {
    throw new GuideUpdateError(`draft date must be ISO YYYY-MM-DD, got "${date}"`);
  }
  if (draft.learnings.length === 0) {
    throw new GuideUpdateError("draft has no learnings to publish");
  }
  assertNoCredentialMaterial(
    [draft.title, draft.summary, draft.changelog_markdown, draft.section_edits_markdown].join("\n"),
    "revision content",
  );

  // Refuse to reuse an id that already exists (double-publish protection).
  const store = readGuideRevisions(revisionsPath);
  if (store.revisions.some((revision) => revision.id === draft.id)) {
    throw new GuideRevisionsError(`revision id "${draft.id}" already exists`);
  }

  // BOOKKEEPING: flip each learning to incorporated, stamping the date.
  const incorporated: LearningEntry[] = [];
  for (const learning of draft.learnings) {
    incorporated.push(
      markIncorporated(learning.id, { path: logPath, now, incorporatedDate: date }),
    );
  }

  // Record the revision, naming each learning and its incorporation date so the
  // changelog ties learning -> revision id forever.
  const revision: GuideRevision = {
    id: draft.id,
    date,
    title: draft.title,
    summary: draft.summary,
    published_via: publishedVia,
    learnings: draft.learnings.map((learning) => ({
      id: learning.id,
      name: learning.name,
      incorporated_date: date,
    })),
    created: now,
  };
  const saved = appendRevision(revision, { path: revisionsPath });

  return { revision: saved, incorporated };
}
