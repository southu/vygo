/** Shared email payload types for transactional application mail. */

export const EMAIL_KINDS = {
  applicantConfirmation: "applicant_confirmation",
  internalLeadNotification: "internal_lead_notification",
  readinessOpsBrief: "readiness_ops_brief",
} as const;

export type EmailKind = (typeof EMAIL_KINDS)[keyof typeof EMAIL_KINDS];

export type ApplicantConfirmationPayload = {
  fullName: string;
  companyName?: string | null;
  /** Applicant message (may be unusually long). */
  message?: string | null;
};

export type InternalLeadNotificationPayload = {
  fullName: string;
  companyName: string;
  productUrl: string;
  stage: string;
  primaryBlocker: string;
  desiredStart: string;
  message: string;
  priorityScore?: number | null;
  marketingConsent?: boolean | null;
  applicationId?: string | null;
};

/** Internal ops brief for a completed readiness submission (no secrets). */
export type ReadinessOpsBriefPayload = {
  submissionId?: string | null;
  briefId?: string | null;
  brief: Record<string, unknown>;
};

export type RenderedEmail = {
  kind: EmailKind | string;
  subject: string;
  html: string;
  text: string;
};

/** Soft cap for HTML preview of free-text fields (full value still in plain text when short). */
export const HTML_MESSAGE_PREVIEW_CHARS = 2_000;
export const TEXT_MESSAGE_MAX_CHARS = 20_000;
