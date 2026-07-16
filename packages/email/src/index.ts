/**
 * Shared React Email package — transactional application templates + render helpers.
 */

export const emailPackageName = "@vygo/email" as const;

export {
  EMAIL_KINDS,
  HTML_MESSAGE_PREVIEW_CHARS,
  TEXT_MESSAGE_MAX_CHARS,
  type EmailKind,
  type ApplicantConfirmationPayload,
  type InternalLeadNotificationPayload,
  type ReadinessOpsBriefPayload,
  type RenderedEmail,
} from "./types.js";

export { escapeHtml, prepareMessage, safeDisplayName } from "./sanitize.js";

export {
  ApplicantConfirmationEmail,
  buildApplicantConfirmationSubject,
  buildApplicantConfirmationText,
  buildApplicantConfirmationHtmlFallback,
} from "./templates/applicant-confirmation.js";

export {
  InternalLeadNotificationEmail,
  buildInternalLeadNotificationSubject,
  buildInternalLeadNotificationText,
  buildInternalLeadNotificationHtmlFallback,
} from "./templates/internal-lead-notification.js";

export {
  ReadinessOpsBriefEmail,
  buildReadinessOpsBriefSubject,
  buildReadinessOpsBriefText,
  buildReadinessOpsBriefHtmlFallback,
} from "./templates/readiness-ops-brief.js";

export {
  renderApplicantConfirmation,
  renderInternalLeadNotification,
  renderReadinessOpsBrief,
  runEmailRenderSuite,
} from "./render.js";

/** @deprecated Prefer buildApplicantConfirmationSubject */
export { buildApplicantConfirmationSubject as buildWaitlistConfirmationSubject } from "./templates/applicant-confirmation.js";
/** @deprecated Prefer buildApplicantConfirmationText */
export { buildApplicantConfirmationText as buildWaitlistConfirmationText } from "./templates/applicant-confirmation.js";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type WaitlistConfirmationPayload = {
  fullName: string;
  email: string;
};
