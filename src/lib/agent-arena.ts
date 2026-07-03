import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, parseUnits } from "ethers";
import type { AgentSide } from "./agents";
import { ARC_TESTNET } from "./arc";

export const AGENT_ARENA_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";

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

/** Read-only provider: prefers injected wallet, falls back to public Arc RPC. */
export function getReadProvider(): BrowserProvider | JsonRpcProvider {
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
  return new JsonRpcProvider(ARC_TESTNET.rpcUrl);
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
  provider?: BrowserProvider | JsonRpcProvider,
): Promise<OnchainMarket> {
  const p = provider ?? getReadProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, p);

  const pools = (await contract.getMarket(marketId)) as [bigint, bigint, bigint, boolean];
  const status = Number(pools[0]);
  const hawkTotalWei = pools[1];
  const doveTotalWei = pools[2];

  const details = (await contract.getMarketFullDetails(marketId)) as [
    bigint, bigint, bigint, bigint, bigint, bigint, string
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
  provider?: BrowserProvider | JsonRpcProvider,
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
  provider?: BrowserProvider | JsonRpcProvider,
): Promise<OnchainMarketFullDetails | null> {
  const p = provider ?? getReadProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, p);
  try {
    const r = (await contract.getMarketFullDetails(marketId)) as [
      bigint, bigint, bigint, bigint, bigint, bigint, string,
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

export async function stakeOnContract(
  marketId: string,
  side: AgentSide,
  amountUsdc: string | number,
): Promise<string> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, signer);
  const value = usdcToWei(amountUsdc);
  const tx = await contract.stake(marketId, SIDE_CODE[side], { value });
  await tx.wait(); // confirm on-chain before recording the position — avoid ghost rows for reverted/pending txs
  return tx.hash as string;
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
  await tx.wait();
  return tx.hash as string;
}
