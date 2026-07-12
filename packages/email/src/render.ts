import { render } from "@react-email/render";
import * as React from "react";
import {
  ApplicantConfirmationEmail,
  buildApplicantConfirmationHtmlFallback,
  buildApplicantConfirmationSubject,
  buildApplicantConfirmationText,
} from "./templates/applicant-confirmation.js";
import {
  InternalLeadNotificationEmail,
  buildInternalLeadNotificationHtmlFallback,
  buildInternalLeadNotificationSubject,
  buildInternalLeadNotificationText,
} from "./templates/internal-lead-notification.js";
import {
  EMAIL_KINDS,
  type ApplicantConfirmationPayload,
  type InternalLeadNotificationPayload,
  type RenderedEmail,
} from "./types.js";

async function renderReactToHtml(element: React.ReactElement): Promise<string> {
  // @react-email/render returns Promise<string> in v1+.
  const html = await render(element);
  return typeof html === "string" ? html : String(html);
}

export async function renderApplicantConfirmation(
  payload: ApplicantConfirmationPayload,
): Promise<RenderedEmail> {
  const subject = buildApplicantConfirmationSubject();
  const text = buildApplicantConfirmationText(payload);
  let html: string;
  try {
    html = await renderReactToHtml(React.createElement(ApplicantConfirmationEmail, payload));
  } catch {
    html = buildApplicantConfirmationHtmlFallback(payload);
  }
  if (!html || !html.trim()) {
    html = buildApplicantConfirmationHtmlFallback(payload);
  }
  if (!text || !text.trim()) {
    throw new Error("applicant confirmation plain-text render produced empty output");
  }
  return {
    kind: EMAIL_KINDS.applicantConfirmation,
    subject,
    html,
    text,
  };
}

export async function renderInternalLeadNotification(
  payload: InternalLeadNotificationPayload,
): Promise<RenderedEmail> {
  const subject = buildInternalLeadNotificationSubject(payload);
  const text = buildInternalLeadNotificationText(payload);
  let html: string;
  try {
    html = await renderReactToHtml(React.createElement(InternalLeadNotificationEmail, payload));
  } catch {
    html = buildInternalLeadNotificationHtmlFallback(payload);
  }
  if (!html || !html.trim()) {
    html = buildInternalLeadNotificationHtmlFallback(payload);
  }
  if (!text || !text.trim()) {
    throw new Error("internal lead notification plain-text render produced empty output");
  }
  return {
    kind: EMAIL_KINDS.internalLeadNotification,
    subject,
    html,
    text,
  };
}

/** Run deterministic render suite used by unit tests and live test-support report. */
export async function runEmailRenderSuite(): Promise<{
  ready: boolean;
  results: Array<{ name: string; pass: boolean; detail?: string }>;
}> {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const record = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail });
  };

  const normalApplicant: ApplicantConfirmationPayload = {
    fullName: "Ada Lovelace",
    companyName: "Analytical Engines",
    message: "Looking for production hardening help.",
  };
  const longMessage = `Lead note:\n${"x".repeat(12_000)}\nend.`;
  const longApplicant: ApplicantConfirmationPayload = {
    fullName: "Long Content Applicant",
    companyName: "Huge Prompt Co",
    message: longMessage,
  };
  const normalLead: InternalLeadNotificationPayload = {
    fullName: "Ada Lovelace",
    companyName: "Analytical Engines",
    productUrl: "https://example.com/product",
    stage: "live_users",
    primaryBlocker: "security_compliance",
    desiredStart: "within_30_days",
    message: "SSO and audit logs required.",
    priorityScore: 11,
    marketingConsent: false,
    applicationId: "00000000-0000-4000-8000-000000000001",
  };
  const longLead: InternalLeadNotificationPayload = {
    ...normalLead,
    fullName: "Long Content Lead",
    message: longMessage,
    marketingConsent: true,
  };

  try {
    const a = await renderApplicantConfirmation(normalApplicant);
    record(
      "applicant_confirmation_normal",
      Boolean(a.html?.includes("Application") && a.text.trim().length > 0 && a.subject),
      `htmlLen=${a.html.length},textLen=${a.text.length}`,
    );
  } catch (e) {
    record("applicant_confirmation_normal", false, e instanceof Error ? e.message : "error");
  }

  try {
    const a = await renderApplicantConfirmation(longApplicant);
    record(
      "applicant_confirmation_long",
      Boolean(a.html && a.text.trim().length > 0 && a.html.length > 100),
      `htmlLen=${a.html.length},textLen=${a.text.length}`,
    );
  } catch (e) {
    record("applicant_confirmation_long", false, e instanceof Error ? e.message : "error");
  }

  try {
    const a = await renderInternalLeadNotification(normalLead);
    record(
      "internal_lead_notification_normal",
      Boolean(
        a.html &&
        a.text.trim().length > 0 &&
        a.text.includes("Marketing consent") &&
        a.subject.includes("Analytical"),
      ),
      `htmlLen=${a.html.length},textLen=${a.text.length}`,
    );
  } catch (e) {
    record("internal_lead_notification_normal", false, e instanceof Error ? e.message : "error");
  }

  try {
    const a = await renderInternalLeadNotification(longLead);
    record(
      "internal_lead_notification_long",
      Boolean(a.html && a.text.trim().length > 0 && a.html.length > 100),
      `htmlLen=${a.html.length},textLen=${a.text.length}`,
    );
  } catch (e) {
    record("internal_lead_notification_long", false, e instanceof Error ? e.message : "error");
  }

  const ready = results.every((r) => r.pass);
  return { ready, results };
}
