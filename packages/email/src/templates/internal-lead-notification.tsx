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
import type { InternalLeadNotificationPayload } from "../types.js";

export type InternalLeadNotificationEmailProps = InternalLeadNotificationPayload;

export function InternalLeadNotificationEmail(props: InternalLeadNotificationEmailProps) {
  const name = safeDisplayName(props.fullName);
  const msg = prepareMessage(props.message, { htmlPreview: true });
  const consent =
    props.marketingConsent === true
      ? "granted"
      : props.marketingConsent === false
        ? "denied"
        : "omitted";

  return (
    <Html>
      <Head />
      <Preview>New waitlist application</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New waitlist lead</Heading>
          <Text style={text}>
            <strong>{name}</strong> at <strong>{props.companyName}</strong> submitted an
            application.
          </Text>
          <Section style={box}>
            <Text style={row}>
              <strong>Product:</strong> {props.productUrl}
            </Text>
            <Text style={row}>
              <strong>Stage:</strong> {props.stage}
            </Text>
            <Text style={row}>
              <strong>Blocker:</strong> {props.primaryBlocker}
            </Text>
            <Text style={row}>
              <strong>Desired start:</strong> {props.desiredStart}
            </Text>
            {props.priorityScore != null ? (
              <Text style={row}>
                <strong>Priority score:</strong> {props.priorityScore}
              </Text>
            ) : null}
            <Text style={row}>
              <strong>Marketing consent:</strong> {consent}
            </Text>
            {props.applicationId ? (
              <Text style={row}>
                <strong>Application id:</strong> {props.applicationId}
              </Text>
            ) : null}
          </Section>
          <Section style={box}>
            <Text style={label}>Message</Text>
            <Text style={pre}>{msg.display || "(empty)"}</Text>
            {msg.truncated ? (
              <Text style={muted}>
                Preview truncated ({msg.originalLength.toLocaleString()} characters total).
              </Text>
            ) : null}
          </Section>
          <Hr style={hr} />
          <Text style={footer}>Transactional internal notification — not marketing mail.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function buildInternalLeadNotificationSubject(
  payload: InternalLeadNotificationPayload,
): string {
  const company = (payload.companyName || "Unknown").trim().slice(0, 80);
  return `New waitlist application — ${company}`;
}

export function buildInternalLeadNotificationText(
  payload: InternalLeadNotificationPayload,
): string {
  const name = safeDisplayName(payload.fullName);
  const msg = prepareMessage(payload.message);
  const consent =
    payload.marketingConsent === true
      ? "granted"
      : payload.marketingConsent === false
        ? "denied"
        : "omitted";
  const lines = [
    "New waitlist lead",
    "",
    `Name: ${name}`,
    `Company: ${payload.companyName}`,
    `Product: ${payload.productUrl}`,
    `Stage: ${payload.stage}`,
    `Blocker: ${payload.primaryBlocker}`,
    `Desired start: ${payload.desiredStart}`,
  ];
  if (payload.priorityScore != null) {
    lines.push(`Priority score: ${payload.priorityScore}`);
  }
  lines.push(`Marketing consent: ${consent}`);
  if (payload.applicationId) {
    lines.push(`Application id: ${payload.applicationId}`);
  }
  lines.push("", "Message:", msg.display || "(empty)");
  if (msg.truncated) {
    lines.push(`(truncated; original length ${msg.originalLength})`);
  }
  lines.push("", "Transactional internal notification — not marketing mail.");
  return lines.join("\n");
}

export function buildInternalLeadNotificationHtmlFallback(
  payload: InternalLeadNotificationPayload,
): string {
  const name = escapeHtml(safeDisplayName(payload.fullName));
  const company = escapeHtml(payload.companyName);
  const msg = prepareMessage(payload.message, { htmlPreview: true });
  return `<!doctype html><html><body><h1>New waitlist lead</h1><p><strong>${name}</strong> at <strong>${company}</strong></p><p>Product: ${escapeHtml(payload.productUrl)}</p><p>Stage: ${escapeHtml(payload.stage)}</p><pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(msg.display || "(empty)")}</pre></body></html>`;
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
const footer = { fontSize: "12px", color: "#666" };
