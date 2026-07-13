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
import { escapeHtml, prepareMessage, safeDisplayName } from "../sanitize.js";
import type { ApplicantConfirmationPayload } from "../types.js";

export type ApplicantConfirmationEmailProps = ApplicantConfirmationPayload;

export function ApplicantConfirmationEmail(props: ApplicantConfirmationEmailProps) {
  const name = safeDisplayName(props.fullName);
  const company = (props.companyName ?? "").trim();
  const msg = prepareMessage(props.message, { htmlPreview: true });

  return (
    <Html>
      <Head />
      <Preview>Your vygo application has been received</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Application received</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>
            Thanks for applying to the next vygo production opening
            {company ? ` for ${company}` : ""}. VYGO LLC will review your application against the
            next available Production Readiness Audit or engineering opening and follow up by email.
            Submitting does not form a client relationship. Services begin only under a separately
            executed agreement.
          </Text>
          {msg.display ? (
            <Section style={box}>
              <Text style={label}>Your note</Text>
              <Text style={pre}>{msg.display}</Text>
              {msg.truncated ? (
                <Text style={muted}>
                  Preview truncated ({msg.originalLength.toLocaleString()} characters total).
                </Text>
              ) : null}
            </Section>
          ) : null}
          <Hr style={hr} />
          <Text style={footer}>
            Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are
            effective when received.
          </Text>
          <Text style={footer}>— the vygo team (VYGO LLC)</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function buildApplicantConfirmationSubject(): string {
  return "You're on the vygo waitlist";
}

export function buildApplicantConfirmationText(payload: ApplicantConfirmationPayload): string {
  const name = safeDisplayName(payload.fullName);
  const company = (payload.companyName ?? "").trim();
  const msg = prepareMessage(payload.message);
  const lines = [
    `Hi ${name},`,
    "",
    `Thanks for applying to the next vygo production opening${company ? ` for ${company}` : ""}.`,
    "VYGO LLC will review your application against the next available Production Readiness Audit or engineering opening and follow up by email.",
    "Submitting does not form a client relationship. Services begin only under a separately executed agreement.",
  ];
  if (msg.display) {
    lines.push("", "Your note:", msg.display);
    if (msg.truncated) {
      lines.push(`(truncated; original length ${msg.originalLength})`);
    }
  }
  lines.push(
    "",
    "Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    "",
    "— the vygo team (VYGO LLC)",
  );
  return lines.join("\n");
}

/** Deterministic HTML without React render (fallback / smoke). */
export function buildApplicantConfirmationHtmlFallback(
  payload: ApplicantConfirmationPayload,
): string {
  const name = escapeHtml(safeDisplayName(payload.fullName));
  const company = escapeHtml((payload.companyName ?? "").trim());
  const msg = prepareMessage(payload.message, { htmlPreview: true });
  const note = msg.display
    ? `<p><strong>Your note</strong></p><pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(msg.display)}</pre>${
        msg.truncated
          ? `<p style="color:#666">Preview truncated (${msg.originalLength} characters total).</p>`
          : ""
      }`
    : "";
  return `<!doctype html><html><body><h1>Application received</h1><p>Hi ${name},</p><p>Thanks for applying to the next vygo production opening${
    company ? ` for ${company}` : ""
  }. VYGO LLC will review your application against the next available Production Readiness Audit or engineering opening and follow up by email. Submitting does not form a client relationship. Services begin only under a separately executed agreement.</p>${note}<p>Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.</p><p>— the vygo team (VYGO LLC)</p></body></html>`;
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
  maxWidth: "560px",
};
const h1 = { fontSize: "22px", fontWeight: "600" as const, color: "#111" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#333" };
const box = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "12px 16px",
  marginTop: "16px",
};
const label = { fontSize: "12px", color: "#666", margin: "0 0 8px" };
const pre = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#222",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  margin: 0,
};
const muted = { fontSize: "12px", color: "#666" };
const hr = { borderColor: "#e6ebf1", margin: "24px 0" };
const footer = { fontSize: "13px", color: "#666" };
