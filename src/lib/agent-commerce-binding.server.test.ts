import { afterEach, describe, expect, it } from "vitest";
import {
  agentCommerceBindingConfigured,
  agentCommercePaymentBinding,
  assertAgentCommercePaymentBinding,
} from "./agent-commerce-binding.server";

const ENV = "AGENT_COMMERCE_BINDING_KEY_B64";
const original = process.env[ENV];

afterEach(() => {
  if (original === undefined) delete process.env[ENV];
  else process.env[ENV] = original;
});

function input() {
  return {
    productId: "geomacro_adaptive_risk_intelligence_v1",
    queryPlanHash: "a".repeat(64),
    amountAtomic: "20000",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x1111111111111111111111111111111111111111",
  };
}

describe("private agent-commerce payment binding", () => {
  it("produces an opaque keyed binding over the exact question plan and payment terms", () => {
    process.env[ENV] = Buffer.alloc(32, 3).toString("base64");
    const binding = agentCommercePaymentBinding(input());
    expect(binding).toMatch(/^[0-9a-f]{64}$/);
    expect(binding).not.toBe(input().queryPlanHash);
    expect(() => assertAgentCommercePaymentBinding(binding, binding)).not.toThrow();

    const changed = agentCommercePaymentBinding({ ...input(), amountAtomic: "20001" });
    expect(changed).not.toBe(binding);
    expect(() => assertAgentCommercePaymentBinding(changed, binding)).toThrow("PAYMENT_QUERY_BINDING_MISMATCH");
  });

  it("fails closed without a private binding key", () => {
    delete process.env[ENV];
    expect(agentCommerceBindingConfigured()).toBe(false);
    expect(() => agentCommercePaymentBinding(input())).toThrow("AGENT_COMMERCE_BINDING_KEY_MISSING");
  });
});
