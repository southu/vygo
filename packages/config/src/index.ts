import { z } from "zod";

/**
 * Typed environment validation for Vygo services.
 * Secrets are never logged; only presence and shape are validated.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const webEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_API_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  COMMIT_SHA: z.preprocess(emptyToUndefined, z.string().optional()),
  VERCEL_GIT_COMMIT_SHA: z.preprocess(emptyToUndefined, z.string().optional()),
});

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  TURNSTILE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CORS_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWebEnv(env: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(env);
}

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return apiEnvSchema.parse(env);
}

export function loadWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return workerEnvSchema.parse(env);
}

export function getDeployedGitSha(env: NodeJS.ProcessEnv = process.env): string {
  const sha =
    env.VERCEL_GIT_COMMIT_SHA || env.COMMIT_SHA || env.GIT_COMMIT_SHA || env.GITHUB_SHA || "";
  return sha.trim();
}
