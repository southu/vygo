/**
 * Library surface for the email worker (safe to import from the API).
 * Process entrypoint is `index.ts`.
 */

export { createEmailWorker, type EmailWorkerHandle, type EmailWorkerOptions } from "./worker.js";
export { processOutboxJob } from "./process-job.js";
export {
  createEmailTransport,
  MockEmailTransport,
  ResendTransport,
  type EmailTransport,
  type SendEmailInput,
  type SendEmailResult,
} from "./transport.js";
export { redactString, redactValue, runSecretRedactionSuite, safeLog } from "./redact.js";
export { runWorkerLogicSuite } from "./suite.js";
