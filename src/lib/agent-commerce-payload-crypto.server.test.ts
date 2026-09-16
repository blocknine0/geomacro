import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION,
  agentCommercePayloadEncryptionConfigured,
  decryptCommercePayload,
  encryptCommercePayload,
  isEncryptedCommercePayload,
} from "./agent-commerce-payload-crypto.server";

const KEY_ENV = "AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_B64";
const KEY_ID_ENV = "AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_ID";
const originalKey = process.env[KEY_ENV];
const originalKeyId = process.env[KEY_ID_ENV];

function restore() {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
  if (originalKeyId === undefined) delete process.env[KEY_ID_ENV];
  else process.env[KEY_ID_ENV] = originalKeyId;
}

afterEach(restore);

describe("agent commerce payload encryption", () => {
  it("stores only an authenticated encrypted envelope and round-trips the exact structured answer", () => {
    process.env[KEY_ENV] = Buffer.alloc(32, 7).toString("base64");
    process.env[KEY_ID_ENV] = "test-key-v1";

    const payload = {
      question_interpretation: { normalized_question: "what is the current macro risk for india?" },
      structural: [{ subject: { type: "country", country_iso3: "IND" }, intelligence: { macro_monetary: { observations: [{ value_numeric: 6.5 }] } } }],
      payment: { payer: "0x1111111111111111111111111111111111111111" },
    };

    const encrypted = encryptCommercePayload(payload);
    expect(encrypted.envelope.schema_version).toBe(AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION);
    expect(isEncryptedCommercePayload(encrypted.envelope)).toBe(true);
    expect(JSON.stringify(encrypted.envelope)).not.toContain("macro risk for india");
    expect(JSON.stringify(encrypted.envelope)).not.toContain("0x1111111111111111111111111111111111111111");
    expect(decryptCommercePayload(encrypted.envelope, encrypted.plaintextSha256)).toEqual(payload);
  });

  it("fails closed when the encryption key is missing", () => {
    delete process.env[KEY_ENV];
    delete process.env[KEY_ID_ENV];
    expect(agentCommercePayloadEncryptionConfigured()).toBe(false);
    expect(() => encryptCommercePayload({ premium: true })).toThrow("AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_MISSING");
  });

  it("rejects plaintext replay payloads and tampered ciphertext", () => {
    process.env[KEY_ENV] = Buffer.alloc(32, 9).toString("base64");
    process.env[KEY_ID_ENV] = "test-key-v1";

    expect(() => decryptCommercePayload({ premium: "plaintext" })).toThrow("AGENT_COMMERCE_PLAINTEXT_REPLAY_BLOCKED");

    const encrypted = encryptCommercePayload({ premium: { answer: 42 } });
    const tampered = { ...encrypted.envelope, ciphertext_b64: Buffer.from("tampered").toString("base64") };
    expect(() => decryptCommercePayload(tampered, encrypted.plaintextSha256)).toThrow("AGENT_COMMERCE_PAYLOAD_DECRYPTION_FAILED");
  });
});
