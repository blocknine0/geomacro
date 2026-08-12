/**
 * dispute-bond.ts
 * ---------------------------------------------------------------
 * Mirrors AgentArenaV2.sol's dispute bond math EXACTLY:
 *   requiredBond = clamp(callerLosingStake * 800bps / 10000, $1, $40)
 * (contracts/AgentArenaV2.sol lines 36-48, 314)
 *
 * raiseDispute() requires msg.value === requiredBond exactly (not >=), so
 * the frontend MUST compute this the same way the contract does or every
 * dispute attempt reverts with "Incorrect bond amount".
 *
 * Constants now live in dispute-config.ts (single source of truth) —
 * this file is pure math over those constants.
 * ---------------------------------------------------------------
 */

import { DISPUTE_BOND_BPS, DISPUTE_BOND_FLOOR_WEI, DISPUTE_BOND_CAP_WEI } from "./dispute-config";

/** Losing side is whichever side did NOT win the AI's tentative verdict. */
export function losingSide(tentativeWinnerCode: number): 1 | 2 {
  return tentativeWinnerCode === 1 ? 2 : 1; // HAWK=1, DOVE=2
}

/**
 * @param losingStakeWei the caller's own stake (in wei, 18 decimals) on the
 *   side that lost the AI's tentative verdict — get this from
 *   readMyStake(marketId, address) in agent-arena.ts, picking hawkWei or
 *   doveWei based on losingSide().
 */
export function computeDisputeBondWei(losingStakeWei: bigint): bigint {
  const raw = (losingStakeWei * DISPUTE_BOND_BPS) / 10000n;
  if (raw < DISPUTE_BOND_FLOOR_WEI) return DISPUTE_BOND_FLOOR_WEI;
  if (raw > DISPUTE_BOND_CAP_WEI) return DISPUTE_BOND_CAP_WEI;
  return raw;
}

/** True if the caller has zero stake on the losing side — raiseDispute()
 * would revert with "Must have staked on the losing side" for them. */
export function canDispute(losingStakeWei: bigint): boolean {
  return losingStakeWei > 0n;
}
