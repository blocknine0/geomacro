import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createGoatFlowOrder,
  requireGoatFlowConfig,
  validateGoatCreateOrderInput,
  verifyGoatPaidOrder,
  type GoatFlowCreateOrderInput,
  type GoatFlowOrder,
} from "../lib/goat-flow.server";

const originalEnv = {
  environment: process.env.GOATX402_ENVIRONMENT,
  apiUrl: process.env.GOATX402_API_URL,
  apiKey: process.env.GOATX402_API_KEY,
  apiSecret: process.env.GOATX402_API_SECRET,
  merchantId: process.env.GOATX402_MERCHANT_ID,
};

const input: GoatFlowCreateOrderInput = {
  dapp_order_id: "geomacro-negative-matrix",
  from_address: "0x2222222222222222222222222222222222222222",
  amount_wei: "100000",
  token_symbol: "USDC",
  token_contract: "0x1111111111111111111111111111111111111111",
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function challenge(overrides: {
  network?: string;
  destinationNetwork?: string;
  asset?: string;
  amount?: string;
  tokenSymbol?: string;
  payTo?: string;
  expiresAt?: number;
  x402Version?: number;
} = {}) {
  const tokenSymbol = overrides.tokenSymbol ?? "USDC";
  return {
    x402Version: overrides.x402Version ?? 2,
    order_id: "goat-order-negative-matrix",
    flow: "ERC20_DIRECT",
    token_symbol: tokenSymbol,
    accepts: [
      {
        network: overrides.network ?? "eip155:48816",
        asset: overrides.asset ?? input.token_contract,
        payTo: overrides.payTo ?? "0x3333333333333333333333333333333333333333",
        amount: overrides.amount ?? input.amount_wei,
        extra: {
          flow: "ERC20_DIRECT",
          tokenSymbol,
        },
      },
    ],
    extensions: {
      goatx402: {
        destinationChain: overrides.destinationNetwork ?? "eip155:48816",
        expiresAt: overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 300,
      },
    },
  };
}

function mockChallenge(payload: Record<string, unknown>, status = 402) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function paidOrder(overrides: Partial<GoatFlowOrder> = {}): GoatFlowOrder {
  return {
    order_id: "goat-order-negative-matrix",
    merchant_id: "merchant_test",
    dapp_order_id: input.dapp_order_id,
    chain_id: 48816,
    token_contract: input.token_contract,
    token_symbol: input.token_symbol,
    from_address: input.from_address,
    amount_wei: input.amount_wei,
    status: "PAYMENT_CONFIRMED",
    tx_hash: `0x${"a".repeat(64)}`,
    confirmed_at: "2026-09-11T10:49:14.000Z",
    ...overrides,
  };
}

function expectedPaidOrder(order: GoatFlowOrder) {
  return {
    order_id: order.order_id,
    dapp_order_id: order.dapp_order_id,
    from_address: order.from_address,
    chain_id: order.chain_id,
    token_contract: order.token_contract,
    token_symbol: order.token_symbol,
    amount_wei: order.amount_wei,
  };
}

beforeEach(() => {
  process.env.GOATX402_ENVIRONMENT = "testnet3";
  delete process.env.GOATX402_API_URL;
  process.env.GOATX402_API_KEY = "provider=issued&key";
  process.env.GOATX402_API_SECRET = "test-api-secret";
  process.env.GOATX402_MERCHANT_ID = "merchant_test";
});

afterEach(() => {
  restore("GOATX402_ENVIRONMENT", originalEnv.environment);
  restore("GOATX402_API_URL", originalEnv.apiUrl);
  restore("GOATX402_API_KEY", originalEnv.apiKey);
  restore("GOATX402_API_SECRET", originalEnv.apiSecret);
  restore("GOATX402_MERCHANT_ID", originalEnv.merchantId);
  vi.unstubAllGlobals();
});

describe("GOAT Flow mainnet-readiness negative payment contract matrix", () => {
  it("binds validated requests to the selected GOAT environment chain", () => {
    expect(validateGoatCreateOrderInput(input, "testnet3").chain_id).toBe(48816);
    expect(validateGoatCreateOrderInput(input, "mainnet").chain_id).toBe(2345);
  });

  it("accepts only the official API origin for the selected environment", () => {
    process.env.GOATX402_ENVIRONMENT = "mainnet";
    process.env.GOATX402_API_URL = "https://flow-api.testnet3.goat.network";

    expect(() => requireGoatFlowConfig()).toThrow(
      "GOATX402_API_URL must match the official selected GOAT Flow origin",
    );
  });

  it("rejects a provider challenge on the wrong chain", async () => {
    mockChallenge(challenge({ network: "eip155:1" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge chain mismatch",
    );
  });

  it("rejects a provider challenge with a mismatched destination chain", async () => {
    mockChallenge(challenge({ destinationNetwork: "eip155:1" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge destination-chain mismatch",
    );
  });

  it("rejects a provider challenge for the wrong token contract", async () => {
    mockChallenge(
      challenge({
        asset: "0x4444444444444444444444444444444444444444",
      }),
    );

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge token contract mismatch",
    );
  });

  it("rejects a provider challenge for the wrong token symbol", async () => {
    mockChallenge(challenge({ tokenSymbol: "USDT" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge token symbol mismatch",
    );
  });

  it("rejects a provider challenge for the wrong amount", async () => {
    mockChallenge(challenge({ amount: "99999" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge amount mismatch",
    );
  });

  it("rejects a provider challenge with an invalid recipient", async () => {
    mockChallenge(challenge({ payTo: "0xdeadbeef" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge payTo address is invalid",
    );
  });

  it("rejects an expired provider challenge", async () => {
    mockChallenge(
      challenge({
        expiresAt: Math.floor(Date.now() / 1000) - 1,
      }),
    );

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge expiry is invalid or expired",
    );
  });

  it("rejects unsupported x402 challenge versions", async () => {
    mockChallenge(challenge({ x402Version: 1 }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "unsupported x402 version",
    );
  });

  it("rejects a provider response that skips the required HTTP 402 challenge", async () => {
    mockChallenge(challenge(), 200);

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "create-order did not return the expected HTTP 402 challenge",
    );
  });

  it("rejects paid-order identity and settlement mismatches before fulfillment", () => {
    const order = paidOrder();
    const expected = expectedPaidOrder(order);

    expect(() => verifyGoatPaidOrder({ ...order, order_id: "other-order" }, expected))
      .toThrow("paid order ID mismatch");
    expect(() => verifyGoatPaidOrder({ ...order, dapp_order_id: "other-request" }, expected))
      .toThrow("paid dapp_order_id mismatch");
    expect(() => verifyGoatPaidOrder({ ...order, from_address: "0x5555555555555555555555555555555555555555" }, expected))
      .toThrow("paid payer mismatch");
    expect(() => verifyGoatPaidOrder({ ...order, chain_id: 1 }, expected))
      .toThrow("paid chain mismatch");
    expect(() => verifyGoatPaidOrder({ ...order, token_contract: "0x4444444444444444444444444444444444444444" }, expected))
      .toThrow("paid token contract mismatch");
    expect(() => verifyGoatPaidOrder({ ...order, token_symbol: "USDT" }, expected))
      .toThrow("paid token symbol mismatch");
    expect(() => verifyGoatPaidOrder({ ...order, amount_wei: "99999" }, expected))
      .toThrow("paid amount mismatch");
  });

  it("rejects unconfirmed or incomplete settlement evidence", () => {
    const order = paidOrder();
    const expected = expectedPaidOrder(order);

    expect(() => verifyGoatPaidOrder({ ...order, status: "CHECKOUT_VERIFIED" }, expected))
      .toThrow("GOAT order is not paid");
    expect(() => verifyGoatPaidOrder({ ...order, tx_hash: null }, expected))
      .toThrow("GOAT paid order has no transaction hash");
    expect(() => verifyGoatPaidOrder({ ...order, confirmed_at: null }, expected))
      .toThrow("GOAT paid order has no confirmation timestamp");
  });
});
