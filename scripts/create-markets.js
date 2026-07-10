// scripts/create-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
// ⚠️ CHANGE: আগে এখানে MAX_NEW_MARKETS_PER_RUN=30 cap ছিল, এখন সরিয়ে দেওয়া হলো —
// প্রতিটা qualifying (severity>=40) নতুন news event থেকে market তৈরি হবে, কোনো সীমা ছাড়াই।
const THRESHOLD_STEP = 5;
const STAKING_DURATION_SEC = 46 * 60 * 60;   // ৪৬ ঘণ্টা পর স্টেকিং বন্ধ — শেষ মুহূর্তে স্টেক করে জেতা ঠেকাতে
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; // ৪৮ ঘণ্টা পর রিজলভ — কন্ট্রাক্ট নিজেই এনফোর্স করে
const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];
// Hard cap: the app is designed and tested around ~100 concurrently active
// markets. Beyond that, market creation pauses (news ingestion continues
// unaffected in scripts/ingest-news.js) until earlier markets resolve and
// free up room.
const MAX_ACTIVE_MARKETS = 100;

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) throw new Error("Missing env.");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — events.market_created updates will likely be silently blocked by RLS (anon has no UPDATE grant on events).");
  }
  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  // ⚠️ FIX: events টেবিলে anon-এর UPDATE policy নেই, তাই সব events.update() কল
  // এখন service-role client দিয়ে হচ্ছে (আগের মতো anon দিয়ে silently fail করার বদলে)।
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : supabase;
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  // 🆕 PERMANENT FIX: cap total active markets at MAX_ACTIVE_MARKETS.
  // events.lifecycle_stage is kept in sync with on-chain status by
  // scripts/sync-lifecycle.js (runs every 30 min), so counting "active"
  // rows here is a fast, reliable proxy for "currently OPEN on-chain".
  const { count: activeCount, error: countErr } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle_stage", "active");
  if (countErr) throw new Error(`Supabase error counting active markets: ${countErr.message}`);

  const room = MAX_ACTIVE_MARKETS - (activeCount ?? 0);
  console.log(`Active markets: ${activeCount ?? 0} / ${MAX_ACTIVE_MARKETS}. Room for ${Math.max(room, 0)} new market(s).`);
  if (room <= 0) {
    console.log("At capacity — skipping market creation this run. News ingestion is unaffected and keeps queuing fresh events for when room frees up.");
    return;
  }

  // 🆕 PERMANENT FIX: two-stage severity selection.
  // Stage 1 — prefer high-severity (80-100) events first; freshest first,
  // filling up to `room` slots.
  // Stage 2 — only if stage 1 didn't fill all of `room`, widen to the full
  // 0-100 severity range (excluding stage-1 picks) so room never goes
  // unused when high-severity news is scarce.
  const baseSelect = "id, source_title, category, severity, created_at, market_created";
  const baseFilter = (query) => query.or("market_created.is.null,market_created.eq.false");

  const { data: highSeverityEvents, error: highErr } = await baseFilter(
    supabase.from("events").select(baseSelect),
  )
    .gte("severity", 80)
    .lte("severity", 100)
    .order("created_at", { ascending: false })
    .limit(room);
  if (highErr) throw new Error(`Supabase error (high-severity query): ${highErr.message}`);

  let events = highSeverityEvents ?? [];
  const remaining = room - events.length;

  if (remaining > 0) {
    const excludeIds = events.map((e) => e.id);
    let fallbackQuery = baseFilter(supabase.from("events").select(baseSelect))
      .gte("severity", 0)
      .lte("severity", 100)
      .order("created_at", { ascending: false })
      .limit(remaining);
    if (excludeIds.length > 0) {
      fallbackQuery = fallbackQuery.not("id", "in", `(${excludeIds.join(",")})`);
    }
    const { data: fallbackEvents, error: fallbackErr } = await fallbackQuery;
    if (fallbackErr) throw new Error(`Supabase error (fallback severity query): ${fallbackErr.message}`);
    if (fallbackEvents && fallbackEvents.length > 0) {
      console.log(`Only ${events.length}/${room} high-severity (80-100) candidates found — filling remaining ${fallbackEvents.length} slot(s) from full severity range.`);
      events = events.concat(fallbackEvents);
    }
  }

  if (!events || events.length === 0) return console.log("No new unique events found.");
  console.log(`Found ${events.length} candidate event(s) for new markets (capped to available room).`);
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
        await adminSupabase.from("events").update({ market_created: true, market_threshold: marketThreshold, resolution_at: fallbackResolutionAt }).eq("id", event.id);
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

      // ✅ NEW: tx hash এখন Supabase-এ সেভ হচ্ছে (market_lookup view-এ cross-check করার জন্য)
      await adminSupabase.from("events").update({
        market_created: true,
        market_threshold: marketThreshold,
        resolution_at: resolutionAt,
        market_address: CONTRACT_ADDRESS,
        market_created_tx_hash: tx.hash,
      }).eq("id", event.id);
    } catch (err) {
      console.error(`Failed to create market for event ${event.id}: ${err.message}`);
    }
  }
  console.log("Done.");
}
main().catch(console.error);
