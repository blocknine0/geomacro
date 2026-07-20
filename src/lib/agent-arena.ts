import {
  BrowserProvider,
  Contract,
  FallbackProvider,
  Interface,
  JsonRpcProvider,
  formatUnits,
  parseUnits,
} from "ethers";
import type { AgentSide } from "./agents";
import { ARC_TESTNET, getArcReadProvider } from "./arc";

export const AGENT_ARENA_ADDRESS = "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";

/** Canonical Multicall3 deployment (same address across chains, incl. Arc Testnet). */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)",
];

/** USDC on Arc is the native gas token with 18 decimals (see src/lib/arc.ts). */
export const ARC_USDC_DECIMALS = 18;

export const AGENT_ARENA_ABI = [
  "function stake(string marketId, uint8 side) payable",
  "function claim(string marketId)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
  "function stakes(string marketId, address user, uint8 side) view returns (uint256)",
  "function claimed(string marketId, address user) view returns (bool)",
] as const;

export const SIDE_CODE: Record<AgentSide, 1 | 2> = { HAWK: 1, DOVE: 2 };
export const SIDE_FROM_CODE: Record<number, AgentSide | null> = {
  0: null,
  1: "HAWK",
  2: "DOVE",
};

export type OnchainMarket = {
  status: number;
  winner: AgentSide | null;
  winnerCode: number;
  hawkTotalWei: bigint;
  doveTotalWei: bigint;
  hawkTotalUsdc: number;
  doveTotalUsdc: number;
  resolved: boolean;
};

export type OnchainStake = {
  hawkWei: bigint;
  doveWei: bigint;
  hawkUsdc: number;
  doveUsdc: number;
};

export type OnchainMarketFullDetails = {
  status: number;
  winner: AgentSide | null;
  winnerCode: number;
  tentativeWinner: AgentSide | null;
  tentativeWinnerCode: number;
  /** ms epoch */
  stakingEndTime: number;
  /** ms epoch */
  resolutionTime: number;
  /** ms epoch, 0 if not yet AI-resolved */
  aiResolutionTime: number;
  disputer: string;
  finalized: boolean;
  aiResolved: boolean;
};

/** Staking closes 2h before resolution regardless of on-chain status. */
export const STAKING_TO_RESOLUTION_BUFFER_MS = 2 * 60 * 60 * 1000;

/** Contract Status enum: 0 OPEN, 1 LOCKED, 2 AI_RESOLVED, 3 DISPUTED, 4 FINALIZED. */
export const MARKET_STATUS = {
  OPEN: 0,
  LOCKED: 1,
  AI_RESOLVED: 2,
  DISPUTED: 3,
  FINALIZED: 4,
} as const;

function getProvider() {
  const eth = (typeof window !== "undefined" ? window.ethereum : undefined) as
    | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
    | undefined;
  if (!eth) throw new Error("No EVM wallet detected");
  return new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
}

/** Read-only provider: prefers injected wallet, falls back to a multi-endpoint
 * FallbackProvider over the hardcoded Arc Testnet RPC list. */
export function getReadProvider(): BrowserProvider | JsonRpcProvider | FallbackProvider {
  const eth = (typeof window !== "undefined" ? window.ethereum : undefined) as
    | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
    | undefined;
  if (eth) {
    try {
      return new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
    } catch {
      /* fall through */
    }
  }
  return getArcReadProvider(ARC_TESTNET);
}

export function weiToUsdc(wei: bigint): number {
  return Number(formatUnits(wei, ARC_USDC_DECIMALS));
}

export function usdcToWei(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toString() : amount;
  return parseUnits(s, ARC_USDC_DECIMALS);
}

export async function readMarket(
  marketId: string,
  provider?: BrowserProvider | JsonRpcProvider | FallbackProvider,
): Promise<OnchainMarket> {
  const p = provider ?? getReadProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, p);

  const pools = (await contract.getMarket(marketId)) as [bigint, bigint, bigint, boolean];
  const status = Number(pools[0]);
  const hawkTotalWei = pools[1];
  const doveTotalWei = pools[2];

  const details = (await contract.getMarketFullDetails(marketId)) as [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    string,
  ];
  const winnerCode = Number(details[1]); // real, final winner — only meaningful once status === FINALIZED (4)

  return {
    status,
    winnerCode,
    winner: SIDE_FROM_CODE[winnerCode] ?? null,
    hawkTotalWei,
    doveTotalWei,
    hawkTotalUsdc: weiToUsdc(hawkTotalWei),
    doveTotalUsdc: weiToUsdc(doveTotalWei),
    resolved: status === 4, // FINALIZED — matches claim()'s own requirement, not just an AI tentative call
  };
}

export async function readMyStake(
  marketId: string,
  user: string,
  provider?: BrowserProvider | JsonRpcProvider | FallbackProvider,
): Promise<OnchainStake> {
  const p = provider ?? getReadProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, p);
  // stakes is a public mapping in AgentArena.sol — no getMyStake() function exists on-chain,
  // so each side must be read as a separate call: stakes(marketId, user, side)
  const [hawkWei, doveWei] = (await Promise.all([
    contract.stakes(marketId, user, SIDE_CODE.HAWK),
    contract.stakes(marketId, user, SIDE_CODE.DOVE),
  ])) as [bigint, bigint];
  return {
    hawkWei,
    doveWei,
    hawkUsdc: weiToUsdc(hawkWei),
    doveUsdc: weiToUsdc(doveWei),
  };
}

/**
 * Read extended market details. Returns null on revert / RPC failure so
 * callers can fall back to Supabase-derived timing.
 */
export async function readMarketFullDetails(
  marketId: string,
  provider?: BrowserProvider | JsonRpcProvider | FallbackProvider,
): Promise<OnchainMarketFullDetails | null> {
  const p = provider ?? getReadProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, p);
  try {
    const r = (await contract.getMarketFullDetails(marketId)) as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      string,
    ];
    const status = Number(r[0]);
    const winnerCode = Number(r[1]);
    const tentativeWinnerCode = Number(r[2]);
    return {
      status,
      winnerCode,
      winner: SIDE_FROM_CODE[winnerCode] ?? null,
      tentativeWinnerCode,
      tentativeWinner: SIDE_FROM_CODE[tentativeWinnerCode] ?? null,
      stakingEndTime: Number(r[3]) * 1000,
      resolutionTime: Number(r[4]) * 1000,
      aiResolutionTime: Number(r[5]) * 1000,
      disputer: r[6],
      finalized: status === MARKET_STATUS.FINALIZED,
      aiResolved: status === MARKET_STATUS.AI_RESOLVED || status === MARKET_STATUS.DISPUTED,
    };
  } catch (e) {
    console.warn("[readMarketFullDetails] failed", { marketId, error: e });
    return null;
  }
}

async function withRpcRetry<T>(
  fn: () => Promise<T>,
  { retries = 6, baseDelayMs = 1500 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      // 🛡️ FIX: was only matching "429" / "rate limit" / "Too Many Requests" —
      // Arc Testnet's actual RPC error is `{ code: -32011, message: "request
      // limit reached" }`, which matches NONE of those substrings. Same gap
      // that existed (and was fixed) in the backend scripts — broadened to
      // match "request limit" too, and check the error code directly when
      // present, not just the message string.
      const err = e as { code?: number; error?: { code?: number; message?: string }; message?: string };
      const code = err?.error?.code ?? err?.code;
      const message = String(err?.error?.message ?? err?.message ?? e);
      const isRateLimited =
        code === -32007 ||
        code === -32011 ||
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("request limit") ||
        message.includes("Too Many Requests");
      if (!isRateLimited || attempt === retries) throw e;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`[withRpcRetry] rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function stakeOnContract(
  marketId: string,
  side: AgentSide,
  amountUsdc: string | number,
): Promise<{ hash: string; confirmed: Promise<{ success: boolean; error?: string }> }> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, signer);
  const value = usdcToWei(amountUsdc);
  const tx = await contract.stake(marketId, SIDE_CODE[side], { value });
  // Return as soon as the wallet has broadcast the tx so the caller can
  // record the position immediately, avoiding "ghost stakes" where an RPC
  // hiccup during confirmation polling leaves a paid stake un-recorded.
  // The `confirmed` promise resolves later with the on-chain outcome so
  // callers can log/track confirmation in the background.
  const confirmed: Promise<{ success: boolean; error?: string }> = withRpcRetry(() => tx.wait())
    .then(() => ({ success: true }))
    .catch((err: unknown) => ({
      success: false,
      error: (err as Error)?.message ?? String(err),
    }));
  return { hash: tx.hash as string, confirmed };
}

/**
 * WIRING NOTE for whoever calls stakeOnContract() (e.g. the stake dialog in
 * routes/index.tsx):
 *
 *   const txHash = await stakeOnContract(marketId, side, amountUsdc);
 *   if (session) {
 *     await callRecordStake({
 *       data: {
 *         token: session.token,
 *         marketId: eventDbId,        // events.id (uuid) — NOT the "mkt_..." string id
 *         side,
 *         stakedAmountRaw: usdcToWei(amountUsdc).toString(),
 *         txHash,
 *       },
 *     });
 *   }
 *
 * `session` comes from useWallet()'s SIWE session — if the wallet hasn't
 * signed in yet, prompt signIn() before allowing a stake, otherwise the
 * position never gets recorded and Portfolio stays empty for that stake.
 */

export async function claimOnContract(marketId: string): Promise<string> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, signer);
  const tx = await contract.claim(marketId);
  await withRpcRetry(() => tx.wait());
  return tx.hash as string;
}

// ---------------------------------------------------------------------------
// Multicall3-based batch reads
//
// Each per-market on-chain read (getMarket, getMarketFullDetails, stakes) is
// its own eth_call round-trip. At ~100 active markets that's hundreds of RPC
// requests per 30s poll and gets us rate-limited. The helpers below encode
// every per-market call into a single Multicall3.aggregate3() batch so one
// eth_call covers the whole set.
// ---------------------------------------------------------------------------

type MulticallResult = { success: boolean; returnData: string };

const arenaInterface = new Interface(AGENT_ARENA_ABI as unknown as string[]);

function decodeMarketPair(
  marketRes: MulticallResult | undefined,
  detailsRes: MulticallResult | undefined,
): OnchainMarket | null {
  if (!marketRes?.success || !detailsRes?.success) return null;
  try {
    const pools = arenaInterface.decodeFunctionResult("getMarket", marketRes.returnData) as unknown as [
      bigint,
      bigint,
      bigint,
      boolean,
    ];
    const details = arenaInterface.decodeFunctionResult("getMarketFullDetails", detailsRes.returnData) as unknown as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      string,
    ];
    const status = Number(pools[0]);
    const hawkTotalWei = pools[1];
    const doveTotalWei = pools[2];
    const winnerCode = Number(details[1]);
    return {
      status,
      winnerCode,
      winner: SIDE_FROM_CODE[winnerCode] ?? null,
      hawkTotalWei,
      doveTotalWei,
      hawkTotalUsdc: weiToUsdc(hawkTotalWei),
      doveTotalUsdc: weiToUsdc(doveTotalWei),
      resolved: status === 4,
    };
  } catch (e) {
    console.warn("[batchReadMarkets] decode failed", e);
    return null;
  }
}

function decodeFullDetails(res: MulticallResult | undefined): OnchainMarketFullDetails | null {
  if (!res?.success) return null;
  try {
    const r = arenaInterface.decodeFunctionResult("getMarketFullDetails", res.returnData) as unknown as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      string,
    ];
    const status = Number(r[0]);
    const winnerCode = Number(r[1]);
    const tentativeWinnerCode = Number(r[2]);
    return {
      status,
      winnerCode,
      winner: SIDE_FROM_CODE[winnerCode] ?? null,
      tentativeWinnerCode,
      tentativeWinner: SIDE_FROM_CODE[tentativeWinnerCode] ?? null,
      stakingEndTime: Number(r[3]) * 1000,
      resolutionTime: Number(r[4]) * 1000,
      aiResolutionTime: Number(r[5]) * 1000,
      disputer: r[6],
      finalized: status === MARKET_STATUS.FINALIZED,
      aiResolved: status === MARKET_STATUS.AI_RESOLVED || status === MARKET_STATUS.DISPUTED,
    };
  } catch (e) {
    console.warn("[batchReadMarketFullDetails] decode failed", e);
    return null;
  }
}

/**
 * Batch-read `getMarket` + `getMarketFullDetails` for every marketId in one
 * Multicall3 aggregate3() call. Individual per-market failures are logged and
 * skipped (allowFailure: true) rather than throwing.
 */
export async function batchReadMarkets(
  marketIds: string[],
  provider?: BrowserProvider | JsonRpcProvider | FallbackProvider,
): Promise<Record<string, OnchainMarket>> {
  if (marketIds.length === 0) return {};
  const p = provider ?? getReadProvider();
  const multicall = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, p);
  const calls = marketIds.flatMap((id) => [
    {
      target: AGENT_ARENA_ADDRESS,
      allowFailure: true,
      callData: arenaInterface.encodeFunctionData("getMarket", [id]),
    },
    {
      target: AGENT_ARENA_ADDRESS,
      allowFailure: true,
      callData: arenaInterface.encodeFunctionData("getMarketFullDetails", [id]),
    },
  ]);
  const raw = (await multicall.aggregate3(calls)) as MulticallResult[];
  const out: Record<string, OnchainMarket> = {};
  marketIds.forEach((id, i) => {
    const decoded = decodeMarketPair(raw[i * 2], raw[i * 2 + 1]);
    if (decoded) {
      out[id] = decoded;
    } else {
      console.warn("[batchReadMarkets] call failed for market", id);
    }
  });
  return out;
}

/**
 * Batch-read `getMarketFullDetails` for every marketId in one Multicall3 call.
 * Companion to batchReadMarkets — returns the extended lifecycle/timing view
 * the arena loader needs alongside the OnchainMarket totals.
 */
export async function batchReadMarketFullDetails(
  marketIds: string[],
  provider?: BrowserProvider | JsonRpcProvider | FallbackProvider,
): Promise<Record<string, OnchainMarketFullDetails | null>> {
  if (marketIds.length === 0) return {};
  const p = provider ?? getReadProvider();
  const multicall = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, p);
  const calls = marketIds.map((id) => ({
    target: AGENT_ARENA_ADDRESS,
    allowFailure: true,
    callData: arenaInterface.encodeFunctionData("getMarketFullDetails", [id]),
  }));
  const raw = (await multicall.aggregate3(calls)) as MulticallResult[];
  const out: Record<string, OnchainMarketFullDetails | null> = {};
  marketIds.forEach((id, i) => {
    out[id] = decodeFullDetails(raw[i]);
  });
  return out;
}

/**
 * Batch-read the caller's HAWK + DOVE stakes for every marketId in one
 * Multicall3 call. Empty input skips the RPC entirely.
 */
export async function batchReadMyStakes(
  marketIds: string[],
  user: string,
  provider?: BrowserProvider | JsonRpcProvider | FallbackProvider,
): Promise<Record<string, OnchainStake>> {
  if (marketIds.length === 0) return {};
  const p = provider ?? getReadProvider();
  const multicall = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, p);
  const calls = marketIds.flatMap((id) => [
    {
      target: AGENT_ARENA_ADDRESS,
      allowFailure: true,
      callData: arenaInterface.encodeFunctionData("stakes", [id, user, SIDE_CODE.HAWK]),
    },
    {
      target: AGENT_ARENA_ADDRESS,
      allowFailure: true,
      callData: arenaInterface.encodeFunctionData("stakes", [id, user, SIDE_CODE.DOVE]),
    },
  ]);
  const raw = (await multicall.aggregate3(calls)) as MulticallResult[];
  const out: Record<string, OnchainStake> = {};
  marketIds.forEach((id, i) => {
    const hawkRes = raw[i * 2];
    const doveRes = raw[i * 2 + 1];
    if (!hawkRes?.success || !doveRes?.success) {
      console.warn("[batchReadMyStakes] call failed for market", id);
      return;
    }
    try {
      const [hawkWei] = arenaInterface.decodeFunctionResult("stakes", hawkRes.returnData) as unknown as [bigint];
      const [doveWei] = arenaInterface.decodeFunctionResult("stakes", doveRes.returnData) as unknown as [bigint];
      out[id] = {
        hawkWei,
        doveWei,
        hawkUsdc: weiToUsdc(hawkWei),
        doveUsdc: weiToUsdc(doveWei),
      };
    } catch (e) {
      console.warn("[batchReadMyStakes] decode failed", id, e);
    }
  });
  return out;
}
