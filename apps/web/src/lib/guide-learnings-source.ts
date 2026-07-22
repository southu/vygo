/**
 * Build-time snapshot of the guide-progress learnings response.
 *
 * The guide-progress page renders this snapshot into its static HTML (so counts
 * and rows are present in page source) and then re-fetches the live endpoint on
 * load. Both paths share {@link toGuideLearningsResponse}, so the snapshot and
 * the API response are the same shape. Server components only.
 */
import { toGuideLearningsResponse, type GuideLearningsResponse } from "@vygo/validation";
import { readLearningsLog } from "./learnings-source";

/** Read the canonical learnings log at build time and project it for the panel. */
export function readGuideLearningsSnapshot(): GuideLearningsResponse {
  return toGuideLearningsResponse(readLearningsLog().entries);
}
