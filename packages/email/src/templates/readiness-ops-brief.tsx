import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { escapeHtml, safeDisplayName } from "../sanitize.js";
import type { ReadinessOpsBriefPayload } from "../types.js";

export type ReadinessOpsBriefEmailProps = ReadinessOpsBriefPayload;

function str(value: unknown, fallback = "—"): string {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const t = value.trim();
    return t || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function ReadinessOpsBriefEmail(props: ReadinessOpsBriefEmailProps) {
  const brief = props.brief ?? {};
  const contact =
    brief.contact && typeof brief.contact === "object"
      ? (brief.contact as Record<string, unknown>)
      : {};
  const name = safeDisplayName(String(contact.name ?? contact.fullName ?? "Unknown"));
  const company = str(brief.company ?? contact.company ?? contact.companyName);
  const bucket = str(brief.bucket);
  const talkingPoints = Array.isArray(brief.talkingPoints)
    ? (brief.talkingPoints as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const scoreSummary =
    brief.scoreSummary && typeof brief.scoreSummary === "object"
      ? (brief.scoreSummary as Record<string, unknown>)
      : {};
  const dimensions =
    scoreSummary.dimensions && typeof scoreSummary.dimensions === "object"
      ? (scoreSummary.dimensions as Record<string, unknown>)
      : {};
  const blockers = Array.isArray(brief.blockers)
    ? (brief.blockers as unknown[]).filter((b): b is string => typeof b === "string")
    : [];
  const flags = Array.isArray(brief.discrepancyFlags) ? brief.discrepancyFlags : [];

  return (
    <Html>
      <Head />
      <Preview>
        Readiness lead brief — {company} ({bucket})
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Readiness lead brief</Heading>
          <Text style={text}>
            <strong>{name}</strong> at <strong>{company}</strong> completed a readiness check.
          </Text>
          <Section style={box}>
            <Text style={row}>
              <strong>Bucket:</strong> {bucket}
            </Text>
            <Text style={row}>
              <strong>Source:</strong> {str(brief.source)}
            </Text>
            <Text style={row}>
              <strong>Product:</strong> {str(brief.productOneLiner)}
            </Text>
            <Text style={row}>
              <strong>Build tool:</strong> {str(brief.buildTool)}
            </Text>
            <Text style={row}>
              <strong>Blockers:</strong> {blockers.length ? blockers.join("; ") : "—"}
            </Text>
            <Text style={row}>
              <strong>Deadline:</strong> {str(brief.deadline)}
              {brief.deadlineDetail ? ` (${str(brief.deadlineDetail)})` : ""}
            </Text>
            <Text style={row}>
              <strong>Budget:</strong> {str(brief.budget)}
            </Text>
            <Text style={row}>
              <strong>Submission id:</strong> {str(props.submissionId ?? brief.submissionId)}
            </Text>
          </Section>
          <Section style={box}>
            <Text style={label}>Five-dimension scores</Text>
            {Object.keys(dimensions).length === 0 ? (
              <Text style={row}>—</Text>
            ) : (
              Object.entries(dimensions).map(([k, v]) => (
                <Text key={k} style={row}>
                  <strong>{k}:</strong> {str(v)}
                </Text>
              ))
            )}
            <Text style={row}>
              <strong>Reasoning:</strong> {str(scoreSummary.reasoning ?? brief.reasoning)}
            </Text>
          </Section>
          <Section style={box}>
            <Text style={label}>Talking points</Text>
            {talkingPoints.length === 0 ? (
              <Text style={row}>—</Text>
            ) : (
              talkingPoints.slice(0, 3).map((p, i) => (
                <Text key={i} style={row}>
                  {i + 1}. {p}
                </Text>
              ))
            )}
          </Section>
          <Section style={box}>
            <Text style={row}>
              <strong>Discrepancy flags:</strong> {flags.length}
            </Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            Internal transactional brief — template-generated; never marketing mail.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function buildReadinessOpsBriefSubject(payload: ReadinessOpsBriefPayload): string {
  const brief = payload.brief ?? {};
  const company = str(brief.company, "Unknown").slice(0, 80);
  const bucket = str(brief.bucket, "").slice(0, 40);
  return bucket
    ? `Readiness lead brief — ${company} (${bucket})`
    : `Readiness lead brief — ${company}`;
}

export function buildReadinessOpsBriefText(payload: ReadinessOpsBriefPayload): string {
  const brief = payload.brief ?? {};
  const contact =
    brief.contact && typeof brief.contact === "object"
      ? (brief.contact as Record<string, unknown>)
      : {};
  const name = safeDisplayName(String(contact.name ?? contact.fullName ?? "Unknown"));
  const company = str(brief.company ?? contact.company);
  const talkingPoints = Array.isArray(brief.talkingPoints)
    ? (brief.talkingPoints as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const scoreSummary =
    brief.scoreSummary && typeof brief.scoreSummary === "object"
      ? (brief.scoreSummary as Record<string, unknown>)
      : {};
  const dimensions =
    scoreSummary.dimensions && typeof scoreSummary.dimensions === "object"
      ? (scoreSummary.dimensions as Record<string, unknown>)
      : {};
  const blockers = Array.isArray(brief.blockers)
    ? (brief.blockers as unknown[]).filter((b): b is string => typeof b === "string")
    : [];
  const flags = Array.isArray(brief.discrepancyFlags) ? brief.discrepancyFlags : [];

  const lines = [
    "Readiness lead brief",
    "",
    `Name: ${name}`,
    `Company: ${company}`,
    `Bucket: ${str(brief.bucket)}`,
    `Source: ${str(brief.source)}`,
    `Product: ${str(brief.productOneLiner)}`,
    `Build tool: ${str(brief.buildTool)}`,
    `Blockers: ${blockers.length ? blockers.join("; ") : "—"}`,
    `Deadline: ${str(brief.deadline)}`,
    `Budget: ${str(brief.budget)}`,
    `Submission id: ${str(payload.submissionId ?? brief.submissionId)}`,
    "",
    "Five-dimension scores:",
  ];
  for (const [k, v] of Object.entries(dimensions)) {
    lines.push(`  ${k}: ${str(v)}`);
  }
  lines.push(`Reasoning: ${str(scoreSummary.reasoning ?? brief.reasoning)}`);
  lines.push("", "Talking points:");
  talkingPoints.slice(0, 3).forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
  lines.push("", `Discrepancy flags: ${flags.length}`);
  if (brief.parsedTechReport && typeof brief.parsedTechReport === "object") {
    lines.push("", "Parsed tech report (summary):");
    for (const [k, v] of Object.entries(brief.parsedTechReport as Record<string, unknown>)) {
      if (v == null) continue;
      lines.push(
        `  ${k}: ${typeof v === "string" ? v.slice(0, 200) : JSON.stringify(v).slice(0, 200)}`,
      );
    }
  }
  lines.push("", "Internal transactional brief — template-generated.");
  return lines.join("\n");
}

export function buildReadinessOpsBriefHtmlFallback(payload: ReadinessOpsBriefPayload): string {
  const brief = payload.brief ?? {};
  const company = escapeHtml(str(brief.company, "Unknown"));
  const bucket = escapeHtml(str(brief.bucket));
  const talkingPoints = Array.isArray(brief.talkingPoints)
    ? (brief.talkingPoints as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const pointsHtml = talkingPoints
    .slice(0, 3)
    .map((p, i) => `<li>${escapeHtml(p)}</li>`)
    .join("");
  return `<!doctype html><html><body><h1>Readiness lead brief</h1><p><strong>${company}</strong> — ${bucket}</p><p>Product: ${escapeHtml(str(brief.productOneLiner))}</p><ol>${pointsHtml}</ol></body></html>`;
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "24px 24px 48px",
  maxWidth: "640px",
};
const h1 = { fontSize: "22px", fontWeight: "600" as const, color: "#111" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#333" };
const box = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "12px 16px",
  marginTop: "12px",
};
const row = { fontSize: "13px", lineHeight: "20px", color: "#222", margin: "4px 0" };
const label = { fontSize: "12px", color: "#666", margin: "0 0 8px" };
const hr = { borderColor: "#e6ebf1", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#666" };
