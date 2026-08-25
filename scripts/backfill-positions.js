// scripts/backfill-positions.js
// One-time reconciliation for positions that are still "active" even though
// their market is already finalized.
//
// Dual-contract rule:
// - V1 remains readable for historical markets/positions/claims.
// - V2 is current for new markets.
// - Routing uses events.market_address.
// - Missing market_address defaults to V1 for backward compatibility.

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const OLD_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.OLD_CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe").toLowerCase()
);

const CURRENT_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.CONTRACT_ADDRESS || "0x2F874FB07084a22D2bB314D0762Af57Cb1856868").toLowerCase()
);

const PROTOCOL_FEE_BPS = 150n;
const FIXED_PROFIT_BPS = 10000n;

const V1_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];

const V2_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer, uint256 disputeBond, uint256 disputeRaisedAt)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function fixedOddsMarket(string marketId) view returns (bool)",
];

const SIDE_LABEL = { 0: "NONE", 1: "HAWK", 2: "DOVE" };

function computePayout(userStaked, winningPoolTotal, losingPoolTotal, fixedOdds = false) {
  if (fixedOdds) {
    const grossProfit = (userStaked * FIXED_PROFIT_BPS) / 10000n;
    const platformFee = (grossProfit * PROTOCOL_FEE_BPS) / 10000n;
    return userStaked + grossProfit - platformFee;
  }

  let payout = userStaked;
  if (winningPoolTotal > 0n && losingPoolTotal > 0n) {
    payout += (userStaked * losingPoolTotal) / winningPoolTotal;
  }

  const platformFee = (payout * PROTOCOL_FEE_BPS) / 10000n;
  return payout - platformFee;
}

async function syncPositionsForMarket(
  adminSupabase,
  eventId,
  winSideLabel,
  hawkTotal,
  doveTotal,
  fixedOdds = false
) {
  const { data: activePositions, error } = await adminSupabase
    .from("positions")
    .select("*")
    .eq("market_id", eventId)
    .eq("status", "active");

  if (error) {
    console.error(`  ⚠️ Could not fetch positions for event ${eventId}: ${error.message}`);
    return 0;
  }

  if (!activePositions || activePositions.length === 0) return 0;

  const winningPoolTotal = winSideLabel === "HAWK" ? hawkTotal : doveTotal;
  const losingPoolTotal = winSideLabel === "HAWK" ? doveTotal : hawkTotal;

  for (const position of activePositions) {
    const won = position.side === winSideLabel;
    const nowIso = new Date().toISOString();

    if (won) {
      const staked = BigInt(position.staked_amount_raw);
      const payoutRaw = computePayout(
        staked,
        winningPoolTotal,
        losingPoolTotal,
        fixedOdds
      );

      const payoutDisplay = Number(ethers.formatUnits(payoutRaw, 18));

      await adminSupabase
        .from("positions")
        .update({
          status: "pending_claim",
          resolved_outcome: winSideLabel,
          payout_amount: payoutDisplay,
          updated_at: nowIso,
        })
        .eq("id", position.id);

      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: payoutDisplay,
        event_type: "resolve",
        market_id: eventId,
        amount_delta: payoutDisplay,
      });
    } else {
      await adminSupabase
        .from("positions")
        .update({
          status: "lost",
          resolved_outcome: winSideLabel,
          payout_amount: 0,
          updated_at: nowIso,
        })
        .eq("id", position.id);

      const stakedDisplay = Number(
        ethers.formatUnits(position.staked_amount_raw, 18)
      );

      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: 0,
        event_type: "resolve",
        market_id: eventId,
        amount_delta: -stakedDisplay,
      });
    }
  }

  console.log(
    `  ✅ Backfilled ${activePositions.length} position(s) for event ${eventId} (winner: ${winSideLabel}, fixedOdds: ${fixedOdds})`
  );

  return activePositions.length;
}

async function main() {
  const {
    APP_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ARC_RPC_URL,
  } = process.env;

  if (!APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ARC_RPC_URL) {
    throw new Error(
      "Missing env: APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL required."
    );
  }

  const adminSupabase = createClient(
    APP_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

  const { data: activePositions, error: posErr } = await adminSupabase
    .from("positions")
    .select("market_id")
    .eq("status", "active");

  if (posErr) {
    throw new Error(`Could not read positions: ${posErr.message}`);
  }

  const marketIds = Array.from(
    new Set((activePositions ?? []).map((p) => p.market_id))
  );

  console.log(
    `Found ${marketIds.length} distinct market(s) with active positions. Checking V1 + V2 onchain state...\n`
  );

  let totalBackfilled = 0;

  for (const eventId of marketIds) {
    const marketId = `mkt_${eventId}`;

    try {
      const { data: eventRow, error: eventErr } = await adminSupabase
        .from("events")
        .select("id, market_address")
        .eq("id", eventId)
        .maybeSingle();

      if (eventErr) {
        console.log(`  ${marketId}: event lookup failed — ${eventErr.message}`);
        continue;
      }

      const marketAddress = ethers.getAddress(
        (
          eventRow?.market_address ||
          OLD_CONTRACT_ADDRESS
        ).toLowerCase()
      );

      const isLegacy =
        marketAddress.toLowerCase() === OLD_CONTRACT_ADDRESS.toLowerCase();

      const isCurrent =
        marketAddress.toLowerCase() === CURRENT_CONTRACT_ADDRESS.toLowerCase();

      if (!isLegacy && !isCurrent) {
        console.log(
          `  ${marketId}: unknown market_address ${marketAddress} — skipping`
        );
        continue;
      }

      const contract = new ethers.Contract(
        marketAddress,
        isLegacy ? V1_ABI : V2_ABI,
        provider
      );

      const details = await contract.getMarketFullDetails(marketId);
      const status = Number(details.status);

      if (status !== 4) {
        console.log(
          `  ${marketId}: status=${status} on ${isLegacy ? "V1" : "V2"} — skipping`
        );
        continue;
      }

      const winLabel = SIDE_LABEL[Number(details.winner)];

      if (!winLabel || winLabel === "NONE") {
        console.log(`  ${marketId}: finalized but no valid winner — skipping`);
        continue;
      }

      const pools = await contract.getMarket(marketId);

      let fixedOdds = false;

      if (!isLegacy) {
        try {
          fixedOdds = Boolean(await contract.fixedOddsMarket(marketId));
        } catch (error) {
          console.log(
            `  ${marketId}: V2 fixedOddsMarket() unavailable/failed; using legacy payout mode`
          );
        }
      }

      const synced = await syncPositionsForMarket(
        adminSupabase,
        eventId,
        winLabel,
        pools.hawkTotal,
        pools.doveTotal,
        fixedOdds
      );

      totalBackfilled += synced;

      await adminSupabase
        .from("events")
        .update({ market_resolved: true })
        .eq("id", eventId);

    } catch (err) {
      console.log(
        `  ${marketId}: error checking/syncing — ${err.message}`
      );
    }
  }

  console.log(`\nDone. Total positions backfilled: ${totalBackfilled}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
