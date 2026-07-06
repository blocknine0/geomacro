// scripts/backfill-positions.js
// একবার চালানোর জন্য: যেসব event ইতিমধ্যে market_resolved=true হয়ে গেছে (আগের বাগের কারণে
// positions sync ছাড়াই), কিন্তু positions টেবিলে এখনো "active" পড়ে আছে — সেগুলো
// on-chain state দিয়ে ঠিক করে দেয়।
//
// চালানোর নিয়ম (লোকাল টার্মিনালে):
//   bun scripts/backfill-positions.js
// প্রয়োজনীয় env var (নিজের .env বা terminal export থেকে):
//   APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL
// (OWNER_PRIVATE_KEY লাগবে না, এটা শুধু read-only view call করে)

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const PROTOCOL_FEE_BPS = 150n; // claim() / AgentArena.sol এর সাথে হুবহু মিলিয়ে

const CONTRACT_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];

const SIDE_LABEL = { 0: "NONE", 1: "HAWK", 2: "DOVE" };

function computePayout(userStaked, winningPoolTotal, losingPoolTotal) {
  let payout = userStaked;
  if (winningPoolTotal > 0n && losingPoolTotal > 0n) {
    payout += (userStaked * losingPoolTotal) / winningPoolTotal;
  }
  const platformFee = (payout * PROTOCOL_FEE_BPS) / 10000n;
  return payout - platformFee;
}

async function syncPositionsForMarket(adminSupabase, eventId, winSideLabel, hawkTotal, doveTotal) {
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
      const payoutRaw = computePayout(staked, winningPoolTotal, losingPoolTotal);
      const payoutDisplay = Number(ethers.formatUnits(payoutRaw, 6));

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

      const stakedDisplay = Number(ethers.formatUnits(position.staked_amount_raw, 6));
      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: 0,
        event_type: "resolve",
        market_id: eventId,
        amount_delta: -stakedDisplay,
      });
    }
  }

  console.log(`  ✅ Backfilled ${activePositions.length} position(s) for event ${eventId} (winner: ${winSideLabel})`);
  return activePositions.length;
}

async function main() {
  const { APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL } = process.env;

  if (!APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ARC_RPC_URL) {
    throw new Error("Missing env: APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL required.");
  }

  const adminSupabase = createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  // ১. যেসব wallet-এর position এখনো "active" আছে, তাদের সব unique market_id বের করো
  const { data: activePositions, error: posErr } = await adminSupabase
    .from("positions")
    .select("market_id")
    .eq("status", "active");

  if (posErr) throw new Error(`Could not read positions: ${posErr.message}`);

  const marketIds = Array.from(new Set((activePositions ?? []).map((p) => p.market_id)));
  console.log(`Found ${marketIds.length} distinct market(s) with "active" positions. Checking on-chain status...\n`);

  let totalBackfilled = 0;

  for (const eventId of marketIds) {
    const marketId = `mkt_${eventId}`;
    try {
      const details = await contract.getMarketFullDetails(marketId);
      const status = Number(details.status);

      if (status !== 4) {
        console.log(`  ${marketId}: still status=${status} (not finalized yet) — skipping.`);
        continue;
      }

      const winLabel = SIDE_LABEL[Number(details.winner)];
      if (!winLabel || winLabel === "NONE") {
        console.log(`  ${marketId}: finalized but no valid winner recorded — skipping.`);
        continue;
      }

      const pools = await contract.getMarket(marketId);
      const synced = await syncPositionsForMarket(adminSupabase, eventId, winLabel, pools.hawkTotal, pools.doveTotal);
      totalBackfilled += synced;

      // events টেবিলে market_resolved ফ্ল্যাগও ঠিক করে দাও (থাকলে ভালো, না থাকলেও সমস্যা নেই)
      await adminSupabase.from("events").update({ market_resolved: true }).eq("id", eventId);
    } catch (err) {
      console.log(`  ${marketId}: error checking/syncing — ${err.message}`);
    }
  }

  console.log(`\nDone. Total positions backfilled: ${totalBackfilled}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
