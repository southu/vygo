/**
 * Build-time access to the unpublished vibe-coding v2 draft artifacts.
 *
 * The source markdown lives at the repo root under drafts/ and is read from
 * disk while the static export is generated — no runtime server code, no
 * new dependency. Server components only: never import from a client
 * component.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const DRAFTS_DIR = path.join(process.cwd(), "../../drafts");

export function readDraftMarkdown(filename: string): string {
  return readFileSync(path.join(DRAFTS_DIR, filename), "utf8");
}
