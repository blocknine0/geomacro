import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("GeoMacro A2A global agent discovery contract", () => {
  it("publishes A2A v1 discovery for all three product categories without weakening auth", () => {
    const card = JSON.parse(read("public/.well-known/agent-card.json"));
    expect(card.name).toBe("Geomacro Agent");
    expect(card.supportedInterfaces).toEqual([
      {
        url: "https://geomacro.live/api/a2a",
        protocolBinding: "HTTP+JSON",
        protocolVersion: "1.0",
      },
    ]);
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(true);
    expect(card.capabilities.extendedAgentCard).toBe(true);
    expect(card.securitySchemes.geomacroBearer).toBeDefined();
    expect(card.securitySchemes.geomacroTestnetKey).toBeDefined();
    const ids = new Set(card.skills.map((skill: { id: string }) => skill.id));
    expect(ids).toContain("risk_preflight");
    expect(ids).toContain("geopolitics");
    expect(ids).toContain("macro");
    expect(ids).toContain("critical_minerals");
  });

  it("uses the hardened persisted A2A HTTP service rather than an anonymous parallel route", () => {
    const route = read("server/api/a2a/[...path].ts");
    expect(route).toContain("authenticateCommercialApiRequest");
    expect(route).toContain('path === "message:send"');
    expect(route).toContain('path === "tasks"');
    expect(route).toContain(":cancel");
    expect(route).toContain("assertA2AMessageIdempotency");
    expect(route).toContain("loadLatestA2AMessageHistory");
    expect(route).toContain("execution_authorized: false");
    expect(route).toContain("A2A_VERSION_UNSUPPORTED");
  });

  it("keeps adaptive paid intelligence wired for critical minerals and availability-first delivery", () => {
    const planner = read("src/lib/agent-query-plan.ts");
    const commerce = JSON.parse(read("public/.well-known/geomacro-commerce.json"));
    expect(planner).toContain('"critical_minerals"');
    expect(planner).toContain('critical_minerals: ["critical_minerals"]');
    expect(commerce.discovery.availability).toBe(
      "https://geomacro.live/api/x402/risk/availability",
    );
    expect(commerce.offers[0].providers.coinbase_x402.endpoint).toBe(
      "https://geomacro.live/api/x402/intelligence",
    );
    expect(commerce.offers[0].providers.coinbase_x402.paid_testnet_acceptance_complete).toBe(false);
  });
});
