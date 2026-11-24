const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TX_RE = /^0x[a-fA-F0-9]{64}$/u;

export const GEOMACRO_MAINNET_USDC_RECIPIENT =
  "0x95ba71d21c41bda8bba9533f96d25f793e4137b5" as const;

export const MAINNET_USDC_PAY_PER_CALL_CHAINS = Object.freeze({
  base: Object.freeze({
    id: "base" as const,
    name: "Base",
    chainId: 8453,
    caip2: "eip155:8453" as const,
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
    rpcUrl: "https://mainnet.base.org",
    freeFacilitator: "https://x402.dexter.cash",
  }),
  polygon: Object.freeze({
    id: "polygon" as const,
    name: "Polygon PoS",
    chainId: 137,
    caip2: "eip155:137" as const,
    asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const,
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    freeFacilitator: "https://x402.dexter.cash",
  }),
  arc: Object.freeze({
    id: "arc" as const,
    name: "Arc",
    chainId: 5042,
    caip2: "eip155:5042" as const,
    asset: "0x3600000000000000000000000000000000000000" as const,
    rpcUrl: "https://rpc.mainnet.arc.io",
    freeFacilitator: null,
  }),
} as const);

export type MainnetUsdcChainId = keyof typeof MAINNET_USDC_PAY_PER_CALL_CHAINS;

type RpcLog = { address?: string; topics?: string[]; data?: string };
type RpcReceipt = {
  transactionHash?: string;
  status?: string;
  blockNumber?: string;
  logs?: RpcLog[];
};

async function jsonRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  fetcher: typeof fetch,
): Promise<T> {
  const res = await fetcher(rpcUrl, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`RPC_HTTP_${res.status}`);
  const data = (await res.json()) as { result?: T; error?: { message?: string } };
  if (data.error || data.result === undefined) {
    throw new Error(data.error?.message || "RPC_EMPTY_RESULT");
  }
  return data.result;
}

export async function verifyMainnetUsdcTransferReceipt(input: {
  network: MainnetUsdcChainId;
  txHash: string;
  minAmountAtomic: string;
  rpcUrlOverride?: string;
  fetcher?: typeof fetch;
}) {
  const chain = MAINNET_USDC_PAY_PER_CALL_CHAINS[input.network];
  if (!chain || !TX_RE.test(input.txHash) || !/^[1-9][0-9]*$/u.test(input.minAmountAtomic)) {
    throw new Error("INVALID_USDC_PROOF_INPUT");
  }
  const rpcUrl = input.rpcUrlOverride || chain.rpcUrl;
  const fetcher = input.fetcher ?? fetch;
  const [reportedChainId, receipt, latestBlock] = await Promise.all([
    jsonRpc<string>(rpcUrl, "eth_chainId", [], fetcher),
    jsonRpc<RpcReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [input.txHash], fetcher),
    jsonRpc<string>(rpcUrl, "eth_blockNumber", [], fetcher),
  ]);
  if (reportedChainId.toLowerCase() !== "0x" + chain.chainId.toString(16)) {
    throw new Error("USDC_RPC_WRONG_CHAIN");
  }
  if (
    !receipt ||
    receipt.status !== "0x1" ||
    receipt.transactionHash?.toLowerCase() !== input.txHash.toLowerCase() ||
    !receipt.blockNumber?.startsWith("0x") ||
    !latestBlock.startsWith("0x")
  ) {
    throw new Error("USDC_TX_NOT_CONFIRMED");
  }
  if (BigInt(latestBlock) < BigInt(receipt.blockNumber)) {
    throw new Error("USDC_TX_BLOCK_PENDING");
  }
  const toTopic =
    "0x" + GEOMACRO_MAINNET_USDC_RECIPIENT.slice(2).toLowerCase().padStart(64, "0");
  const minAtomic = BigInt(input.minAmountAtomic);
  const matched = (receipt.logs ?? []).filter(
    (log) =>
      log.address?.toLowerCase() === chain.asset.toLowerCase() &&
      Array.isArray(log.topics) &&
      log.topics.length === 3 &&
      log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      log.topics[2]?.toLowerCase() === toTopic &&
      typeof log.data === "string" &&
      /^0x[0-9a-fA-F]+$/u.test(log.data) &&
      BigInt(log.data) >= minAtomic,
  );
  if (matched.length === 0) {
    throw new Error("USDC_TRANSFER_TO_RECEIVER_NOT_FOUND");
  }
  const log = matched[0];
  const fromTopic = log.topics?.[1] ?? "";
  const payer = /^0x0{24}[0-9a-fA-F]{40}$/u.test(fromTopic)
    ? "0x" + fromTopic.slice(-40).toLowerCase()
    : null;
  return {
    confirmed: true as const,
    network: chain.id,
    caip2: chain.caip2,
    asset: chain.asset,
    recipient: GEOMACRO_MAINNET_USDC_RECIPIENT,
    amount_atomic: BigInt(log.data!).toString(),
    tx_hash: input.txHash.toLowerCase(),
    payer,
  };
}
