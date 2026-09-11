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
  asset?: string;
  amount?: string;
  expiresAt?: number;
} = {}) {
  return {
    x402Version: 2,
    order_id: "goat-order-negative-matrix",
    flow: "ERC20_DIRECT",
    token_symbol: "USDC",
    accepts: [
      {
        network: overrides.network ?? "eip155:48816",
        asset: overrides.asset ?? input.token_contract,
        payTo: "0x3333333333333333333333333333333333333333",
        amount: overrides.amount ?? input.amount_wei,
        extra: {
          flow: "ERC20_DIRECT",
          tokenSymbol: "USDC",
        },
      },
    ],
    extensions: {
      goatx402: {
        destinationChain: "eip155:48816",
        expiresAt: overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 300,
      },
    },
  };
}

function mockChallenge(payload: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
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

describe("GOAT Flow negative payment contract matrix", () => {
  it("rejects a provider challenge on the wrong chain", async () => {
    mockChallenge(challenge({ network: "eip155:1" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge chain mismatch",
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

  it("rejects a provider challenge for the wrong amount", async () => {
    mockChallenge(challenge({ amount: "99999" }));

    await expect(createGoatFlowOrder(input)).rejects.toThrow(
      "payment challenge amount mismatch",
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

  it("rejects paid-order identity mismatches before fulfillment", () => {
    const order: GoatFlowOrder = {
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

    expect(() =>
      verifyGoatPaidOrder(
        { ...order, chain_id: 1 },
        expected,
      ),
    ).toThrow("paid chain mismatch");

    expect(() =>
      verifyGoatPaidOrder(
        { ...order, token_symbol: "USDT" },
        expected,
      ),
    ).toThrow("paid token symbol mismatch");

    expect(() =>
      verifyGoatPaidOrder(
        { ...order, amount_wei: "99999" },
        expected,
      ),
    ).toThrow("paid amount mismatch");
  });
});
