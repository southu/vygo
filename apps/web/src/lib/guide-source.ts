/**
 * Build-time access to the sanitized Ratchet guide pack.
 *
 * The pack lives at the repo root under content/vibe-coding/ratchet-guide/ and
 * is read from disk while the static export is generated — no runtime server
 * code, no new dependency. Server components only: never import from a client
 * component.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const PACK_DIR = path.join(process.cwd(), "../../content/vibe-coding/ratchet-guide");

export type GuidePackManifest = {
  name: string;
  title: string;
  version: string;
  description: string;
  basePath: string;
  documents: { filename: string; title: string }[];
};

/** Raw markdown source of one pack document (e.g. "overview.md"). */
export function readGuideDocMarkdown(filename: string): string {
  return readFileSync(path.join(PACK_DIR, filename), "utf8");
}

/** Parsed pack manifest (document list, version, titles). */
export function readGuidePackManifest(): GuidePackManifest {
  return JSON.parse(
    readFileSync(path.join(PACK_DIR, "manifest.json"), "utf8"),
  ) as GuidePackManifest;
}
