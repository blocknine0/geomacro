import { Contract } from "ethers";
// getProvider is exported from agent-arena.ts (already fixed in the delivered
// version — no edit needed if you're using that file as-is).
import { AGENT_ARENA_ADDRESS, getReadProvider, getProvider } from "./agent-arena";

/**
 * agent-arena-v2.ts
 * ---------------------------------------------------------------
 * V2-only dispute functions, kept separate from agent-arena.ts rather than
 * merged into AGENT_ARENA_ABI there, so the V1-only surface (still used by
 * markets mid-lifecycle under the old contract) doesn't need touching.
 *
 * IMPORTANT: AGENT_ARENA_ADDRESS in agent-arena.ts still points at the V1
 * proxy (0xC026...) until the V2 redeploy lands and that constant is
 * updated. These functions will simply call the wrong contract until then
 * — that's expected, not a bug in this file.
 * ---------------------------------------------------------------
 */

export const AGENT_ARENA_V2_DISPUTE_ABI = [
  "function raiseDispute(string marketId) payable",
  "function getDispute(string marketId) view returns (uint256 overturnVotes, uint256 upholdVotes, bool resolved)",
  "function hasJuryVoted(string marketId, address juror) view returns (bool)",
  "function getJuryMembers() view returns (address[5])",
] as const;

export type OnchainDisputeTally = {
  overturnVotes: number;
  upholdVotes: number;
  resolved: boolean;
};

/**
 * Submits raiseDispute(marketId) with the exact bond computed by
 * computeDisputeBondWei() (see dispute-bond.ts). Caller must connect a
 * wallet holding losing-side stake on this market, or the tx reverts.
 */
export async function raiseDisputeOnContract(marketId: string, bondWei: bigint): Promise<string> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_V2_DISPUTE_ABI, signer);
  const tx = await contract.raiseDispute(marketId, { value: bondWei });
  await tx.wait();
  return tx.hash as string;
}

/** On-chain vote tally — source of truth. jury_votes in Supabase is a
 * transparency mirror; prefer this for the live overturn/uphold count if
 * you need it to be trustless, fall back to Supabase for reasoning text
 * (which isn't stored on-chain). */
export async function readDisputeTally(marketId: string): Promise<OnchainDisputeTally> {
  const provider = getReadProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_V2_DISPUTE_ABI, provider);
  const [overturnVotes, upholdVotes, resolved] = (await contract.getDispute(marketId)) as [bigint, bigint, boolean];
  return {
    overturnVotes: Number(overturnVotes),
    upholdVotes: Number(upholdVotes),
    resolved,
  };
}
