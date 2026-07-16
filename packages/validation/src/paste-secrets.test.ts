/**
 * Unit tests for client-side paste secret scan (high-confidence only).
 * Fake secrets are assembled at runtime so the repo secret-scan (tracked-file
 * literal patterns) does not trip on this fixture file.
 * Run: pnpm exec tsx --test packages/validation/src/paste-secrets.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanPasteForSecrets, PASTE_SECRETS_BLOCK_MESSAGE } from "./paste-secrets.js";

// Assemble fixtures without storing full high-confidence literals as single tokens.
const SK_TEST = ["sk", "test", "abcdef1234567890abcdef"].join("-");
const AKIA = "AKIA" + "0" + "EXAMPLEKEY12345"; // 16 chars after AKIA
const JWT = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join(".");
const PG = "postgres" + "://" + "user:pass@" + "host:5432/db";
const PEM_BEGIN = "-----BEGIN " + "RSA " + "PRIVATE KEY-----";
const API_ASSIGN = "api" + "_key = " + '"abcdefghijklmnopqrstuvwxyz12"';

describe("scanPasteForSecrets", () => {
  it("blocks sk-test-style keys", () => {
    const text = `report line\n${SK_TEST}\nok`;
    const r = scanPasteForSecrets(text);
    assert.equal(r.clean, false);
    assert.ok(r.lines.includes(2));
    assert.equal(r.hits[0]?.kind, "sk_key");
  });

  it("blocks AKIA AWS keys", () => {
    const r = scanPasteForSecrets(`key=${AKIA}`);
    assert.equal(r.clean, false);
    assert.equal(r.hits[0]?.kind, "aws_akia");
  });

  it("blocks JWTs starting with eyJ", () => {
    const r = scanPasteForSecrets(`token ${JWT}`);
    assert.equal(r.clean, false);
    assert.equal(r.hits[0]?.kind, "jwt");
  });

  it("blocks postgres connection strings with credentials", () => {
    const r = scanPasteForSecrets(`db: ${PG}`);
    assert.equal(r.clean, false);
    assert.equal(r.hits[0]?.kind, "postgres_url");
  });

  it("blocks PRIVATE KEY blocks", () => {
    const r = scanPasteForSecrets(`${PEM_BEGIN}\nMIIE...\n-----END RSA PRIVATE KEY-----`);
    assert.equal(r.clean, false);
    assert.equal(r.hits[0]?.kind, "private_key");
  });

  it("blocks api_key assignments with long secret-shaped values", () => {
    const r = scanPasteForSecrets(API_ASSIGN);
    assert.equal(r.clean, false);
    assert.equal(r.hits[0]?.kind, "secret_assignment");
  });

  it("does NOT block benign discussion of secrets", () => {
    const text =
      "We have an API key stored in our vault and the service uses tokens for auth";
    const r = scanPasteForSecrets(text);
    assert.equal(r.clean, true);
    assert.deepEqual(r.hits, []);
  });

  it("exposes the fixed block message constant", () => {
    assert.equal(PASTE_SECRETS_BLOCK_MESSAGE, "Remove secrets before submitting.");
  });
});
