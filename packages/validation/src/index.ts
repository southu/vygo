import { z } from "zod";

/** Shared Zod schemas for web and API (waitlist, availability). */

export const availabilityStatusSchema = z.enum(["open", "waitlist", "paused"]);

export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

export const publicAvailabilitySchema = z.object({
  status: availabilityStatusSchema,
  nextOpeningLabel: z.string().nullable(),
  nextOpeningAt: z.string().datetime().nullable(),
  message: z.string().nullable(),
});

export type PublicAvailability = z.infer<typeof publicAvailabilitySchema>;

export const waitlistApplicationSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).optional(),
  productUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  stage: z
    .enum(["prototype", "early_users", "growing", "enterprise_pressure", "other"])
    .default("prototype"),
  urgency: z.enum(["exploring", "this_quarter", "immediate"]).default("exploring"),
  notes: z.string().trim().max(4000).optional(),
  turnstileToken: z.string().min(1).optional(),
});

export type WaitlistApplication = z.infer<typeof waitlistApplicationSchema>;
