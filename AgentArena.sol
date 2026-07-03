import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import type { AgentSide } from "./agents";

export const AGENT_ARENA_ADDRESS = "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";

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

function getProvider() {
  const eth = (typeof window !== "undefined" ? window.ethereum : undefined) as
    | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
    | undefined;
  if (!eth) throw new Error("No EVM wallet detected");
  return new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
}

function weiToUsdc(wei: bigint): number {
  return Number(formatUnits(wei, ARC_USDC_DECIMALS));
}

export function usdcToWei(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toString() : amount;
  return parseUnits(s, ARC_USDC_DECIMALS);
}

export async function readMarket(marketId: string): Promise<OnchainMarket> {
  const provider = getProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, provider);

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

export async function readMyStake(marketId: string, user: string): Promise<OnchainStake> {
  const provider = getProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, provider);
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
