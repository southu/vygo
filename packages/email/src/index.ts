/**
 * Shared email package scaffold (React Email templates added later).
 */

export const emailPackageName = "@vygo/email" as const;

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

export function buildWaitlistConfirmationSubject(): string {
  return "You're on the vygo waitlist";
}

export function buildWaitlistConfirmationText(payload: WaitlistConfirmationPayload): string {
  return [
    `Hi ${payload.fullName},`,
    "",
    "Thanks for applying to the next vygo production opening.",
    "We'll review your application and follow up by email.",
    "",
    "— the vygo team",
  ].join("\n");
}
