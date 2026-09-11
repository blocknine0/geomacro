import { id, zeroPadValue } from "ethers";

import {
  TESTNET_USDC_ACCESS_CHAINS,
  TESTNET_USDC_ACCESS_PRICE_ATOMIC,
  requireTestnetUsdcReceiver,
  type TestnetUsdcChainKey,
} from "./testnet-usdc-access-contract";

const TRANSFER_TOPIC = id("Transfer(address,address,uint256)").toLowerCase();

const RPC_ENV_BY_CHAIN: Record<TestnetUsdcChainKey, string> = {
  arcTestnet: "TESTNET_RPC_ARC",
  baseSepolia: "TESTNET_RPC_BASE_SEPOLIA",
  polygonAmoy: "TESTNET_RPC_POLYGON_AMOY",
};

export type TestnetUsdcPaymentVerification = {
  ok: true;
  chain_key: TestnetUsdcChainKey;
  chain_id: number;
  tx_hash: string;
  payer_address: string;
  recipient_address: string;
  usdc_contract: string;
  amount_atomic: string;
  amount_usdc: string;
  block_number: string;
  environment: "testnet";
  revenue_classification: "testnet_non_revenue";
} | {
  ok: false;
  code:
    | "UNSUPPORTED_CHAIN"
    | "INVALID_TX_HASH"
    | "RPC_NOT_CONFIGURED"
    | "RPC_IDENTITY_MISMATCH"
    | "RPC_UNAVAILABLE"
    | "TX_NOT_CONFIRMED"
    | "TX_REVERTED"
    | "USDC_TRANSFER_NOT_FOUND"
    | "WRONG_RECIPIENT"
    | "UNDERPAYMENT";
};

type RpcResponse<T> = {
  jsonrpc?: string;
  id?: number;
  result?: T | null;
  error?: { code?: number; message?: string };
};

type ReceiptLog = {
  address?: string;
  topics?: string[];
  data?: string;
};

type RpcReceipt = {
  status?: string;
  blockNumber?: string;
  logs?: ReceiptLog[];
};

function normalizeAddress(value: string) {
  return value.toLowerCase();
}

function topicAddress(address: string) {
  return zeroPadValue(address, 32).toLowerCase();
}

function decodeTopicAddress(topic: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function parseHexQuantity(value: string | undefined) {
  if (!value || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function formatUsdc(amount: bigint) {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("RPC HTTP failure");
    const payload = (await response.json()) as RpcResponse<T>;
    if (payload.error || payload.result === undefined) throw new Error("RPC JSON-RPC failure");
    return payload.result ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyTestnetUsdcPayment(input: {
  chain_key: string;
  tx_hash: string;
  expected_payer?: string | null;
  minimum_amount_atomic?: bigint;
  env?: Record<string, string | undefined>;
}): Promise<TestnetUsdcPaymentVerification> {
  const env = input.env ?? process.env;
  const minimumAmountAtomic = input.minimum_amount_atomic ?? TESTNET_USDC_ACCESS_PRICE_ATOMIC;
  if (minimumAmountAtomic < 1n) throw new Error("TESTNET_PAYMENT_MINIMUM_INVALID");

  if (!(input.chain_key in TESTNET_USDC_ACCESS_CHAINS)) {
    return { ok: false, code: "UNSUPPORTED_CHAIN" };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.tx_hash)) {
    return { ok: false, code: "INVALID_TX_HASH" };
  }

  const chainKey = input.chain_key as TestnetUsdcChainKey;
  const chain = TESTNET_USDC_ACCESS_CHAINS[chainKey];
  const rpcUrl = String(env[RPC_ENV_BY_CHAIN[chainKey]] ?? "").trim();
  if (!rpcUrl || !/^https:\/\//i.test(rpcUrl)) {
    return { ok: false, code: "RPC_NOT_CONFIGURED" };
  }

  let expectedRecipient: string;
  try {
    expectedRecipient = requireTestnetUsdcReceiver(env);
  } catch {
    return { ok: false, code: "WRONG_RECIPIENT" };
  }

  try {
    const rawChainId = await rpcCall<string>(rpcUrl, "eth_chainId", []);
    const remoteChainId = parseHexQuantity(rawChainId ?? undefined);
    if (remoteChainId !== BigInt(chain.chain_id)) {
      return { ok: false, code: "RPC_IDENTITY_MISMATCH" };
    }

    const receipt = await rpcCall<RpcReceipt>(rpcUrl, "eth_getTransactionReceipt", [input.tx_hash]);
    if (!receipt?.blockNumber) return { ok: false, code: "TX_NOT_CONFIRMED" };
    if (parseHexQuantity(receipt.status) !== 1n) return { ok: false, code: "TX_REVERTED" };

    const expectedToken = normalizeAddress(chain.usdc_address);
    const expectedRecipientTopic = topicAddress(expectedRecipient);
    const expectedPayer = input.expected_payer ? normalizeAddress(input.expected_payer) : null;

    let sawUsdcTransfer = false;
    let sawWrongRecipient = false;
    let largestMatchingAmount = 0n;
    let payer = "";

    for (const log of receipt.logs ?? []) {
      const topics = log.topics ?? [];
      if (
        normalizeAddress(String(log.address ?? "")) !== expectedToken ||
        String(topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC ||
        topics.length < 3
      ) {
        continue;
      }
      sawUsdcTransfer = true;

      const from = decodeTopicAddress(topics[1] ?? "");
      const toTopic = String(topics[2] ?? "").toLowerCase();
      const to = decodeTopicAddress(topics[2] ?? "");
      const amount = parseHexQuantity(log.data);
      if (!from || !to || amount === null) continue;
      if (expectedPayer && from !== expectedPayer) continue;
      if (toTopic !== expectedRecipientTopic) {
        sawWrongRecipient = true;
        continue;
      }
      if (amount > largestMatchingAmount) {
        largestMatchingAmount = amount;
        payer = from;
      }
    }

    if (!sawUsdcTransfer) return { ok: false, code: "USDC_TRANSFER_NOT_FOUND" };
    if (largestMatchingAmount === 0n && sawWrongRecipient) {
      return { ok: false, code: "WRONG_RECIPIENT" };
    }
    if (largestMatchingAmount < minimumAmountAtomic) {
      return { ok: false, code: "UNDERPAYMENT" };
    }

    return {
      ok: true,
      chain_key: chainKey,
      chain_id: chain.chain_id,
      tx_hash: input.tx_hash.toLowerCase(),
      payer_address: payer,
      recipient_address: expectedRecipient,
      usdc_contract: expectedToken,
      amount_atomic: largestMatchingAmount.toString(),
      amount_usdc: formatUsdc(largestMatchingAmount),
      block_number: receipt.blockNumber,
      environment: "testnet",
      revenue_classification: "testnet_non_revenue",
    };
  } catch {
    return { ok: false, code: "RPC_UNAVAILABLE" };
  }
}

export const TESTNET_USDC_RPC_ENV_BY_CHAIN = RPC_ENV_BY_CHAIN;
