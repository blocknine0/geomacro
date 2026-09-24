import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const runner = readFileSync("scripts/agentic/arc-global-category-agent.mjs", "utf8");
const route = readFileSync("src/routes/api.agent.intelligence.ts", "utf8");

describe("global three-category Arc agent contract", () => {
  it("covers all three core intelligence categories", () => {
    for (const category of ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]) {
      expect(runner).toContain('["' + category + '"');
    }
    expect(route).toContain('["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]');
  });

  it("is bounded to Arc Testnet Gateway USDC and 0.05 USDC", () => {
    expect(runner).toContain('"eip155:5042002"');
    expect(runner).toContain('"50000"');
    expect(runner).toContain('"0.05"');
    expect(runner).toContain('"ARC-TESTNET"');
  });

  it("requires grounded delivery and fail-closed execution", () => {
    expect(route).toContain("answerQuestion");
    expect(route).toContain("insufficient_evidence");
    expect(route).toContain("execution_authorized: false");
    expect(route).toContain("claimAgentCommerceDelivery");
    expect(route).toContain("completeAgentCommerceDelivery");
  });

  it("refuses Testnet spend on public production host", () => {
    expect(runner).toContain('["geomacro.live", "www.geomacro.live"]');
  });
});
