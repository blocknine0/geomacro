import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  A2A_PROTOCOL_VERSION,
  a2aSendMessageParamsSchema,
  geomacroA2AAgentCard,
  riskPreflightFromMessage,
} from "../lib/a2a-contract";

describe("A2A v1 contract", () => {
  it("publishes the standards discovery path and JSON-RPC v1 interface", () => {
    const card = geomacroA2AAgentCard();
    expect(A2A_PROTOCOL_VERSION).toBe("1.0");
    expect(card.supportedInterfaces[0]).toEqual({
      url: "https://geomacro.live/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    });
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(true);
    expect(card.skills[0].id).toBe("risk_preflight");
    expect(card.defaultInputModes).toContain("application/json");
  });

  it("requires ProtoJSON ROLE_USER and one structured JSON data part", () => {
    const parsed = a2aSendMessageParamsSchema.parse({
      message: {
        role: "ROLE_USER",
        messageId: "client-msg-001",
        parts: [
          {
            mediaType: "application/json",
            data: {
              skill: "risk_preflight",
              subject: { type: "country", country_iso3: "USA" },
              policy_preset: "balanced",
              action_type: "treasury_payment",
            },
          },
        ],
      },
    });
    expect(riskPreflightFromMessage(parsed.message).skill).toBe("risk_preflight");
    expect(() =>
      a2aSendMessageParamsSchema.parse({
        message: {
          role: "user",
          messageId: "client-msg-002",
          parts: [{ data: { skill: "risk_preflight" } }],
        },
      }),
    ).toThrow();
  });

  it("keeps legacy discovery but points standards clients to agent-card.json", () => {
    const legacy = JSON.parse(readFileSync("public/.well-known/geomacro-agent.json", "utf8"));
    const card = JSON.parse(readFileSync("public/.well-known/agent-card.json", "utf8"));
    expect(legacy.discovery).toBe("https://geomacro.live/.well-known/agent-card.json");
    expect(legacy.a2a.protocol_version).toBe("1.0");
    expect(card.supportedInterfaces[0].protocolVersion).toBe("1.0");
    expect(card.securitySchemes.commercialBearer.httpAuthSecurityScheme.scheme).toBe("Bearer");
  });
});
