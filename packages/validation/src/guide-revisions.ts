/**
 * Guide revision changelog — an append-only store of published revisions of the
 * /vibe-coding/ratchet-guide page, plus its read/write access module.
 *
 * Each revision carries a stable revision id and names exactly which learnings
 * it incorporated (by id + display name + incorporation date), so any past
 * revision's changelog identifies the learnings it folded into the guide. This
 * store is what the live guide page renders its "Revision history" from.
 *
 * Data store:  data/guide-revisions.json  ({ "revisions": [] } when empty)
 *
 * Invariants (enforced by {@link assertAdditiveRevisions}):
 *  - revisions are NEVER deleted;
 *  - a revision, once written, is NEVER rewritten (fully immutable);
 *  - revision ids are unique.
 *
 * Any write that would violate these is rejected with {@link GuideRevisionsError}.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from packages/validation/src/. */
export const REVISIONS_REPO_ROOT = resolve(MODULE_DIR, "..", "..", "..");

/** Default on-disk location of the guide revisions data store. */
export const DEFAULT_GUIDE_REVISIONS_PATH = resolve(
  REVISIONS_REPO_ROOT,
  "data",
  "guide-revisions.json",
);

/** Calendar-date pattern (ISO YYYY-MM-DD) shared by dates in this store. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Revision id shape: `GR-YYYY-MM-DD-NNN`, where NNN is a zero-padded global
 * sequence number. Stable and human-legible; assigned at draft time and carried
 * through to publish so the reviewed draft and the published revision match.
 */
export const REVISION_ID_RE = /^GR-\d{4}-\d{2}-\d{2}-\d{3,}$/;

/** Error raised for any read failure or attempted destructive/invalid edit. */
export class GuideRevisionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideRevisionsError";
  }
}

/** One learning named by a revision's changelog entry. */
export const revisionLearningSchema = z
  .object({
    /** The learnings-log entry id this revision incorporated. */
    id: z.string().min(1),
    /** Human-readable name of the learning as shown in the changelog. */
    name: z.string().min(1),
    /** Date the learning was incorporated (ISO YYYY-MM-DD). */
    incorporated_date: z.string().regex(ISO_DATE_RE, "incorporated_date must be YYYY-MM-DD"),
  })
  .strict();
export type RevisionLearning = z.infer<typeof revisionLearningSchema>;

/** One published revision of the guide page. */
export const guideRevisionSchema = z
  .object({
    /** Stable revision id (`GR-YYYY-MM-DD-NNN`). */
    id: z.string().regex(REVISION_ID_RE, "id must look like GR-YYYY-MM-DD-NNN"),
    /** Date the revision was published (ISO YYYY-MM-DD). */
    date: z.string().regex(ISO_DATE_RE, "date must be YYYY-MM-DD"),
    /** Short title for the revision. */
    title: z.string().min(1),
    /** One-line summary of what changed in the guide. */
    summary: z.string().min(1),
    /** How the revision was published: through git to main, or recorded manually. */
    published_via: z.enum(["git", "manual"]),
    /** The learnings this revision incorporated (at least one). */
    learnings: z.array(revisionLearningSchema).min(1),
    /** Creation timestamp (ISO 8601). */
    created: z.string().min(1),
  })
  .strict();
export type GuideRevision = z.infer<typeof guideRevisionSchema>;

/** Schema for the whole revisions document. */
export const guideRevisionsSchema = z.object({ revisions: z.array(guideRevisionSchema) }).strict();
export type GuideRevisions = z.infer<typeof guideRevisionsSchema>;

function readJsonFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new GuideRevisionsError(`unable to read ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new GuideRevisionsError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Read and validate the guide revisions store from disk (empty if missing). */
export function readGuideRevisions(path: string = DEFAULT_GUIDE_REVISIONS_PATH): GuideRevisions {
  if (!existsSync(path)) return { revisions: [] };
  const parsed = guideRevisionsSchema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    throw new GuideRevisionsError(`guide revisions at ${path} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Assert that `next` is a strictly-additive successor of `previous`: no revision
 * removed, no existing revision rewritten, no duplicate ids. New revisions are
 * permitted. Throws {@link GuideRevisionsError} on the first violation.
 */
export function assertAdditiveRevisions(previous: GuideRevisions, next: GuideRevisions): void {
  const parsed = guideRevisionsSchema.safeParse(next);
  if (!parsed.success) {
    throw new GuideRevisionsError(`refusing invalid write: ${parsed.error.message}`);
  }

  const nextById = new Map<string, GuideRevision>();
  for (const revision of parsed.data.revisions) {
    if (nextById.has(revision.id)) {
      throw new GuideRevisionsError(`refusing write: duplicate revision id "${revision.id}"`);
    }
    nextById.set(revision.id, revision);
  }

  for (const prev of previous.revisions) {
    const updated = nextById.get(prev.id);
    if (!updated) {
      throw new GuideRevisionsError(`destructive edit rejected: revision "${prev.id}" was deleted`);
    }
    if (JSON.stringify(prev) !== JSON.stringify(updated)) {
      throw new GuideRevisionsError(
        `destructive edit rejected: revision "${prev.id}" was rewritten`,
      );
    }
  }
}

/**
 * Validate and persist `next` to disk, but only if it is a strictly-additive
 * successor of what is currently stored. Returns the validated store.
 */
export function writeGuideRevisions(
  next: GuideRevisions,
  options: { path?: string } = {},
): GuideRevisions {
  const path = options.path ?? DEFAULT_GUIDE_REVISIONS_PATH;
  const previous = readGuideRevisions(path);
  assertAdditiveRevisions(previous, next);
  const validated = guideRevisionsSchema.parse(next);
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
}

/**
 * Next revision id for `date` (ISO YYYY-MM-DD): a global, monotonically
 * increasing sequence across the whole store, zero-padded to three digits.
 */
export function nextRevisionId(revisions: GuideRevisions, date: string): string {
  if (!ISO_DATE_RE.test(date)) {
    throw new GuideRevisionsError(`date must be YYYY-MM-DD, got "${date}"`);
  }
  const seq = revisions.revisions.length + 1;
  return `GR-${date}-${String(seq).padStart(3, "0")}`;
}

/** Append a new revision. Rejects duplicate ids and empty learning lists. */
export function appendRevision(
  revision: GuideRevision,
  options: { path?: string } = {},
): GuideRevision {
  const path = options.path ?? DEFAULT_GUIDE_REVISIONS_PATH;
  const store = readGuideRevisions(path);
  if (store.revisions.some((entry) => entry.id === revision.id)) {
    throw new GuideRevisionsError(`revision id "${revision.id}" already exists`);
  }
  const parsed = guideRevisionSchema.parse(revision);
  writeGuideRevisions({ revisions: [...store.revisions, parsed] }, { path });
  return parsed;
}

/** Find the revision that incorporated a given learning id, if any. */
export function revisionForLearning(
  revisions: GuideRevisions,
  learningId: string,
): GuideRevision | undefined {
  return revisions.revisions.find((revision) =>
    revision.learnings.some((learning) => learning.id === learningId),
  );
}
