import { describe, expect, it } from "vitest";
import {
  validateConfirmedOrder,
  validateCreatedOrder,
  type GoatOrderIntent,
} from "./goat-order.server";

const original = { ...process.env };

function configure() {
  process.env.GOATX402_API_URL = "https://flow-api.example";
  process.env.GOATX402_API_KEY = "key";
  process.env.GOATX402_API_SECRET = "secret";
  process.env.GOATX402_CHAIN_ID = "2345";
  process.env.GOATX402_TOKEN_SYMBOL = "USDC";
  process.env.GOATX402_TOKEN_CONTRACT =
    "0x1111111111111111111111111111111111111111";
  process.env.GOATX402_RECEIVE_ADDRESS =
    "0x3333333333333333333333333333333333333333";
}

const intent: GoatOrderIntent = {
  requestId: "11111111-1111-4111-8111-111111111111",
  dappOrderId: "geomacro-order-1",
  payerAddress: "0x2222222222222222222222222222222222222222",
  amountWei: "10000",
};

describe("GOAT order validation", () => {
  it("accepts a matching created order", () => {
    process.env = { ...original };
    configure();

    const result = validateCreatedOrder(
      {
        orderId: "goat-order-1",
        flow: "ERC20_DIRECT",
        tokenSymbol: "USDC",
        tokenContract: "0x1111111111111111111111111111111111111111",
        payToAddress: "0x3333333333333333333333333333333333333333",
        fromChainId: 2345,
        payToChainId: 2345,
        amountWei: "10000",
        expiresAt: 2000000000,
      },
      intent,
    );

    expect(result.ok).toBe(true);
  });

  it("rejects mismatched amount", () => {
    process.env = { ...original };
    configure();

    const result = validateCreatedOrder(
      {
        orderId: "goat-order-1",
        flow: "ERC20_DIRECT",
        tokenSymbol: "USDC",
        tokenContract: "0x1111111111111111111111111111111111111111",
        payToAddress: "0x3333333333333333333333333333333333333333",
        fromChainId: 2345,
        payToChainId: 2345,
        amountWei: "9999",
        expiresAt: 2000000000,
      },
      intent,
    );

    expect(result).toEqual({ ok: false, reason: "AMOUNT_MISMATCH" });
  });

  it("accepts matching confirmed proof", () => {
    process.env = { ...original };
    configure();

    const result = validateConfirmedOrder(
      {
        orderId: "goat-order-1",
        merchantId: "merchant-1",
        dappOrderId: intent.dappOrderId,
        chainId: 2345,
        tokenContract: "0x1111111111111111111111111111111111111111",
        tokenSymbol: "USDC",
        fromAddress: intent.payerAddress,
        amountWei: "10000",
        status: "PAYMENT_CONFIRMED",
        txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        confirmedAt: "2026-09-02T00:00:00Z",
      },
      {
        payload: {
          order_id: "goat-order-1",
          tx_hash:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          log_index: 1,
          from_addr: intent.payerAddress,
          to_addr: "0x3333333333333333333333333333333333333333",
          amount_wei: "10000",
          from_chain_id: 2345,
          status: "PAYMENT_CONFIRMED",
        },
        signature: "checksum-only",
      },
      intent,
    );

    expect(result.ok).toBe(true);
  });
});
