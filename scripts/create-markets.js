// scripts/create-markets.js
//
// Upgraded automation script for Geomacro Agent Arena (DAO & Anti-MEV Enabled).
// Runs on a schedule via GitHub Actions.

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MAX_NEW_MARKETS_PER_RUN = 10; 
const THRESHOLD_STEP = 5; 

// ৪৬ ঘণ্টা স্ট্যাকিং উইন্ডো এবং ৪৮ ঘণ্টা টোটাল রেজোলিউশন উইন্ডো (সেকেন্ডে রূপান্তরিত)
const STAKING_DURATION_SEC = 46 * 60 * 60;   // ৪৬ ঘণ্টা = ১৬৫৬০০ সেকেন্ড
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; // ৪৮ ঘণ্টা = ১৭২৮০০ সেকেন্ড

const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint8 tentativeWinner, uint256 hawkTotal, uint256 doveTotal, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer, uint256 hawkVotes, uint256 doveVotes, bool exists)",
];

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) {
    throw new Error(
      "Missing required environment variables. Need OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL."
    );
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet balance: ${ethers.formatUnits(balance, 18)} USDC`);

  // Fetch all relevant events that don't have a market yet.
  const { data: events, error } = await supabase
    .from("events")
    .select("id, source_title, category, severity, created_at, market_created")
    .or("market_created.is.null,market_created.eq.false")
    .order("created_at", { ascending: false })
    .limit(MAX_NEW_MARKETS_PER_RUN);

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  if (!events || events.length === 0) {
    console.log("No new events without a market. Nothing to do.");
    return;
  }

  console.log(`Found ${events.length} candidate event(s) for new markets.`);

  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    const marketThreshold = event.severity + THRESHOLD_STEP;

    // Supabase এবং ফ্রন্টএন্ডের জন্য রেজোলিউশন টাইম জেনারেট করা (৪৮ ঘণ্টা)
    const resolutionAt = new Date(
      new Date(event.created_at).getTime() + RESOLUTION_DURATION_SEC * 1000
    ).toISOString();

    try {
      // অন-চেইন চেক
      const existing = await contract.markets(marketId);
      if (existing.exists) {
        console.log(`Market ${marketId} already exists on-chain. Marking as created and skipping.`);
        await supabase
          .from("events")
          .update({
            market_created: true,
            market_threshold: marketThreshold,
            resolution_at: resolutionAt,
          })
          .eq("id", event.id);
        continue;
      }

      console.log(
        `Creating market ${marketId} for "${event.source_title}" (severity ${event.severity}, threshold ${marketThreshold}, resolves at ${resolutionAt})...`
      );
      
      // নতুন টাইম লকের মানসহ অন-চেইনে পাঠানো হচ্ছে (৪৬ ঘণ্টা ও ৪৮ ঘণ্টা)
      const tx = await contract.createMarket(marketId, STAKING_DURATION_SEC, RESOLUTION_DURATION_SEC);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  confirmed in block ${receipt.blockNumber}`);

      // Supabase আপডেট
      const { error: updateError } = await supabase
        .from("events")
        .update({
          market_created: true,
          market_threshold: marketThreshold,
          resolution_at: resolutionAt,
        })
        .eq("id", event.id);

      if (updateError) {
        console.warn(`  Warning: failed to update event ${event.id}: ${updateError.message}`);
      }
    } catch (err) {
      console.error(`Failed to create market for event ${event.id}: ${err.message}`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error in create-markets script:", err);
  process.exit(1);
});
