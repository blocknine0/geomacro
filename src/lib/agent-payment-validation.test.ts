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

import { getGoatFlowRuntimeConfig } from "./agent/goat-flow.server";

describe("GOAT payment configuration binding", () => {
  it("requires matching dedicated receive wallet configuration", () => {
    const original = { ...process.env };

    process.env.AGENT_PAYMENT_ENABLED = "true";
    process.env.AGENT_PAYMENT_AMOUNT = "10000";
    process.env.AGENT_PAYMENT_ASSET =
      "0x1111111111111111111111111111111111111111";
    process.env.AGENT_PAYMENT_NETWORK = "eip155:2345";
    process.env.AGENT_PAYMENT_RAIL = "goat-flow";
    process.env.AGENT_PAYMENT_PAY_TO =
      "0x3333333333333333333333333333333333333333";

    process.env.GOATX402_API_URL = "https://flow-api.example";
    process.env.GOATX402_API_KEY = "key";
    process.env.GOATX402_API_SECRET = "secret";
    process.env.GOATX402_CHAIN_ID = "2345";
    process.env.GOATX402_TOKEN_SYMBOL = "USDC";
    process.env.GOATX402_TOKEN_CONTRACT =
      "0x1111111111111111111111111111111111111111";
    process.env.GOATX402_RECEIVE_ADDRESS =
      "0x3333333333333333333333333333333333333333";

    const payment = getAgentPaymentConfig();
    const goat = getGoatFlowRuntimeConfig();

    expect(payment.enabled).toBe(true);
    expect(goat.configured).toBe(true);
    expect(payment.payTo.toLowerCase()).toBe(
      goat.receiveAddress?.toLowerCase(),
    );

    process.env = original;
  });
});
