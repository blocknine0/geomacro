import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoatFlowOrder, verifyGoatPaidOrder, type GoatFlowCreateOrderInput, type GoatFlowOrder } from "../lib/goat-flow.server";

const input: GoatFlowCreateOrderInput = {
  dapp_order_id: "geomacro-docs-matrix",
  from_address: "0x2222222222222222222222222222222222222222",
  amount_wei: "100000",
  token_symbol: "USDC",
  token_contract: "0x1111111111111111111111111111111111111111",
};

beforeEach(() => {
  process.env.GOATX402_ENVIRONMENT = "testnet3";
  delete process.env.GOATX402_API_URL;
  process.env.GOATX402_API_KEY = "test-key";
  process.env.GOATX402_API_SECRET = "test-secret";
  process.env.GOATX402_MERCHANT_ID = "merchant_test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function paidOrder(status: GoatFlowOrder["status"]): GoatFlowOrder {
  return {
    order_id: "goat-order-docs-matrix",
    merchant_id: "merchant_test",
    dapp_order_id: input.dapp_order_id,
    chain_id: 48816,
    token_contract: input.token_contract,
    token_symbol: input.token_symbol,
    from_address: input.from_address,
    amount_wei: input.amount_wei,
    status,
    tx_hash: `0x${"a".repeat(64)}`,
    confirmed_at: "2026-09-12T12:00:00.000Z",
  };
}

function expected(order: GoatFlowOrder) {
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

describe("GOAT docs operational fail-closed contract", () => {
  it.each(["FAILED", "EXPIRED", "CANCELLED", "CHECKOUT_VERIFIED"] as const)(
    "rejects terminal/non-paid status %s",
    (status) => {
      const order = paidOrder(status);
      expect(() => verifyGoatPaidOrder(order, expected(order))).toThrow("GOAT order is not paid");
    },
  );

  it("rejects provider redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://goat.invalid/redirect" } })));
    await expect(createGoatFlowOrder(input)).rejects.toThrow("GOAT Flow redirect rejected");
  });
});
