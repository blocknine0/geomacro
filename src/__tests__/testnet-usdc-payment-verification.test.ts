import { id, zeroPadValue } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  verifyTestnetUsdcPayment,
} from "../lib/testnet-usdc-payment-verification.server";
import {
  TESTNET_USDC_ACCESS_CHAINS,
} from "../lib/testnet-usdc-access-contract";

const receiver = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const txHash = `0x${"ab".repeat(32)}`;
const transferTopic = id("Transfer(address,address,uint256)");

function topicAddress(address: string) {
  return zeroPadValue(address, 32);
}

function response(result: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
}

function env() {
  return {
    TESTNET_USDC_RECEIVER_ADDRESS: receiver,
    TESTNET_RPC_BASE_SEPOLIA: "https://rpc.example.test",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("testnet USDC payment verification", () => {
  it("accepts the exact 0.5 USDC boundary on a confirmed supported-chain transfer to the dedicated receiver", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response({
        status: "0x1",
        blockNumber: "0x123",
        logs: [{
          address: chain.usdc_address,
          topics: [transferTopic, topicAddress(payer), topicAddress(receiver)],
          data: "0x7a120",
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toMatchObject({
      ok: true,
      chain_key: "baseSepolia",
      payer_address: payer,
      recipient_address: receiver,
      amount_atomic: "500000",
      amount_usdc: "0.5",
      environment: "testnet",
      revenue_classification: "testnet_non_revenue",
    });
  });

  it("fails closed when the configured RPC is for the wrong chain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => response("0xaa36a7")));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "RPC_IDENTITY_MISMATCH" });
  });

  it("rejects any amount below 0.5 USDC", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response({
        status: "0x1",
        blockNumber: "0x123",
        logs: [{
          address: chain.usdc_address,
          topics: [transferTopic, topicAddress(payer), topicAddress(receiver)],
          data: "0x7a11f",
        }],
      })));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "UNDERPAYMENT" });
  });

  it("rejects a valid USDC transfer sent to a different recipient", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response({
        status: "0x1",
        blockNumber: "0x123",
        logs: [{
          address: chain.usdc_address,
          topics: [transferTopic, topicAddress(payer), topicAddress(other)],
          data: "0x7a120",
        }],
      })));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "WRONG_RECIPIENT" });
  });

  it("rejects a transfer to the correct receiver when it came from another wallet", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response({
        status: "0x1",
        blockNumber: "0x123",
        logs: [{
          address: chain.usdc_address,
          topics: [transferTopic, topicAddress(other), topicAddress(receiver)],
          data: "0x7a120",
        }],
      })));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "UNDERPAYMENT" });
  });

  it("rejects a transfer emitted by a non-USDC token contract", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response({
        status: "0x1",
        blockNumber: "0x123",
        logs: [{
          address: other,
          topics: [transferTopic, topicAddress(payer), topicAddress(receiver)],
          data: "0x7a120",
        }],
      })));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "USDC_TRANSFER_NOT_FOUND" });
  });

  it("rejects missing or unconfirmed receipts", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response(null)));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "TX_NOT_CONFIRMED" });
  });

  it("rejects reverted transactions", async () => {
    const chain = TESTNET_USDC_ACCESS_CHAINS.baseSepolia;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(chain.chain_id_hex))
      .mockImplementationOnce(() => response({ status: "0x0", blockNumber: "0x123", logs: [] })));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "TX_REVERTED" });
  });

  it("fails closed when the RPC is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: txHash,
      expected_payer: payer,
      env: env(),
    });

    expect(result).toEqual({ ok: false, code: "RPC_UNAVAILABLE" });
  });

  it("rejects unsupported chains and malformed transaction hashes before RPC", async () => {
    const unsupported = await verifyTestnetUsdcPayment({
      chain_key: "ethereum-mainnet",
      tx_hash: txHash,
      env: env(),
    });
    const malformed = await verifyTestnetUsdcPayment({
      chain_key: "baseSepolia",
      tx_hash: "0x1234",
      env: env(),
    });

    expect(unsupported).toEqual({ ok: false, code: "UNSUPPORTED_CHAIN" });
    expect(malformed).toEqual({ ok: false, code: "INVALID_TX_HASH" });
  });
});
