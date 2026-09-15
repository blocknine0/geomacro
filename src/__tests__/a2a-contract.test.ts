import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  a2aSendMessageRequestSchema,
  extractA2ARiskPreflightInput,
  geomacroA2AAgentCard,
} from "../lib/a2a-contract";
import {
  isForbiddenA2AAddress,
  parseA2APublicHttpsUrl,
} from "../lib/a2a-network-safety.server";

function riskMessage() {
  return {
    messageId: "msg-a2a-0001",
    role: "ROLE_USER" as const,
    parts: [
      {
        data: {
          skillId: "risk_preflight",
          input: {
            subject: { type: "country", country_iso3: "IND" },
            policy_preset: "balanced",
            action_type: "agent_payment",
            amount_usdc: 1000,
          },
        },
        mediaType: "application/json",
      },
    ],
  };
}

describe("A2A v1 contract", () => {
  it("parses a bounded risk_preflight SendMessage request", () => {
    const request = a2aSendMessageRequestSchema.parse({
      message: riskMessage(),
      configuration: {
        acceptedOutputModes: ["application/json"],
        historyLength: 5,
      },
    });
    const input = extractA2ARiskPreflightInput(request.message);
    expect(input.subject).toEqual({ type: "country", country_iso3: "IND" });
    expect(input.action_type).toBe("agent_payment");
  });

  it("rejects unsupported file/url parts and ambiguous part payloads", () => {
    expect(() =>
      a2aSendMessageRequestSchema.parse({
        message: {
          messageId: "msg-a2a-0002",
          role: "ROLE_USER",
          parts: [{ text: "hello", data: { skillId: "risk_preflight" } }],
        },
      }),
    ).toThrow();

    expect(() =>
      a2aSendMessageRequestSchema.parse({
        message: {
          messageId: "msg-a2a-0003",
          role: "ROLE_USER",
          parts: [{ file: { uri: "https://example.com/file" } }],
        },
      }),
    ).toThrow();
  });

  it("rejects same-country directional corridors", () => {
    expect(() =>
      a2aSendMessageRequestSchema.parse({
        message: {
          messageId: "msg-a2a-0004",
          role: "ROLE_USER",
          parts: [
            {
              data: {
                skillId: "risk_preflight",
                input: {
                  subject: {
                    type: "corridor",
                    origin_country_iso3: "IND",
                    destination_country_iso3: "IND",
                  },
                },
              },
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("publishes official HTTP+JSON v1 discovery while keeping execution disabled", () => {
    const card = geomacroA2AAgentCard("https://geomacro.live");
    expect(card.supportedInterfaces[0]).toEqual({
      url: "https://geomacro.live/api/a2a",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    });
    expect(card.capabilities.pushNotifications).toBe(true);
    expect(card.capabilities.streaming).toBe(false);
    expect(card.skills[0].id).toBe("risk_preflight");
    expect(card.skills[0].description).toContain("never authorizes execution");
  });

  it("keeps the static well-known Agent Card aligned", () => {
    const staticCard = JSON.parse(
      readFileSync("public/.well-known/agent-card.json", "utf8"),
    );
    const dynamicCard = geomacroA2AAgentCard("https://geomacro.live");
    expect(staticCard.name).toBe(dynamicCard.name);
    expect(staticCard.version).toBe(dynamicCard.version);
    expect(staticCard.supportedInterfaces).toEqual(dynamicCard.supportedInterfaces);
    expect(staticCard.capabilities).toEqual(dynamicCard.capabilities);
    expect(staticCard.skills[0].id).toBe(dynamicCard.skills[0].id);
  });
});

describe("A2A network safety", () => {
  it("allows only HTTPS URLs without embedded credentials or non-443 ports", () => {
    expect(parseA2APublicHttpsUrl("https://agent.example.com/a2a").hostname).toBe(
      "agent.example.com",
    );
    expect(() => parseA2APublicHttpsUrl("http://agent.example.com/a2a")).toThrow(
      "A2A_URL_HTTPS_REQUIRED",
    );
    expect(() =>
      parseA2APublicHttpsUrl("https://user:pass@agent.example.com/a2a"),
    ).toThrow("A2A_URL_CREDENTIALS_FORBIDDEN");
    expect(() => parseA2APublicHttpsUrl("https://agent.example.com:8443/a2a")).toThrow(
      "A2A_URL_PORT_FORBIDDEN",
    );
  });

  it("blocks loopback, private, link-local and metadata addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isForbiddenA2AAddress(address)).toBe(true);
    }
    expect(isForbiddenA2AAddress("8.8.8.8")).toBe(false);
    expect(() => parseA2APublicHttpsUrl("https://localhost/callback")).toThrow(
      "A2A_URL_HOST_FORBIDDEN",
    );
  });
});
