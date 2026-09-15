import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as signBytes,
  timingSafeEqual,
  verify as verifyBytes,
} from "node:crypto";
import type { A2ASignature } from "./a2a-contract";

export type A2ASignedEnvelopeLike = {
  protocol_version: string;
  agent_id: string;
  key_id: string;
  nonce: string;
  issued_at: string;
  expires_at: string;
  signature: string;
  payload: unknown;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) output[key] = canonicalize(input[key]);
    return output;
  }
  return value;
}

export function canonicalA2AJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function a2aPayloadHash(value: unknown): string {
  return createHash("sha256").update(canonicalA2AJson(value), "utf8").digest("hex");
}

export function a2aEnvelopeSigningValue(envelope: A2ASignedEnvelopeLike) {
  return {
    protocol_version: envelope.protocol_version,
    agent_id: envelope.agent_id,
    key_id: envelope.key_id,
    nonce: envelope.nonce,
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
    payload: envelope.payload,
  };
}

function publicKeyFromSpkiBase64(value: string) {
  const key = createPublicKey({
    key: Buffer.from(value.trim(), "base64"),
    format: "der",
    type: "spki",
  });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("A2A public key must be Ed25519");
  return key;
}

function privateSigningKeyFromEnv() {
  const keyId = process.env.RISK_OBJECT_SIGNING_KEY_ID?.trim();
  const privateKey = process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64?.trim();
  if (!keyId || !privateKey) throw new Error("Geomacro A2A signing key is not configured");
  const key = createPrivateKey({
    key: Buffer.from(privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Geomacro A2A signing key must be Ed25519");
  return { keyId, key };
}

export function verifyA2AEnvelopeSignature(
  envelope: A2ASignedEnvelopeLike,
  publicKeySpkiB64: string,
): boolean {
  try {
    const signingValue = a2aEnvelopeSigningValue(envelope);
    return verifyBytes(
      null,
      Buffer.from(canonicalA2AJson(signingValue), "utf8"),
      publicKeyFromSpkiBase64(publicKeySpkiB64),
      Buffer.from(envelope.signature, "base64"),
    );
  } catch {
    return false;
  }
}

function sameHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left.toLowerCase(), "hex");
  const b = Buffer.from(right.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyA2ASignedValue(
  value: unknown,
  integrity: A2ASignature,
  publicKeySpkiB64: string,
): boolean {
  try {
    if (integrity.scheme !== "Ed25519") return false;
    if (integrity.canonicalization !== "geomacro-a2a-json-v1") return false;
    const canonical = canonicalA2AJson(value);
    const expectedHash = createHash("sha256").update(canonical, "utf8").digest("hex");
    if (!sameHex(expectedHash, integrity.payload_hash)) return false;
    return verifyBytes(
      null,
      Buffer.from(canonical, "utf8"),
      publicKeyFromSpkiBase64(publicKeySpkiB64),
      Buffer.from(integrity.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function assertA2AEnvelopeFresh(envelope: A2ASignedEnvelopeLike, nowMs = Date.now()) {
  const issued = Date.parse(envelope.issued_at);
  const expires = Date.parse(envelope.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) throw new Error("A2A envelope timestamps are invalid");
  if (expires <= issued) throw new Error("A2A envelope expiry must be after issuance");
  if (expires - issued > 5 * 60_000) throw new Error("A2A envelope validity window exceeds five minutes");
  if (issued > nowMs + 60_000) throw new Error("A2A envelope issued_at is too far in the future");
  if (expires <= nowMs) throw new Error("A2A envelope has expired");
}

export function signGeomacroA2AValue(value: unknown): A2ASignature {
  const { keyId, key } = privateSigningKeyFromEnv();
  const canonical = canonicalA2AJson(value);
  return {
    key_id: keyId,
    scheme: "Ed25519",
    canonicalization: "geomacro-a2a-json-v1",
    payload_hash: createHash("sha256").update(canonical, "utf8").digest("hex"),
    signature: signBytes(null, Buffer.from(canonical, "utf8"), key).toString("base64"),
  };
}

export function createGeomacroSignedEnvelope(payload: unknown, ttlMs = 120_000) {
  const { keyId, key } = privateSigningKeyFromEnv();
  const issuedAt = new Date();
  const envelope = {
    protocol_version: "geomacro-a2a/1.0",
    agent_id: "geomacro",
    key_id: keyId,
    nonce: randomBytes(24).toString("base64url"),
    issued_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.getTime() + ttlMs).toISOString(),
    payload,
  };
  const signature = signBytes(
    null,
    Buffer.from(canonicalA2AJson(envelope), "utf8"),
    key,
  ).toString("base64");
  return { ...envelope, signature };
}
