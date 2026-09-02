import { afterEach, describe, expect, it } from "vitest";
import { getGoatFlowClient, getGoatFlowRuntimeConfig } from "./goat-flow.server";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("GOAT Flow server configuration", () => {
  it("fails closed when merchant credentials are absent", () => {
    delete process.env.GOATX402_API_URL;
    delete process.env.GOATX402_API_KEY;
    delete process.env.GOATX402_API_SECRET;
    delete process.env.GOATX402_CHAIN_ID;
    delete process.env.GOATX402_TOKEN_SYMBOL;

    expect(getGoatFlowRuntimeConfig().configured).toBe(false);
    expect(getGoatFlowClient()).toBeNull();
  });

  it("accepts a complete server-only configuration", () => {
    process.env.GOATX402_API_URL = "https://flow-api.example";
    process.env.GOATX402_API_KEY = "merchant-key";
    process.env.GOATX402_API_SECRET = "merchant-secret";
    process.env.GOATX402_CHAIN_ID = "2345";
    process.env.GOATX402_TOKEN_SYMBOL = "USDC";
    process.env.GOATX402_TOKEN_CONTRACT =
      "0x1111111111111111111111111111111111111111";
    process.env.GOATX402_RECEIVE_ADDRESS =
      "0x3333333333333333333333333333333333333333";

    const config = getGoatFlowRuntimeConfig();

    expect(config).toMatchObject({
      configured: true,
      chainId: 2345,
      tokenSymbol: "USDC",
    });
    expect(getGoatFlowClient()).not.toBeNull();
  });

  it("rejects an invalid chain id", () => {
    process.env.GOATX402_API_URL = "https://flow-api.example";
    process.env.GOATX402_API_KEY = "merchant-key";
    process.env.GOATX402_API_SECRET = "merchant-secret";
    process.env.GOATX402_CHAIN_ID = "not-a-chain";
    process.env.GOATX402_TOKEN_SYMBOL = "USDC";
    process.env.GOATX402_TOKEN_CONTRACT =
      "0x1111111111111111111111111111111111111111";
    process.env.GOATX402_RECEIVE_ADDRESS =
      "0x3333333333333333333333333333333333333333";

    expect(getGoatFlowRuntimeConfig().configured).toBe(false);
  });
});
