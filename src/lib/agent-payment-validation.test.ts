import { describe, expect, it } from "vitest";
import { getAgentPaymentConfig } from "./agent-payment.server";

describe("agent pricing validation", () => {
  it("rejects non-integer token amounts", () => {
    const original = { ...process.env };
    process.env.AGENT_PAYMENT_ENABLED = "true";
    process.env.AGENT_PAYMENT_AMOUNT = "0.01";
    process.env.AGENT_PAYMENT_ASSET = "asset";
    process.env.AGENT_PAYMENT_NETWORK = "network";
    process.env.AGENT_PAYMENT_RAIL = "x402";
    expect(getAgentPaymentConfig().enabled).toBe(false);
    process.env = original;
  });
});
