import {
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  a2aTaskRequestSchema,
  canonicalA2ASigningPayload,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  geomacroA2AManifest,
  sha256A2A,
} from "../lib/a2a-contract";

describe("Geomacro A2A protocol contract", () => {
  it("publishes bounded risk-preflight discovery without execution authority", () => {
    const manifest = geomacroA2AManifest("https://geomacro.live");
    expect(manifest.protocol.version).toBe("geomacro-a2a/1");
    expect(manifest.agent.execution_authorized).toBe(false);
    expect(manifest.capabilities[0].id).toBe("risk_preflight");
    expect(manifest.capabilities[0].credit_cost).toBe(15);
    expect(manifest.payment_modes.commercial_credit.production_capable).toBe(true);
    expect(manifest.payment_modes.x402_testnet.production_capable).toBe(false);
    expect(manifest.boundaries.execution_authorized).toBe(false);
  });

  it("validates country/corridor tasks and rejects a self-corridor", () => {
    const country = a2aTaskRequestSchema.parse({
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      client_task_id: "client-task-0001",
      capability: "risk_preflight",
      subject: { type: "country", country_iso3: "ind" },
      payment_mode: "commercial_credit",
    });
    expect(country.subject.type).toBe("country");
    if (country.subject.type === "country") {
      expect(country.subject.country_iso3).toBe("IND");
    }

    expect(() => a2aTaskRequestSchema.parse({
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      client_task_id: "client-task-0002",
      capability: "risk_preflight",
      subject: {
        type: "corridor",
        origin_country_iso3: "USA",
        destination_country_iso3: "USA",
      },
      payment_mode: "commercial_credit",
    })).toThrow();
  });

  it("uses a deterministic canonical payload that verifies with Ed25519", () => {
    const body = JSON.stringify({
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      client_task_id: "client-task-signature-0001",
      capability: "risk_preflight",
      subject: { type: "country", country_iso3: "IND" },
      payment_mode: "commercial_credit",
    });
    const payload = canonicalA2ASigningPayload({
      method: "POST",
      pathname: "/api/a2a/tasks",
      timestamp: "1789407000",
      nonce: "0123456789abcdef01234567",
      bodySha256: sha256A2A(body),
    });
    expect(payload).toBe([
      "geomacro-a2a/1",
      "POST",
      "/api/a2a/tasks",
      "1789407000",
      "0123456789abcdef01234567",
      sha256A2A(body),
    ].join("\n"));

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signature = sign(null, Buffer.from(payload, "utf8"), privateKey);
    expect(verify(null, Buffer.from(payload, "utf8"), publicKey, signature)).toBe(true);
    expect(verify(null, Buffer.from(`${payload}x`, "utf8"), publicKey, signature)).toBe(false);
  });
});
