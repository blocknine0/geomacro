import { afterEach, describe, expect, it } from "vitest";
import { getAgentPaymentConfig, settleAgentPayment, type X402Adapter } from "./agent-payment.server";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("agent payment boundary", () => {
  it("does not enable payment with incomplete pricing configuration", () => {
    delete process.env.AGENT_PAYMENT_ENABLED;
    delete process.env.AGENT_PAYMENT_AMOUNT;
    expect(getAgentPaymentConfig().enabled).toBe(false);
  });

  it("returns payment required without accepting a payment", async () => {
    process.env.AGENT_PAYMENT_ENABLED = "true";
    process.env.AGENT_PAYMENT_AMOUNT = "10000";
    process.env.AGENT_PAYMENT_ASSET = "configured-asset";
    process.env.AGENT_PAYMENT_NETWORK = "configured-network";
    process.env.AGENT_PAYMENT_RAIL = "x402";
    process.env.AGENT_PAYMENT_PAY_TO = "configured-pay-to";
    process.env.AGENT_X402_FACILITATOR_URL = "https://configured.example";
    const result = await settleAgentPayment(new Request("https://example.com"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PAYMENT_REQUIRED");
  });

  it("supports mockable accepted and failed settlement without calling real networks", async () => {
    process.env.AGENT_PAYMENT_ENABLED = "true";
    process.env.AGENT_PAYMENT_AMOUNT = "10000";
    process.env.AGENT_PAYMENT_ASSET = "configured-asset";
    process.env.AGENT_PAYMENT_NETWORK = "configured-network";
    process.env.AGENT_PAYMENT_RAIL = "x402";
    process.env.AGENT_PAYMENT_PAY_TO = "configured-pay-to";
    process.env.AGENT_X402_FACILITATOR_URL = "https://configured.example";
    const accepted: X402Adapter = { verifyAndSettle: async () => ({ status: "accepted", provider: "x402", reference: "mock-ref" }) };
    const result = await settleAgentPayment(new Request("https://example.com", { headers: { "PAYMENT-SIGNATURE": "mock" } }), accepted);
    expect(result).toMatchObject({ ok: true, payment: { reference: "mock-ref" } });
  });
});
