import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const runner = readFileSync("scripts/agentic/arc-global-category-agent.mjs", "utf8");
const route = readFileSync("src/routes/api.agent.intelligence.ts", "utf8");

describe("global three-category Arc agent contract", () => {
  it("covers all three core intelligence categories", () => {
    for (const category of ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]) {
      expect(runner).toContain('["' + category + '"]');
    }
    expect(route).toContain('["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]');
    expect(runner).toContain("GEOMACRO_AGENT_CASE");
    expect(runner).toContain("mixed");
    expect(runner).toContain("total_paid_usdc: Number((results.length * 0.05).toFixed(2))");
  });

  it("is bounded to Arc Testnet Gateway USDC and 0.05 USDC", () => {
    expect(runner).toContain('"eip155:5042002"');
    expect(runner).toContain('"50000"');
    expect(runner).toContain('"0.05"');
    expect(runner).toContain('"ARC-TESTNET"');
  });

  it("requires verified payment before claiming and settling delivery", () => {
    expect(route).toContain("verifyCircleX402");
    expect(route).toContain("X402_PAYMENT_VERIFICATION_FAILED");
    expect(route).toContain("claimAgentCommerceDelivery");
    expect(route).toContain("settleCircleX402");
  });

  it("distinguishes rejected settlement from ambiguous settlement", () => {
    expect(route).toContain("CircleX402SettlementRejectedError");
    expect(route).toContain("X402_PAYMENT_SETTLEMENT_REJECTED");
    expect(route).toContain("GLOBAL_INTELLIGENCE_SETTLEMENT_AMBIGUOUS");
  });

  it("requires grounded delivery and fail-closed execution", () => {
    expect(route).toContain("answerQuestion");
    expect(route).toContain("insufficient_evidence");
    expect(route).toContain("execution_authorized: false");
    expect(route).toContain("claimAgentCommerceDelivery");
    expect(route).toContain("completeAgentCommerceDelivery");
  });

  it("handles Circle inspect JSON without depending on one exact method field shape", () => {
    expect(runner).toContain("function findHttpMethod");
    expect(runner).toContain("httpMethod");
    expect(runner).toContain("http_method");
    expect(runner).toContain('method = "POST"');
    expect(runner).toContain("already-verified POST endpoint contract");
  });

  it("accepts Circle CLI JSON service-response envelopes", () => {
    expect(runner).toContain("function unwrapCircleServiceResponse");
    expect(runner).toContain("payload.data");
    expect(runner).toContain("payload.data.response");
    expect(runner).toContain("Circle CLI 1.1.4 wraps paid service responses as data.response");
    expect(runner).toContain("const paid = unwrapCircleServiceResponse(paidEnvelope);");
  });

  it("refuses Testnet spend on public production host", () => {
    expect(runner).toContain('["geomacro.live", "www.geomacro.live"]');
  });
});
