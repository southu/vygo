import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getDeployedGitSha, type ApiEnv } from "@vygo/config";
import { countEmailEventsByProviderId, type DatabaseHandle } from "@vygo/db";
import { runEmailRenderSuite } from "@vygo/email";
import { runWorkerLogicSuite } from "@vygo/worker";
import { safeError } from "../errors.js";
import {
  signResendWebhook,
  verifyResendSignature,
  TEST_RESEND_WEBHOOK_SECRET,
} from "../services/resend-webhook.js";
import { resolveWebhookSecret, type ResendWebhookDeps } from "./webhooks-resend.js";

export type DiagnosticsDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  /** Override webhook secret (tests). */
  webhookSecret?: string | null;
};

type SuiteSummary = {
  name: string;
  passed: number;
  failed: number;
  total: number;
};

function summarizeSuite(
  name: string,
  results: Array<{ name: string; pass: boolean }>,
): SuiteSummary {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  return { name, passed, failed, total };
}

/**
 * Live diagnostic surface required for black-box verification of the email worker mission.
 * Never exposes env vars, signing secrets, authorization headers, email bodies, or applicant PII.
 */
export function registerDiagnosticsRoutes(app: FastifyInstance, deps: DiagnosticsDeps): void {
  /**
   * Deployed automated-test results for rendering, worker, webhooks, shutdown, and redaction.
   * Suites run at request time so the report always reflects the deployed build.
   */
  app.get("/v1/diagnostics/tests", async (request, reply) => {
    try {
      const suites: SuiteSummary[] = [];

      // --- React Email rendering (applicant + lead, normal + long, HTML + plain text) ---
      let renderResults: Array<{ name: string; pass: boolean; detail?: string }> = [];
      try {
        const renderSuite = await runEmailRenderSuite();
        renderResults = renderSuite.results;
        suites.push(
          summarizeSuite(
            "react-email rendering (applicant + lead templates, normal-content and long-content, HTML and plain-text)",
            renderResults,
          ),
        );
      } catch (e) {
        suites.push({
          name: "react-email rendering (applicant + lead templates, normal-content and long-content, HTML and plain-text)",
          passed: 0,
          failed: 1,
          total: 1,
        });
        request.log.error(
          { event: "diagnostics_render_suite_failed" },
          e instanceof Error ? e.message : "render suite failed",
        );
      }

      // --- Worker (delivery, retry/backoff/jitter, SKIP LOCKED, exhaustion, dead-letter) ---
      // --- Graceful shutdown + secret redaction are reported as dedicated suites ---
      let workerResults: Array<{ name: string; pass: boolean; detail?: string }> = [];
      try {
        const db = deps.getDb();
        const workerSuite = await runWorkerLogicSuite({ db: db?.db });
        workerResults = workerSuite.results;

        const coreWorker = workerResults.filter(
          (r) =>
            r.name === "successful_delivery" ||
            r.name === "retry_backoff_jitter_bounds" ||
            r.name === "retry_exhaustion_dead_letter" ||
            r.name === "concurrent_skip_locked_claiming" ||
            r.name === "dead_letter_transition",
        );
        suites.push(
          summarizeSuite(
            "worker (successful delivery, retry scheduling with exponential backoff and jitter bounds, concurrent SELECT...FOR UPDATE SKIP LOCKED claiming, retry exhaustion, dead-letter transition)",
            coreWorker.length > 0 ? coreWorker : workerResults,
          ),
        );

        const shutdown = workerResults.filter((r) => r.name === "graceful_shutdown");
        suites.push(
          summarizeSuite(
            "graceful shutdown",
            shutdown.length > 0 ? shutdown : [{ name: "graceful_shutdown", pass: false }],
          ),
        );

        const redaction = workerResults.filter(
          (r) => r.name === "secret_redaction" || r.name.startsWith("secret_redaction:"),
        );
        suites.push(
          summarizeSuite(
            "secret redaction",
            redaction.length > 0 ? redaction : [{ name: "secret_redaction", pass: false }],
          ),
        );
      } catch (e) {
        suites.push({
          name: "worker (successful delivery, retry scheduling with exponential backoff and jitter bounds, concurrent SELECT...FOR UPDATE SKIP LOCKED claiming, retry exhaustion, dead-letter transition)",
          passed: 0,
          failed: 1,
          total: 1,
        });
        suites.push({ name: "graceful shutdown", passed: 0, failed: 1, total: 1 });
        suites.push({ name: "secret redaction", passed: 0, failed: 1, total: 1 });
        request.log.error(
          { event: "diagnostics_worker_suite_failed" },
          e instanceof Error ? e.message : "worker suite failed",
        );
      }

      // --- Webhooks (signature verification, invalid rejection, persistence, dedup) ---
      const webhookResults = await runWebhookSuite(request, deps);
      suites.push(
        summarizeSuite(
          "webhooks (signature verification, invalid-signature rejection, event persistence, duplicate-event deduplication)",
          webhookResults,
        ),
      );

      const commit = getDeployedGitSha() || null;
      const allPassed = suites.every((s) => s.failed === 0 && s.total > 0);

      // Ensure response body never leaks secrets / PII strings from suite details.
      const body = {
        suites,
        generatedAt: new Date().toISOString(),
        commit,
        ready: allPassed,
      };

      const serialized = JSON.stringify(body).toLowerCase();
      if (
        serialized.includes("whsec_") ||
        serialized.includes("authorization") ||
        serialized.includes("api_key") ||
        serialized.includes("resend_webhook_secret")
      ) {
        request.log.error({ event: "diagnostics_tests_leak_guard" }, "blocked unsafe test report");
        return reply
          .status(500)
          .send(safeError("INTERNAL_ERROR", "Test report failed safety checks."));
      }

      return reply.status(200).send(body);
    } catch (error) {
      request.log.error(
        { event: "diagnostics_tests_failed" },
        error instanceof Error ? error.message : "diagnostics tests failed",
      );
      return reply.status(500).send(safeError("INTERNAL_ERROR", "An unexpected error occurred."));
    }
  });
}

async function runWebhookSuite(
  request: FastifyRequest,
  deps: DiagnosticsDeps,
): Promise<Array<{ name: string; pass: boolean; detail?: string }>> {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const record = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail });
  };

  const secretDeps: ResendWebhookDeps = {
    env: deps.env,
    getDb: deps.getDb,
    webhookSecret: deps.webhookSecret,
  };
  const secret = resolveWebhookSecret(secretDeps) || TEST_RESEND_WEBHOOK_SECRET;
  const eventId = `diag-suite-${randomUUID()}`;
  const bodyObj = {
    type: "email.delivered",
    id: eventId,
    data: { email_id: eventId },
    diagnostic: true,
  };
  const rawBody = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000);
  const svixId = eventId;
  const signature = signResendWebhook({
    secret,
    id: svixId,
    timestamp: ts,
    rawBody,
  });

  const app = request.server;

  // Invalid signature → 4xx, must not persist
  {
    const badEventId = `invalid-sig-${randomUUID()}`;
    const bad = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": `bad-${svixId}`,
        "svix-timestamp": String(ts),
        "svix-signature": "v1,notavalidsignature====",
      },
      payload: JSON.stringify({
        type: "email.delivered",
        id: badEventId,
        data: { email_id: badEventId },
      }),
    });
    let notPersisted = true;
    const db = deps.getDb();
    if (db) {
      const count = await countEmailEventsByProviderId(db.db, badEventId);
      notPersisted = count === 0;
    }
    record(
      "invalid_signature_rejection",
      bad.statusCode >= 400 && bad.statusCode < 500 && notPersisted,
      `status=${bad.statusCode}`,
    );
  }

  // Missing signature → 4xx
  {
    const missing = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });
    record(
      "missing_signature_rejection",
      missing.statusCode >= 400 && missing.statusCode < 500,
      `status=${missing.statusCode}`,
    );
  }

  // Valid signature + persistence
  {
    const good = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(ts),
        "svix-signature": signature,
      },
      payload: rawBody,
    });
    const body = good.json() as { data?: { accepted?: boolean } };
    const noSecretLeak =
      !good.body.toLowerCase().includes("whsec_") && !good.body.includes(secret);
    let persisted = good.statusCode >= 200 && good.statusCode < 300;
    const db = deps.getDb();
    if (db && persisted) {
      const count = await countEmailEventsByProviderId(db.db, eventId);
      persisted = count === 1;
    }
    record(
      "signature_verification_and_event_persistence",
      good.statusCode >= 200 &&
        good.statusCode < 300 &&
        body?.data?.accepted === true &&
        noSecretLeak &&
        persisted,
      `status=${good.statusCode}`,
    );
  }

  // Duplicate delivery → 2xx, still one row
  {
    const dup = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(ts),
        "svix-signature": signature,
      },
      payload: rawBody,
    });
    let dedupOk = dup.statusCode >= 200 && dup.statusCode < 300;
    const db = deps.getDb();
    if (db && dedupOk) {
      const count = await countEmailEventsByProviderId(db.db, eventId);
      dedupOk = count === 1;
    }
    record("duplicate_event_deduplication", dedupOk, `status=${dup.statusCode}`);
  }

  // Pure verify helper (signature verification unit)
  {
    const ok = verifyResendSignature({
      secret,
      headers: { id: svixId, timestamp: String(ts), signature },
      rawBody,
    });
    const bad = verifyResendSignature({
      secret,
      headers: { id: svixId, timestamp: String(ts), signature: "v1,aaaa" },
      rawBody,
    });
    record("signature_verification", ok.ok === true && bad.ok === false);
  }

  return results;
}
