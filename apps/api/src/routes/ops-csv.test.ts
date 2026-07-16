import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpsReadinessCsv } from "./ops.js";
import type { OpsReadinessListRow } from "@vygo/db";

describe("buildOpsReadinessCsv", () => {
  it("emits header and rows without raw paste columns", () => {
    const rows: OpsReadinessListRow[] = [
      {
        id: "7270b255-7537-4f24-a8a6-7e76e9831df5",
        bucket: "Launch",
        createdAt: "2026-07-16T20:04:07.527Z",
        contactName: "Tester",
        contactEmail: "tester+canon@example.com",
        company: "Acme",
        overallScore: 4,
        dimensionScores: { security: 4 },
        discrepancyFlagCount: 0,
        hasBrief: true,
      },
    ];
    const csv = buildOpsReadinessCsv(rows);
    assert.match(csv, /^id,created_at,bucket,/);
    assert.match(csv, /Launch/);
    assert.match(csv, /7270b255-7537-4f24-a8a6-7e76e9831df5/);
    assert.doesNotMatch(csv, /raw_paste|password=|sk-|AKIA|Bearer /i);
  });

  it("escapes commas and quotes", () => {
    const rows: OpsReadinessListRow[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        bucket: "Not a fit",
        createdAt: "2026-07-16T00:00:00.000Z",
        contactName: 'Ada "Dev"',
        contactEmail: null,
        company: "Acme, Inc",
        overallScore: null,
        dimensionScores: null,
        discrepancyFlagCount: 2,
        hasBrief: false,
      },
    ];
    const csv = buildOpsReadinessCsv(rows);
    assert.match(csv, /"Acme, Inc"/);
    assert.match(csv, /"Ada ""Dev"""/);
  });
});
