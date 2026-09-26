import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("GeoMacro A2A global agent discovery contract", () => {
  it("publishes an honest A2A v1 discovery card for all three product categories", () => {
    const card = JSON.parse(read("public/.well-known/agent-card.json"));
    expect(card.name).toContain("GeoMacro");
    expect(card.supportedInterfaces).toEqual([
      {
        url: "https://geomacro.live/api/a2a",
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ]);
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.extendedAgentCard).toBe(false);
    const ids = new Set(card.skills.map((skill: { id: string }) => skill.id));
    expect(ids).toContain("geomacro_geopolitics");
    expect(ids).toContain("geomacro_macro");
    expect(ids).toContain("geomacro_critical_minerals");
    expect(ids).toContain("geomacro_availability");
  });

  it("exposes A2A JSON-RPC coordination without bypassing x402 deliverability", () => {
    const route = read("src/routes/api.a2a.ts");
    expect(route).toContain('createFileRoute("/api/a2a")');
    expect(route).toContain('SUPPORTED_A2A_VERSION = "1.0"');
    expect(route).toContain('body.method === "SendMessage"');
    expect(route).toContain('body.method === "GetTask"');
    expect(route).toContain('body.method === "CancelTask"');
    expect(route).toContain("/api/x402/risk/availability");
    expect(route).toContain("/api/x402/intelligence");
    expect(route).toContain("payment_after_deliverability_only: true");
    expect(route).toContain("execution_authorized: false");
    expect(route).toContain("-32001");
    expect(route).toContain("-32009");
  });

  it("keeps the adaptive intelligence planner wired for critical minerals", () => {
    const planner = read("src/lib/agent-query-plan.ts");
    expect(planner).toContain('"critical_minerals"');
    expect(planner).toContain('critical_minerals: ["critical_minerals"]');
  });
});
