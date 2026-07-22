/**
 * Ratchet learnings log — a strictly additive, append-only store of learnings
 * captured during delivery, plus its read/write access module.
 *
 * Data store:  data/ratchet-learnings.json  ({ "entries": [] } when empty)
 * Cadence config (single source of truth):  config/learnings-cadence.json
 *
 * Invariants (enforced by {@link assertAdditive}):
 *  - entries are NEVER deleted;
 *  - immutable fields (id, summary, title, date, source_link,
 *    affected_sections, created, and incorporated_date once set) are NEVER
 *    rewritten;
 *  - status only moves forward: pending-in-guide -> draft -> incorporated,
 *    never back.
 *
 * Any write that would violate these is rejected with {@link LearningsLogError}.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from packages/validation/src/. */
export const REPO_ROOT = resolve(MODULE_DIR, "..", "..", "..");

/** Default on-disk location of the learnings log data store. */
export const DEFAULT_LEARNINGS_LOG_PATH = resolve(REPO_ROOT, "data", "ratchet-learnings.json");

/** Default on-disk location of the single cadence config file. */
export const DEFAULT_CADENCE_CONFIG_PATH = resolve(REPO_ROOT, "config", "learnings-cadence.json");

/**
 * Allowed lifecycle states for a learning entry, in forward order. A learning
 * starts `pending-in-guide`, is proposed into a held revision as `draft`, and
 * becomes `incorporated` only when that revision is published. Status only ever
 * moves forward through this list (see {@link assertAdditive}).
 */
export const LEARNING_STATUSES = ["pending-in-guide", "draft", "incorporated"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

/** Forward rank of each status; a write may never lower an entry's rank. */
export const STATUS_RANK: Record<LearningStatus, number> = {
  "pending-in-guide": 0,
  draft: 1,
  incorporated: 2,
};

/**
 * Fields that are immutable once an entry exists. Rewriting any of them is a
 * destructive edit and is rejected. `status` is intentionally excluded — it may
 * only move forward (see {@link assertAdditive}); `updated` and
 * `incorporated_date` are stamped by the transition helpers.
 */
export const IMMUTABLE_ENTRY_FIELDS = [
  "id",
  "summary",
  "title",
  "date",
  "source_link",
  "affected_sections",
  "created",
] as const;

/** Error raised for any read failure or attempted destructive/invalid edit. */
export class LearningsLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningsLogError";
  }
}

/** Schema for a single learning entry. */
export const learningEntrySchema = z
  .object({
    /** Stable, unique identifier. */
    id: z.string().min(1),
    /** Human-readable summary of the learning. */
    summary: z.string().min(1),
    /**
     * Short human-readable name for the learning, used to name it in guide
     * changelog / revision entries. Optional for backward compatibility;
     * {@link learningDisplayName} falls back to the summary or id when absent.
     */
    title: z.string().min(1).optional(),
    /** Calendar date the learning was captured (YYYY-MM-DD or ISO). */
    date: z.string().min(1),
    /** Source link: commit / PR / experiment URL. */
    source_link: z.string().min(1),
    /** Affected guide section(s). */
    affected_sections: z.array(z.string().min(1)),
    /** Lifecycle status. */
    status: z.enum(LEARNING_STATUSES),
    /** Creation timestamp (ISO 8601). */
    created: z.string().min(1),
    /** Last-updated timestamp (ISO 8601). */
    updated: z.string().min(1),
    /** Set only when status flips to 'incorporated'. */
    incorporated_date: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.status === "incorporated" && !entry.incorporated_date) {
      ctx.addIssue({
        code: "custom",
        message: "incorporated entries require an incorporated_date",
      });
    }
    if (entry.status !== "incorporated" && entry.incorporated_date) {
      ctx.addIssue({
        code: "custom",
        message: `${entry.status} entries must not have an incorporated_date`,
      });
    }
  });

export type LearningEntry = z.infer<typeof learningEntrySchema>;

/** Schema for the whole log document. */
export const learningsLogSchema = z.object({ entries: z.array(learningEntrySchema) }).strict();
export type LearningsLog = z.infer<typeof learningsLogSchema>;

/** Cadence config: staleness threshold N (pending count) and refresh window M (days). */
export const cadenceConfigSchema = z
  .object({
    staleness_threshold: z.number().int().positive(),
    refresh_window_days: z.number().int().positive(),
  })
  .strict();
export type CadenceConfig = z.infer<typeof cadenceConfigSchema>;

/** Input required to append a brand-new (pending) learning. */
export interface NewLearningInput {
  id: string;
  summary: string;
  date: string;
  source_link: string;
  affected_sections: string[];
  /** Optional short human-readable name (used in changelog/revision entries). */
  title?: string;
}

/** Options accepted by the write helpers. */
export interface WriteOptions {
  /** Override the log path (defaults to {@link DEFAULT_LEARNINGS_LOG_PATH}). */
  path?: string;
  /** Override the timestamp used for created/updated/incorporated_date stamps. */
  now?: string;
  /**
   * Override the calendar date (ISO YYYY-MM-DD) stamped as `incorporated_date`
   * when an entry is marked incorporated. Defaults to `now`. Kept separate so
   * the log can carry a clean YYYY-MM-DD incorporation date while `updated`
   * keeps its full ISO timestamp.
   */
  incorporatedDate?: string;
}

/**
 * Short, human-readable name for a learning, used when naming it in a guide
 * changelog / revision entry. Prefers the explicit `title`; otherwise the first
 * sentence of the summary (before any "Pending:" reason); otherwise the id.
 */
export function learningDisplayName(entry: {
  id: string;
  title?: string;
  summary: string;
}): string {
  if (entry.title && entry.title.trim()) return entry.title.trim();
  const head = entry.summary.split(/Pending:/i)[0] ?? entry.summary;
  const firstSentence = head.split(/(?<=[.!?])\s/)[0]?.trim();
  return firstSentence && firstSentence.length > 0 ? firstSentence : entry.id;
}

function readJsonFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new LearningsLogError(`unable to read ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new LearningsLogError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Read and validate the learnings log from disk. */
export function readLog(path: string = DEFAULT_LEARNINGS_LOG_PATH): LearningsLog {
  const parsed = learningsLogSchema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    throw new LearningsLogError(`learnings log at ${path} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Read and validate the single cadence config file. */
export function readCadenceConfig(path: string = DEFAULT_CADENCE_CONFIG_PATH): CadenceConfig {
  const parsed = cadenceConfigSchema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    throw new LearningsLogError(`cadence config at ${path} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Assert that `next` is a strictly-additive successor of `previous`: no entry
 * removed, no immutable field rewritten, no status regression, and
 * incorporated_date never changed once set. New entries are permitted.
 * Throws {@link LearningsLogError} on the first violation.
 */
export function assertAdditive(previous: LearningsLog, next: LearningsLog): void {
  const parsed = learningsLogSchema.safeParse(next);
  if (!parsed.success) {
    throw new LearningsLogError(`refusing invalid write: ${parsed.error.message}`);
  }

  const nextById = new Map<string, LearningEntry>();
  for (const entry of parsed.data.entries) {
    if (nextById.has(entry.id)) {
      throw new LearningsLogError(`refusing write: duplicate entry id "${entry.id}"`);
    }
    nextById.set(entry.id, entry);
  }

  for (const prev of previous.entries) {
    const updated = nextById.get(prev.id);
    if (!updated) {
      throw new LearningsLogError(`destructive edit rejected: entry "${prev.id}" was deleted`);
    }
    for (const field of IMMUTABLE_ENTRY_FIELDS) {
      if (JSON.stringify(prev[field]) !== JSON.stringify(updated[field])) {
        throw new LearningsLogError(
          `destructive edit rejected: immutable field "${field}" changed on entry "${prev.id}"`,
        );
      }
    }
    if (STATUS_RANK[updated.status] < STATUS_RANK[prev.status]) {
      throw new LearningsLogError(
        `destructive edit rejected: entry "${prev.id}" reverted from ${prev.status} to ${updated.status}`,
      );
    }
    if (prev.incorporated_date && prev.incorporated_date !== updated.incorporated_date) {
      throw new LearningsLogError(
        `destructive edit rejected: incorporated_date changed on entry "${prev.id}"`,
      );
    }
  }
}

/**
 * Validate and persist `next` to disk, but only if it is a strictly-additive
 * successor of what is currently stored. Returns the validated log.
 */
export function writeLog(next: LearningsLog, options: { path?: string } = {}): LearningsLog {
  const path = options.path ?? DEFAULT_LEARNINGS_LOG_PATH;
  const previous: LearningsLog = existsSync(path) ? readLog(path) : { entries: [] };
  assertAdditive(previous, next);
  const validated = learningsLogSchema.parse(next);
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
}

/** Append a new pending-in-guide learning. Rejects duplicate ids. */
export function appendEntry(input: NewLearningInput, options: WriteOptions = {}): LearningEntry {
  const path = options.path ?? DEFAULT_LEARNINGS_LOG_PATH;
  const now = options.now ?? new Date().toISOString();
  const log = readLog(path);
  if (log.entries.some((entry) => entry.id === input.id)) {
    throw new LearningsLogError(`entry id "${input.id}" already exists`);
  }
  const entry: LearningEntry = {
    id: input.id,
    summary: input.summary,
    ...(input.title ? { title: input.title } : {}),
    date: input.date,
    source_link: input.source_link,
    affected_sections: [...input.affected_sections],
    status: "pending-in-guide",
    created: now,
    updated: now,
  };
  writeLog({ entries: [...log.entries, entry] }, { path });
  return entry;
}

/**
 * Flip an entry from pending-in-guide to draft (proposed into a held guide
 * revision), stamping `updated`. Idempotent for entries already in draft.
 * Throws if the id is unknown or the entry is already incorporated (status
 * only moves forward). This write is meant to live in the review area (an
 * uncommitted working-tree change) until the revision is approved.
 */
export function markDraft(id: string, options: WriteOptions = {}): LearningEntry {
  const path = options.path ?? DEFAULT_LEARNINGS_LOG_PATH;
  const now = options.now ?? new Date().toISOString();
  const log = readLog(path);
  const index = log.entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new LearningsLogError(`entry id "${id}" not found`);
  }
  const current = log.entries[index]!;
  if (current.status === "draft") {
    return current;
  }
  if (current.status === "incorporated") {
    throw new LearningsLogError(
      `entry id "${id}" is already incorporated and cannot return to draft`,
    );
  }
  const updated: LearningEntry = { ...current, status: "draft", updated: now };
  const entries = [...log.entries];
  entries[index] = updated;
  writeLog({ entries }, { path });
  return updated;
}

/**
 * Flip an entry (pending-in-guide or draft) to incorporated, stamping
 * incorporated_date and updated. Idempotent for already-incorporated entries.
 * Throws if the id is unknown.
 */
export function markIncorporated(id: string, options: WriteOptions = {}): LearningEntry {
  const path = options.path ?? DEFAULT_LEARNINGS_LOG_PATH;
  const now = options.now ?? new Date().toISOString();
  const log = readLog(path);
  const index = log.entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new LearningsLogError(`entry id "${id}" not found`);
  }
  const current = log.entries[index]!;
  if (current.status === "incorporated") {
    return current;
  }
  const updated: LearningEntry = {
    ...current,
    status: "incorporated",
    incorporated_date: options.incorporatedDate ?? now,
    updated: now,
  };
  const entries = [...log.entries];
  entries[index] = updated;
  writeLog({ entries }, { path });
  return updated;
}

/** Count entries still pending incorporation into the guide. */
export function countPending(log: LearningsLog): number {
  return log.entries.filter((entry) => entry.status === "pending-in-guide").length;
}

/**
 * Whether a guide refresh is due: pending learnings have reached the staleness
 * threshold N configured in {@link DEFAULT_CADENCE_CONFIG_PATH}.
 */
export function isGuideRefreshDue(
  options: { logPath?: string; cadencePath?: string } = {},
): boolean {
  const log = readLog(options.logPath ?? DEFAULT_LEARNINGS_LOG_PATH);
  const cadence = readCadenceConfig(options.cadencePath ?? DEFAULT_CADENCE_CONFIG_PATH);
  return countPending(log) >= cadence.staleness_threshold;
}

/**
 * Whether the refresh window M (days from cadence config) has elapsed since a
 * prior refresh timestamp.
 */
export function isRefreshWindowElapsed(
  lastRefreshIso: string,
  cadence: CadenceConfig,
  now: string = new Date().toISOString(),
): boolean {
  const elapsedMs = new Date(now).getTime() - new Date(lastRefreshIso).getTime();
  return elapsedMs >= cadence.refresh_window_days * 24 * 60 * 60 * 1000;
}
