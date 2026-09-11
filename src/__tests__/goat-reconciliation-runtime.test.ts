import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForGoatPaidOrder } from "../lib/goat-flow.server";

const originalEnv = {
  environment: process.env.GOATX402_ENVIRONMENT,
  apiUrl: process.env.GOATX402_API_URL,
  apiKey: process.env.GOATX402_API_KEY,
  apiSecret: process.env.GOATX402_API_SECRET,
  merchantId: process.env.GOATX402_MERCHANT_ID,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const expected = {
  order_id: "goat-order-reconcile",
  dapp_order_id: "geomacro-reconcile",
  from_address: "0x2222222222222222222222222222222222222222",
  chain_id: 48816,
  token_contract: "0x1111111111111111111111111111111111111111",
  token_symbol: "USDC",
  amount_wei: "100000",
};

function providerOrder(status: "CHECKOUT_VERIFIED" | "EXPIRED") {
  return {
    order_id: expected.order_id,
    merchant_id: "merchant_test",
    dapp_order_id: expected.dapp_order_id,
    chain_id: expected.chain_id,
    token_contract: expected.token_contract,
    token_symbol: expected.token_symbol,
    from_address: expected.from_address,
    amount_wei: expected.amount_wei,
    status,
    tx_hash: null,
    confirmed_at: null,
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

describe("GOAT reconciliation runtime", () => {
  it("times out by reconciling only the same order and never creates another order", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", url: String(input) });
        return new Response(JSON.stringify(providerOrder("CHECKOUT_VERIFIED")), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(
      waitForGoatPaidOrder(expected, { timeout_ms: 1000, interval_ms: 500 }),
    ).rejects.toThrow("reconcile before creating another payment");

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.every((call) => call.url.endsWith(`/api/v1/orders/${expected.order_id}`))).toBe(true);
  });

  it("fails immediately on a terminal provider state without any create-order call", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", url: String(input) });
        return new Response(JSON.stringify(providerOrder("EXPIRED")), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(
      waitForGoatPaidOrder(expected, { timeout_ms: 10_000, interval_ms: 500 }),
    ).rejects.toThrow("GOAT order ended without payment: EXPIRED");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain(`/api/v1/orders/${expected.order_id}`);
  });
});
