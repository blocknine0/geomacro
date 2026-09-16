import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { stableCommerceJson } from "./agent-commerce-delivery.server";

export const AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION = "geomacro.agent-commerce.encrypted-payload.v1" as const;
const ALGORITHM = "aes-256-gcm" as const;
const IV_BYTES = 12;
const KEY_BYTES = 32;

type EncryptedPayloadEnvelope = {
  schema_version: typeof AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION;
  algorithm: typeof ALGORITHM;
  key_id: string;
  iv_b64: string;
  tag_b64: string;
  ciphertext_b64: string;
  plaintext_sha256: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function keyFromEnvironment() {
  const raw = process.env.AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_B64?.trim();
  if (!raw) throw new Error("AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_MISSING");

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_INVALID");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error("AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_MUST_BE_32_BYTES");
  }

  const configuredId = process.env.AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_ID?.trim();
  const keyId = configuredId || `sha256:${sha256(key.toString("base64")).slice(0, 16)}`;
  if (keyId.length > 96) throw new Error("AGENT_COMMERCE_PAYLOAD_ENCRYPTION_KEY_ID_TOO_LONG");
  return { key, keyId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isEncryptedCommercePayload(value: unknown): value is EncryptedPayloadEnvelope {
  if (!isRecord(value)) return false;
  return value.schema_version === AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION
    && value.algorithm === ALGORITHM
    && typeof value.key_id === "string"
    && typeof value.iv_b64 === "string"
    && typeof value.tag_b64 === "string"
    && typeof value.ciphertext_b64 === "string"
    && typeof value.plaintext_sha256 === "string"
    && /^[0-9a-f]{64}$/.test(value.plaintext_sha256);
}

export function encryptCommercePayload(payload: unknown) {
  const { key, keyId } = keyFromEnvironment();
  const plaintext = stableCommerceJson(payload);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedPayloadEnvelope = {
    schema_version: AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    key_id: keyId,
    iv_b64: iv.toString("base64"),
    tag_b64: tag.toString("base64"),
    ciphertext_b64: ciphertext.toString("base64"),
    plaintext_sha256: sha256(plaintext),
  };
  return { envelope, plaintextSha256: envelope.plaintext_sha256 };
}

export function decryptCommercePayload(value: unknown, expectedSha256?: string | null) {
  if (!isEncryptedCommercePayload(value)) {
    throw new Error("AGENT_COMMERCE_PLAINTEXT_REPLAY_BLOCKED");
  }

  const { key, keyId } = keyFromEnvironment();
  if (value.key_id !== keyId) {
    throw new Error("AGENT_COMMERCE_PAYLOAD_KEY_ID_MISMATCH");
  }

  let plaintext: string;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv_b64, "base64"));
    decipher.setAAD(Buffer.from(AGENT_COMMERCE_PAYLOAD_ENVELOPE_VERSION, "utf8"));
    decipher.setAuthTag(Buffer.from(value.tag_b64, "base64"));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext_b64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("AGENT_COMMERCE_PAYLOAD_DECRYPTION_FAILED");
  }

  const actual = sha256(plaintext);
  if (actual !== value.plaintext_sha256 || (expectedSha256 && actual !== expectedSha256)) {
    throw new Error("AGENT_COMMERCE_PAYLOAD_INTEGRITY_MISMATCH");
  }

  try {
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new Error("AGENT_COMMERCE_PAYLOAD_JSON_INVALID");
  }
}

export function agentCommercePayloadEncryptionConfigured() {
  try {
    keyFromEnvironment();
    return true;
  } catch {
    return false;
  }
}
