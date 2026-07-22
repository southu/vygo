/**
 * guide-update — repeatable workflow that turns pending learnings into
 * published revisions of the /vibe-coding/ratchet-guide page, with a human
 * review gate between drafting and publishing.
 *
 * Stages (see the mission / README):
 *   SELECT + DRAFT   guide-update draft --learning <id> [...] --title T --summary S
 *   (human review)   inspect guide-drafts/<revision-id>.md and the working-tree diff
 *   PUBLISH          guide-update approve <revision-id> [--commit] [--push]
 *   MANUAL PUBLISH   guide-update record-publish <revision-id>   (CMS/paste fallback)
 *   STATUS           guide-update status
 *
 * DRAFT only writes a review draft and flips the selected learnings to `draft`
 * in the working tree — it never commits, pushes, or deploys. PUBLISH is the
 * explicit approval step: it flips the learnings to `incorporated`, records a
 * guide revision (with a revision id naming each learning), and — only when
 * asked — commits/pushes so the normal deploy pipeline ships it.
 *
 * No publish/deploy credentials are read here. Any git push relies on the
 * ambient credential helper / environment configured OUTSIDE this repo; nothing
 * is echoed. Generated draft/revision copy is scrubbed for credential material
 * by the workflow core before it is written anywhere.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDraft,
  publishDraft,
  GuideUpdateError,
  type DraftRevision,
} from "@vygo/validation/guide-update";
import { readGuideRevisions } from "@vygo/validation/guide-revisions";
import { readLog } from "@vygo/validation/learnings-log";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const DRAFTS_DIR = path.join(repoRoot, "guide-drafts");
const LOG_PATH = path.join(repoRoot, "data", "ratchet-learnings.json");
const REVISIONS_PATH = path.join(repoRoot, "data", "guide-revisions.json");
const GUIDE_PAGE_REL = "apps/web/src/app/vibe-coding/ratchet-guide/page.tsx";

function die(message: string): never {
  process.stderr.write(`guide-update: ${message}\n`);
  process.exit(1);
}

/** Minimal flag parser: repeatable --learning, single-value --title/--summary/--date, booleans. */
function parseFlags(argv: string[]): {
  learnings: string[];
  values: Record<string, string>;
  bools: Set<string>;
  positional: string[];
} {
  const learnings: string[] = [];
  const values: Record<string, string> = {};
  const bools = new Set<string>();
  const positional: string[] = [];
  const singleValue = new Set(["title", "summary", "date"]);
  const boolFlags = new Set(["commit", "push", "manual"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--learning" || arg === "-l") {
      const value = argv[++i];
      if (!value) die("--learning requires a learning id");
      learnings.push(value);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (boolFlags.has(key)) {
        bools.add(key);
      } else if (singleValue.has(key)) {
        const value = argv[++i];
        if (value === undefined) die(`--${key} requires a value`);
        values[key] = value;
      } else {
        die(`unknown flag: ${arg}`);
      }
    } else {
      positional.push(arg);
    }
  }
  return { learnings, values, bools, positional };
}

/** Today as ISO YYYY-MM-DD (UTC). Overridable with --date for reproducibility. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function draftJsonPath(revisionId: string): string {
  return path.join(DRAFTS_DIR, `${revisionId}.json`);
}

function draftMarkdownPath(revisionId: string): string {
  return path.join(DRAFTS_DIR, `${revisionId}.md`);
}

function writeDraftFiles(draft: DraftRevision): void {
  mkdirSync(DRAFTS_DIR, { recursive: true });
  writeFileSync(draftJsonPath(draft.id), `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  const md = [
    `# Draft guide revision ${draft.id}`,
    "",
    `- Date: ${draft.date}`,
    `- Title: ${draft.title}`,
    `- Summary: ${draft.summary}`,
    `- Learnings: ${draft.learnings.map((l) => `${l.name} (${l.id})`).join("; ")}`,
    "",
    "## Proposed changelog entry (revision history)",
    "",
    draft.changelog_markdown.trim(),
    "",
    "## Ready-to-paste guide section edits",
    "",
    draft.section_edits_markdown.trim(),
    "",
    "## How to publish",
    "",
    "Review the diff on the learnings log and this draft, then run:",
    "",
    `    pnpm guide-update approve ${draft.id} --commit --push`,
    "",
    "or, if the guide page is edited/pasted manually (CMS), run:",
    "",
    `    pnpm guide-update record-publish ${draft.id}`,
    "",
  ].join("\n");
  writeFileSync(draftMarkdownPath(draft.id), `${md}\n`, "utf8");
}

function loadDraft(revisionId: string): DraftRevision {
  const file = draftJsonPath(revisionId);
  if (!existsSync(file)) {
    die(`no draft found for ${revisionId} (expected ${path.relative(repoRoot, file)}).`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as DraftRevision;
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function cmdDraft(argv: string[]): void {
  const { learnings, values } = parseFlags(argv);
  if (learnings.length === 0) die("draft requires at least one --learning <id>");
  const title = values.title;
  const summary = values.summary;
  if (!title) die("draft requires --title <text>");
  if (!summary) die("draft requires --summary <text>");
  const date = values.date ?? todayIso();

  let draft: DraftRevision;
  try {
    draft = buildDraft(
      { learningIds: learnings, date, title, summary },
      { logPath: LOG_PATH, revisionsPath: REVISIONS_PATH },
    );
  } catch (err) {
    die(err instanceof Error ? err.message : String(err));
  }
  writeDraftFiles(draft);

  process.stdout.write(
    [
      `Drafted revision ${draft.id} (held for review — nothing published).`,
      `  learnings drafted: ${draft.learnings.map((l) => l.id).join(", ")}`,
      `  review file:       ${path.relative(repoRoot, draftMarkdownPath(draft.id))}`,
      `  learnings log now shows these entries as "draft" (uncommitted review area).`,
      "",
      `Approve with:  pnpm guide-update approve ${draft.id} --commit --push`,
      `Discard with:  git checkout ${path.relative(repoRoot, LOG_PATH)} && rm -rf ${path.relative(
        repoRoot,
        DRAFTS_DIR,
      )}`,
      "",
    ].join("\n"),
  );
}

function cmdPublish(argv: string[], opts: { manual: boolean }): void {
  const { positional, bools } = parseFlags(argv);
  const revisionId = positional[0];
  if (!revisionId) die(`${opts.manual ? "record-publish" : "approve"} requires a <revision-id>`);
  const draft = loadDraft(revisionId);
  const publishedVia = opts.manual ? "manual" : "git";

  let result;
  try {
    result = publishDraft(draft, {
      logPath: LOG_PATH,
      revisionsPath: REVISIONS_PATH,
      publishedVia,
    });
  } catch (err) {
    if (err instanceof GuideUpdateError) die(err.message);
    die(err instanceof Error ? err.message : String(err));
  }

  // Consume the draft file now that it is published/recorded.
  rmSync(draftJsonPath(revisionId), { force: true });
  rmSync(draftMarkdownPath(revisionId), { force: true });

  process.stdout.write(
    [
      `Published revision ${result.revision.id} (${publishedVia}).`,
      `  incorporated: ${result.incorporated.map((e) => e.id).join(", ")}`,
      `  incorporated_date: ${draft.date}`,
      "",
    ].join("\n"),
  );

  if (opts.manual) {
    process.stdout.write(
      "Recorded a manual publish. Paste the ready-to-publish content from the draft into the CMS if you have not already.\n",
    );
    return;
  }

  if (bools.has("commit")) {
    const message = `docs(ratchet-guide): publish revision ${result.revision.id}\n\nIncorporates: ${result.incorporated
      .map((e) => e.id)
      .join(", ")}`;
    git(["add", "data/ratchet-learnings.json", "data/guide-revisions.json", GUIDE_PAGE_REL]);
    git(["commit", "-m", message]);
    process.stdout.write(`Committed revision ${result.revision.id} to the current branch.\n`);
    if (bools.has("push")) {
      git(["push", "origin", "HEAD:main"]);
      process.stdout.write("Pushed to origin/main — the normal deploy pipeline will ship it.\n");
    }
  } else {
    process.stdout.write(
      "Stores updated. Review the diff, then commit data/ratchet-learnings.json, data/guide-revisions.json,\n" +
        `and ${GUIDE_PAGE_REL} to main to deploy (or re-run with --commit --push).\n`,
    );
  }
}

function cmdStatus(): void {
  const log = readLog(LOG_PATH);
  const counts: Record<string, number> = {};
  for (const entry of log.entries) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  const revisions = readGuideRevisions(REVISIONS_PATH);
  const openDrafts = existsSync(DRAFTS_DIR)
    ? readdirSync(DRAFTS_DIR).filter((f) => f.endsWith(".json"))
    : [];

  process.stdout.write(
    [
      "Learnings log:",
      `  pending-in-guide: ${counts["pending-in-guide"] ?? 0}`,
      `  draft:            ${counts["draft"] ?? 0}`,
      `  incorporated:     ${counts["incorporated"] ?? 0}`,
      "",
      `Published guide revisions: ${revisions.revisions.length}`,
      ...revisions.revisions.map(
        (r) => `  ${r.id} (${r.date}) — ${r.learnings.map((l) => l.id).join(", ")}`,
      ),
      "",
      `Open drafts awaiting approval: ${openDrafts.length}`,
      ...openDrafts.map((f) => `  ${f.replace(/\.json$/, "")}`),
      "",
    ].join("\n"),
  );
}

function usage(): void {
  process.stdout.write(
    [
      "Usage: guide-update <command>",
      "",
      "  draft --learning <id> [--learning <id>...] --title <t> --summary <s> [--date YYYY-MM-DD]",
      "      SELECT + DRAFT: propose a held revision for the given pending learnings.",
      "  approve <revision-id> [--commit] [--push]",
      "      PUBLISH: flip drafted learnings to incorporated, record the revision,",
      "      and (with --commit/--push) ship it via the normal deploy pipeline.",
      "  record-publish <revision-id>",
      "      MANUAL PUBLISH: record a manual/CMS paste publish (no git).",
      "  status",
      "      Show pending/draft/incorporated counts, revisions, and open drafts.",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "draft":
      cmdDraft(rest);
      break;
    case "approve":
    case "publish":
      cmdPublish(rest, { manual: false });
      break;
    case "record-publish":
      cmdPublish(rest, { manual: true });
      break;
    case "status":
      cmdStatus();
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      die(`unknown command: ${command} (try "guide-update help")`);
  }
}

main();
