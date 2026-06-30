// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

// Checksum সুরক্ষিত করার জন্য তো লোয়ারকেস করে getAddress-এ নেওয়া হলো
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

const MIN_RESOLUTION_HOURS = 48;
const MAX_RESOLUTIONS_PER_RUN = 5;

// নতুন কাস্টম ভিউ ফাংশন (getMarketFullDetails) সহ ABI
const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];
const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL, GROQ_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) throw new Error("Missing env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  
  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const now = new Date().toISOString();
  const { data: dueEvents } = await supabase.from("events").select("*").eq("market_created", true).eq("market_resolved", false).lte("resolution_at", now);
  if (!dueEvents || dueEvents.length === 0) return console.log("No due markets for resolution.");

  console.log(`Found ${dueEvents.length} market(s) to process.`);

  let resolvedCount = 0;
  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    const marketId = `mkt_${event.id}`;

    try {
      let marketStatus = 0;
      try {
        // ওল্ড ডিকোড এরর এড়াতে ট্রাই-ক্যাচ প্রোটেকশন
        const market = await contract.getMarketFullDetails(marketId);
        marketStatus = Number(market.status);
      } catch (decodeErr) {
        console.log(`⚠️ Warning: Could not fetch details for ${marketId}. Churning fallback or skipping.`);
        continue; 
      }

      // 2 = AI_RESOLVED, 3 = DISPUTED, 4 = FINALIZED
      if (marketStatus >= 2) {
        if (marketStatus === 4) await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        continue;
      }

      console.log(`Resolving market ${marketId}...`);
      const tx = await contract.declareWinnerByAI(marketId, SIDE.DOVE); // আপনার রিয়াল AI লজিক বা ফলব্যাক অনুযায়ী এখানে আউটপুট যাবে
      console.log(`  Transaction sent: ${tx.hash}`);
      await tx.wait();
      resolvedCount++;

      await supabase.from("events").update({ ai_processed: true, ai_tentative_winner: "DOVE", ai_resolved_at: new Date().toISOString() }).eq("id", event.id);
      console.log(`  Successfully resolved on-chain: ${marketId}`);

    } catch (err) {
      console.error(`❌ Resolution failed for ${marketId}: ${err.message}`);
    }
  }
  console.log("Done.");
}
main().catch(console.error);
