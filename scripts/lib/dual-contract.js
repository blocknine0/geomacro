// scripts/lib/dual-contract.js
// ---------------------------------------------------------------
// Shared helper so resolve-markets.js, finalize-markets.js, and
// sync-stakes.js route each market to the RIGHT contract (V1 legacy vs
// V2) the same way sync-lifecycle.js already does — instead of assuming
// every market lives on whatever CONTRACT_ADDRESS currently points to.
//
// WHY THIS MATTERS: once CONTRACT_ADDRESS is switched to the new V2
// proxy, any V1 market still mid-lifecycle (staking closed but not yet
// AI-resolved, or resolved but not yet finalized) would otherwise get
// silently orphaned — these three scripts would only ever query V2 and
// simply never see those markets again. sync-lifecycle.js already
// solved this (it's the reason `market_address` exists on `events` at
// all); this module lets the other three scripts reuse the exact same
// logic instead of three slightly-different reimplementations.
// ---------------------------------------------------------------
import { ethers } from "ethers";

export const OLD_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.OLD_CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe").toLowerCase()
);

/** True if this event row belongs to the legacy (V1) contract. A missing
 * market_address (rows written before that column existed) defaults to
 * legacy, matching sync-lifecycle.js's own fallback. */
export function isLegacyEvent(event, oldAddress = OLD_CONTRACT_ADDRESS) {
  return (event.market_address || oldAddress).toLowerCase() === oldAddress.toLowerCase();
}

/** Splits a list of event rows into { legacyEvents, v2Events } using the
 * same rule sync-lifecycle.js uses — mutually exclusive even during the
 * window where CONTRACT_ADDRESS still equals OLD_CONTRACT_ADDRESS
 * (V2 deployed but not yet activated), so nothing gets double-processed. */
export function partitionEventsByContract(events, contractAddress, oldAddress = OLD_CONTRACT_ADDRESS) {
  const legacyEvents = events.filter((e) => isLegacyEvent(e, oldAddress));
  const v2Events = events.filter(
    (e) =>
      e.market_address &&
      e.market_address.toLowerCase() === contractAddress.toLowerCase() &&
      e.market_address.toLowerCase() !== oldAddress.toLowerCase()
  );
  return { legacyEvents, v2Events };
}

/** Pick the right address + ABI for a single event row. Pass your
 * script's own new-contract ABI and old-contract ABI (they may be
 * identical for functions unchanged since V1, like declareWinnerByAI —
 * only getMarketFullDetails' return shape actually differs). */
export function resolveTarget(event, newAbi, oldAbi, contractAddress, oldAddress = OLD_CONTRACT_ADDRESS) {
  const legacy = isLegacyEvent(event, oldAddress);
  return {
    address: legacy ? oldAddress : contractAddress,
    abi: legacy ? oldAbi : newAbi,
    isLegacy: legacy,
  };
}
