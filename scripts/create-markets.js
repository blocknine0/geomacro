// scripts/create-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const MAX_NEW_MARKETS_PER_RUN = 30;
const THRESHOLD_STEP = 5;
const STAKING_DURATION_SEC = 46 * 60 * 60;   // ৪৬ ঘণ্টা পর স্টেকিং বন্ধ — শেষ মুহূর্তে স্টেক করে জেতা ঠেকাতে
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; // ৪৮ ঘণ্টা পর রিজলভ — কন্ট্রাক্ট নিজেই এনফোর্স করে

// ⚠️ CRITICAL SAFETY INVARIANT: RESOLUTION_DURATION_SEC must always be
// greater than STAKING_DURATION_SEC. The contract's declareWinnerByAI()
// only checks resolutionTime, not stakingEndTime — so if this relationship
// is ever violated, the AI's tentative verdict could be revealed WHILE
// staking is still open, letting users see the outcome before betting.
// This throws immediately instead of silently creating that exploit.
if (RESOLUTION_DURATION_SEC <= STAKING_DURATION_SEC) {
  throw new Error(
    "FATAL: RESOLUTION_DURATION_SEC must be greater than STAKING_DURATION_SEC to prevent revealing the verdict before staking closes."
  );
}

const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];
async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) throw new Error("Missing env.");
  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  // 🛑 পার্মানেন্ট ফিক্স: হাবিজাবি ইভেন্ট ফিল্টার করতে সর্বনিম্ন severity ৪০ এবং সর্বোচ্চ ১০০ করা হলো
  const { data: events, error } = await supabase
    .from("events")
    .select("id, source_title, category, severity, created_at, market_created")
    .or("market_created.is.null,market_created.eq.false")
    .gte("severity", 40)   // ২০ বা ৩০ সিভিয়ারিটির নিউজ মার্কেট তৈরি করবে না
    .lte("severity", 100)
    .order("created_at", { ascending: false })
    .limit(MAX_NEW_MARKETS_PER_RUN);
  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!events || events.length === 0) return console.log("No new unique high-severity events found.");
  console.log(`Found ${events.length} clean candidate event(s) for new markets.`);
  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    const marketThreshold = event.severity + THRESHOLD_STEP;
    try {
      let marketExists = false;
      try {
        const existing = await contract.getMarket(marketId);
        marketExists = existing.exists;
      } catch (decodeErr) {
        // Fallback
      }
      if (marketExists) {
        console.log(`Market ${marketId} already exists on-chain. Syncing Supabase.`);
        // 💡 ফিক্স: এখানেও actual chain time ব্যবহার করা উচিত ছিল, কিন্তু আমরা
        // এই টার্মিনাল ব্লকে chain block time জানি না, তাই fallback হিসেবে
        // event.created_at ভিত্তিক হিসাবই থাকছে (rare edge case — মার্কেট আগে
        // থেকেই chain-এ আছে কিন্তু Supabase sync হয়নি)
        const fallbackResolutionAt = new Date(new Date(event.created_at).getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();
        await supabase.from("events").update({ market_created: true, market_threshold: marketThreshold, resolution_at: fallbackResolutionAt }).eq("id", event.id);
        continue;
      }
      console.log(`Creating market ${marketId} for: "${event.source_title}"...`);
      const tx = await contract.createMarket(marketId, STAKING_DURATION_SEC, RESOLUTION_DURATION_SEC);
      console.log(`  Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Confirmed in block ${receipt.blockNumber}`);

      // 🛠️ পার্মানেন্ট ফিক্স: resolution_at এখন actual on-chain confirmation
      // ব্লকের timestamp থেকে হিসাব হচ্ছে (event.created_at থেকে না), যাতে
      // Supabase-এর resolution_at আর কন্ট্রাক্টের resolutionTime সবসময় sync থাকে।
      // এতে resolve-markets.js ঠিক সময়ে ট্রিগার হবে — খুব আগে বা দেরিতে না।
      const confirmedBlock = await provider.getBlock(receipt.blockNumber);
      const chainConfirmedAt = new Date(Number(confirmedBlock.timestamp) * 1000);
      const resolutionAt = new Date(chainConfirmedAt.getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();

      await supabase.from("events").update({
        market_created: true,
        market_threshold: marketThreshold,
        resolution_at: resolutionAt,
        market_address: CONTRACT_ADDRESS
      }).eq("id", event.id);
    } catch (err) {
      console.error(`Failed to create market for event ${event.id}: ${err.message}`);
    }
  }
  console.log("Done.");
}
main().catch(console.error);
