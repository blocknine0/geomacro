import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  GOAT_FLOW_ENVIRONMENTS,
  calculateGoatFlowSignature,
  requireGoatFlowConfig,
  signGoatFlowRequest,
  validateGoatCreateOrderInput,
  verifyGoatPaidOrder,
  type GoatFlowOrder,
} from "../lib/goat-flow.server";

const originalEnv = {
  environment: process.env.GOATX402_ENVIRONMENT,
  apiUrl: process.env.GOATX402_API_URL,
  apiKey: process.env.GOATX402_API_KEY,
  apiSecret: process.env.GOATX402_API_SECRET,
  merchantId: process.env.GOATX402_MERCHANT_ID,
};

afterEach(() => {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("GOATX402_ENVIRONMENT", originalEnv.environment);
  restore("GOATX402_API_URL", originalEnv.apiUrl);
  restore("GOATX402_API_KEY", originalEnv.apiKey);
  restore("GOATX402_API_SECRET", originalEnv.apiSecret);
  restore("GOATX402_MERCHANT_ID", originalEnv.merchantId);
});

describe("GOAT Flow partner contract", () => {
  it("pins the reviewed official Testnet3 and mainnet environment identities", () => {
    expect(GOAT_FLOW_ENVIRONMENTS.testnet3).toEqual({
      chain_id: 48816,
      caip2: "eip155:48816",
      api_url: "https://flow-api.testnet3.goat.network",
      rpc_url: "https://rpc.testnet3.goat.network",
      commercial_revenue: false,
    });
    expect(GOAT_FLOW_ENVIRONMENTS.mainnet).toEqual({
      chain_id: 2345,
      caip2: "eip155:2345",
      api_url: "https://flow-api.goat.network",
      rpc_url: "https://rpc.goat.network",
      commercial_revenue: true,
    });
  });

  it("matches the documented GOAT HMAC delimiter algorithm for a fixed vector", () => {
    const params = {
      amount_wei: "1000000",
      api_key: "test_api_key",
      chain_id: "48816",
      dapp_order_id: "geomacro-goat-test",
      from_address: "0x2222222222222222222222222222222222222222",
      nonce: "00000000-0000-4000-8000-000000000001",
      timestamp: "1789000000",
      token_contract: "0x1111111111111111111111111111111111111111",
      token_symbol: "USDC",
    };

    expect(
      calculateGoatFlowSignature(params, "test_api_secret"),
    ).toBe("2783a668235a517e0bba3b8722d912b5b15651ae9eeebb57d7026ee24275116a");

    expect(
      signGoatFlowRequest(
        {
          dapp_order_id: "geomacro-goat-test",
          chain_id: 48816,
          token_symbol: "USDC",
          token_contract: "0x1111111111111111111111111111111111111111",
          from_address: "0x2222222222222222222222222222222222222222",
          amount_wei: "1000000",
        },
        { api_key: "test_api_key", api_secret: "test_api_secret" },
        1789000000,
        "00000000-0000-4000-8000-000000000001",
      )["X-Sign"],
    ).toBe("2783a668235a517e0bba3b8722d912b5b15651ae9eeebb57d7026ee24275116a");
  });

  it("preserves provider-issued API key delimiters while body scalars remain injection-safe", () => {
    const apiKey = "provider=issued&key";
    const timestamp = 1789000000;
    const nonce = "00000000-0000-4000-8000-000000000001";

    const headers = signGoatFlowRequest(
      {
        dapp_order_id: "geomacro-goat-test",
        chain_id: 48816,
        token_symbol: "USDC",
        token_contract: "0x1111111111111111111111111111111111111111",
        from_address: "0x2222222222222222222222222222222222222222",
        amount_wei: "1000000",
      },
      { api_key: apiKey, api_secret: "test_api_secret" },
      timestamp,
      nonce,
    );

    expect(headers["X-API-Key"]).toBe(apiKey);
    expect(headers["X-Sign"]).toBe(
      calculateGoatFlowSignature(
        {
          amount_wei: "1000000",
          api_key: apiKey,
          chain_id: "48816",
          dapp_order_id: "geomacro-goat-test",
          from_address: "0x2222222222222222222222222222222222222222",
          nonce,
          timestamp: String(timestamp),
          token_contract: "0x1111111111111111111111111111111111111111",
          token_symbol: "USDC",
        },
        "test_api_secret",
      ),
    );

    expect(() =>
      signGoatFlowRequest(
        { dapp_order_id: "bad&order" },
        { api_key: apiKey, api_secret: "test_api_secret" },
        timestamp,
        nonce,
      ),
    ).toThrow("unsupported HMAC delimiter/control characters");

    expect(() =>
      signGoatFlowRequest(
        {},
        { api_key: "bad\nkey", api_secret: "test_api_secret" },
        timestamp,
        nonce,
      ),
    ).toThrow("api_key contains invalid control characters");
  });

  it("rejects HMAC delimiter injection and invalid payment scalars before the provider call", () => {
    expect(() =>
      validateGoatCreateOrderInput(
        {
          dapp_order_id: "bad&order",
          from_address: "0x2222222222222222222222222222222222222222",
          amount_wei: "1000000",
          token_symbol: "USDC",
          token_contract: "0x1111111111111111111111111111111111111111",
        },
        "testnet3",
      ),
    ).toThrow("dapp_order_id is invalid");

    expect(() =>
      validateGoatCreateOrderInput(
        {
          dapp_order_id: "good-order",
          from_address: "0x2222222222222222222222222222222222222222",
          amount_wei: "-1",
          token_symbol: "USDC",
          token_contract: "0x1111111111111111111111111111111111111111",
        },
        "testnet3",
      ),
    ).toThrow("amount_wei");
  });

  it("fails closed if the selected environment points at a non-official Flow origin", () => {
    process.env.GOATX402_ENVIRONMENT = "testnet3";
    process.env.GOATX402_API_URL = "https://evil.example";
    process.env.GOATX402_API_KEY = "test-key";
    process.env.GOATX402_API_SECRET = "test-secret";
    process.env.GOATX402_MERCHANT_ID = "merchant_test";

    expect(() => requireGoatFlowConfig()).toThrow(
      "must match the official selected GOAT Flow origin",
    );
  });

  it("accepts only an exact paid order identity before fulfillment", () => {
    const order: GoatFlowOrder = {
      order_id: "goat-order-1",
      merchant_id: "merchant_test",
      dapp_order_id: "geomacro-goat-request",
      chain_id: 48816,
      token_contract: "0x1111111111111111111111111111111111111111",
      token_symbol: "USDC",
      from_address: "0x2222222222222222222222222222222222222222",
      amount_wei: "1000000",
      status: "PAYMENT_CONFIRMED",
      tx_hash: `0x${"a".repeat(64)}`,
      confirmed_at: "2026-09-10T00:00:00.000Z",
    };

    const expected = {
      order_id: order.order_id,
      dapp_order_id: order.dapp_order_id,
      from_address: order.from_address,
      chain_id: order.chain_id,
      token_contract: order.token_contract,
      token_symbol: order.token_symbol,
      amount_wei: order.amount_wei,
    };

    expect(verifyGoatPaidOrder(order, expected)).toEqual(order);
    expect(() =>
      verifyGoatPaidOrder(
        { ...order, amount_wei: "999999" },
        expected,
      ),
    ).toThrow("amount mismatch");
    expect(() =>
      verifyGoatPaidOrder(
        { ...order, status: "CHECKOUT_VERIFIED" },
        expected,
      ),
    ).toThrow("not paid");
    expect(() =>
      verifyGoatPaidOrder(
        { ...order, tx_hash: null },
        expected,
      ),
    ).toThrow("no transaction hash");
  });
});
