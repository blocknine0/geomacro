// scripts/sync-lifecycle.js
// প্রতি ৩০ মিনিটে চালানোর জন্য (নতুন GitHub Actions workflow দিয়ে)।
// প্রতিটা open market-এর on-chain status পড়ে events.lifecycle_stage আপডেট করে,
// আর নতুন dispute ধরা পড়লে market_disputes টেবিলে একটা রো insert করে।
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

const CONTRACT_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
];

// 🛠️ FIX: on-chain status 1 (staking closed, awaiting resolution) আগে ভুলভাবে
// "active"-এ map হতো, যার ফলে frontend-এর "Active" bucket-এ staking-closed
// market-ও গোনা হতো। এখন frontend-এর ৪-bucket ডিজাইনের (Active / Staking Closed /
// Disputed / Completed) সাথে align করে status 1 এবং 2 দুটোই "staking_closed"-এ যাবে।
const STAGE_BY_STATUS = { 0: "active", 1: "staking_closed", 2: "staking_closed", 3: "disputed", 4: "completed" };
const DISPUTE_WINDOW_SECONDS = 24 * 60 * 60; // AgentArena.sol এর DISPUTE_WINDOW constant-এর সাথে মিলিয়ে

async function main() {
  const { APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL } = process.env;
  if (!APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ARC_RPC_URL) {
    throw new Error("Missing env: APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL required.");
  }

  const adminSupabase = createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  const { data: events, error } = await adminSupabase
    .from("events")
    .select("id, lifecycle_stage, disputer_address, market_resolved")
    .eq("market_created", true)
    .neq("lifecycle_stage", "completed"); // "market_resolved=false" এর বদলে এখন এটা —
    // নাহলে যেসব market ইতিমধ্যে market_resolved=true হয়ে গেছে কিন্তু lifecycle_stage
    // কখনো 'completed'-এ flip হয়নি, তারা চিরতরে বাদ পড়ে যেত।

  if (error) throw new Error(`Could not read events: ${error.message}`);
  if (!events || events.length === 0) {
    console.log("No open markets to sync.");
    return;
  }

  console.log(`Syncing lifecycle_stage for ${events.length} open market(s)...`);
  let changed = 0;

  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    try {
      const details = await contract.getMarketFullDetails(marketId);
      const status = Number(details.status);
      const newStage = STAGE_BY_STATUS[status] ?? "active";
      const disputer = details.disputer && details.disputer !== ethers.ZeroAddress ? details.disputer : null;

      if (newStage === event.lifecycle_stage && disputer === event.disputer_address) continue;

      const aiResolutionTime = Number(details.aiResolutionTime);
      const disputeWindowEndsAt = aiResolutionTime > 0
        ? new Date((aiResolutionTime + DISPUTE_WINDOW_SECONDS) * 1000).toISOString()
        : null;

      await adminSupabase
        .from("events")
        .update({
          lifecycle_stage: newStage,
          disputer_address: disputer,
          dispute_window_ends_at: disputeWindowEndsAt,
          ...(newStage === "disputed" && event.lifecycle_stage !== "disputed" ? { disputed_at: new Date().toISOString() } : {}),
        })
        .eq("id", event.id);

      // নতুন dispute হলে audit log-এও একটা এন্ট্রি রাখো
      if (newStage === "disputed" && event.lifecycle_stage !== "disputed" && disputer) {
        await adminSupabase.from("market_disputes").insert({
          event_id: event.id,
          market_id: marketId,
          disputer_address: disputer,
        });
        console.log(`  ⚠️ New dispute detected on ${marketId} by ${disputer}`);
      }

      console.log(`  ${marketId}: ${event.lifecycle_stage} → ${newStage}`);
      changed += 1;
    } catch (err) {
      console.log(`  ${marketId}: sync error — ${err.message}`);
    }
  }

  console.log(`Done. ${changed} market(s) updated.`);
}

main().catch((err) => {
  console.error("sync-lifecycle failed:", err);
  process.exit(1);
});
