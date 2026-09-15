import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GEOMACRO_A2A_PROTOCOL_VERSION,
  a2aNegotiationEnvelopeSchema,
  a2aTaskEnvelopeSchema,
  geomacroA2AManifest,
} from "../lib/a2a-contract";
import {
  a2aEnvelopeSigningValue,
  canonicalA2AJson,
  verifyA2AEnvelopeSignature,
} from "../lib/a2a-signing.server";

function signedEnvelope(payload: unknown) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const now = new Date();
  const unsigned = {
    protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    agent_id: "treasury-agent-1",
    key_id: "treasury-key-1",
    nonce: "abcdefghijklmnop12345678",
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 60_000).toISOString(),
    payload,
  };
  const signature = sign(null, Buffer.from(canonicalA2AJson(unsigned), "utf8"), privateKey).toString("base64");
  const publicKeySpkiB64 = Buffer.from(publicKey.export({ format: "der", type: "spki" })).toString("base64");
  return { envelope: { ...unsigned, signature }, publicKeySpkiB64 };
}

describe("Geomacro A2A v1 contract", () => {
  it("publishes a non-executing agent manifest", () => {
    const manifest = geomacroA2AManifest();
    expect(manifest.protocol_version).toBe("geomacro-a2a/1.0");
    expect(manifest.agent.execution_authorized).toBe(false);
    expect(manifest.boundaries.wallet_custody).toBe(false);
    expect(manifest.boundaries.outbound_x402_auto_payment).toBe(false);
  });

  it("verifies a signed negotiation envelope", () => {
    const { envelope, publicKeySpkiB64 } = signedEnvelope({
      desired_capabilities: ["risk_preflight"],
      payment_modes: ["commercial_credit"],
      transports: ["poll"],
    });
    const parsed = a2aNegotiationEnvelopeSchema.parse(envelope);
    expect(verifyA2AEnvelopeSignature(parsed, publicKeySpkiB64)).toBe(true);
    expect(a2aEnvelopeSigningValue(parsed)).not.toHaveProperty("signature");
  });

  it("rejects non-HTTPS callbacks and preserves bounded risk input", () => {
    const { envelope } = signedEnvelope({
      external_task_id: "task-1234",
      capability: "risk_preflight",
      payment_mode: "commercial_credit",
      callback_url: "http://localhost/callback",
      input: {
        subject: { type: "country", country_iso3: "USA" },
        policy_preset: "balanced",
        action_type: "agent_payment",
      },
    });
    expect(() => a2aTaskEnvelopeSchema.parse(envelope)).toThrow();
  });
});
