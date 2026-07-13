// scripts/create-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const THRESHOLD_STEP = 5;
const STAKING_DURATION_SEC = 46 * 60 * 60;   // ৪৬ ঘণ্টা পর স্টেকিং বন্ধ — শেষ মুহূর্তে স্টেক করে জেতা ঠেকাতে
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; // ৪৮ ঘণ্টা পর রিজলভ — কন্ট্রাক্ট নিজেই এনফোর্স করে
const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];
// Hard cap: the app is designed and tested around ~100 concurrently OPEN
// (staking) markets. Beyond that, market creation pauses (news ingestion
// continues unaffected in scripts/ingest-news.js) until earlier markets
// close staking and free up room.
const MAX_ACTIVE_MARKETS = 100;

// 🆕 PERMANENT FIX: room is now counted against genuinely OPEN-for-staking
// markets only (lifecycle_stage='active'), not staking_closed/disputed ones.
// Previously `!= completed` meant a backlog of markets still waiting out
// their 24h dispute window (staking_closed) blocked new market creation
// even though the actual "Active" bucket users see was empty — the two
// were different concepts wearing the same cap. staking_closed/disputed
// markets need zero user action and are drained independently by
// finalize-markets.js (which is already batched+throttled+retried), so
// letting a big staking_closed backlog exist is fine; it should never
// starve new market creation.
const MAX_NEW_MARKETS_PER_RUN = Number(process.env.MAX_NEW_MARKETS_PER_RUN || 30);
// 🆕 Small fixed pause after every market we touch (mirrors
// finalize-markets.js's RPC_THROTTLE_MS) — this script had NO throttle at
// all before, so flipping the cap definition above (which can make `room`
// jump from ~5 to ~100 in one run) would otherwise fire up to 100
// createMarket transactions back-to-back with zero pacing. That's exactly
// the kind of burst that triggered the "100/sec request limit" crashes in
// the other scripts. MAX_NEW_MARKETS_PER_RUN + this throttle together cap
// both the count AND the rate.
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 350);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🆕 Same backoff pattern as finalize-markets.js / sync-lifecycle.js.
// Wraps read-only calls (getMarket, getBlock) so a single rate-limit hit
// doesn't just throw and silently skip a market forever.
async function callRpcWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const code = error?.error?.code ?? error?.code;
      const message = String(error?.error?.message ?? error?.message ?? "");
      const isRateLimit =
        code === -32007 ||
        error?.status === 429 ||
        /request limit|rate limit|too many requests/i.test(message);
      if (!isRateLimit || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      attempt++;
      console.log(`  ⏳ RPC rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

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

  // 🆕 PERMANENT FIX: cap total OPEN markets at MAX_ACTIVE_MARKETS, counting
  // only lifecycle_stage='active' (genuinely staking-open). staking_closed/
  // disputed markets are backend-only work items handled by
  // finalize-markets.js and don't occupy a user-facing "Active" slot.
  const { count: activeCount, error: countErr } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("market_created", true)
    .eq("lifecycle_stage", "active");
  if (countErr) throw new Error(`Supabase error counting active markets: ${countErr.message}`);

  const rawRoom = MAX_ACTIVE_MARKETS - (activeCount ?? 0);
  // 🆕 Per-run cap, independent of how big rawRoom is — see
  // MAX_NEW_MARKETS_PER_RUN comment above. The rest of rawRoom (if any)
  // gets picked up by the next scheduled run.
  const room = Math.min(Math.max(rawRoom, 0), MAX_NEW_MARKETS_PER_RUN);
  console.log(`Active markets: ${activeCount ?? 0} / ${MAX_ACTIVE_MARKETS}. Raw room: ${Math.max(rawRoom, 0)}. Creating up to ${room} this run (MAX_NEW_MARKETS_PER_RUN=${MAX_NEW_MARKETS_PER_RUN}).`);
  if (room <= 0) {
    console.log("At capacity — skipping market creation this run. News ingestion is unaffected and keeps queuing fresh events for when room frees up.");
    return;
  }

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
        const existing = await callRpcWithBackoff(() => contract.getMarket(marketId), `getMarket(${marketId})`);
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
        await delay(RPC_THROTTLE_MS);
        continue;
      }
      console.log(`Creating market ${marketId} for: "${event.source_title}"...`);
      // ⚠️ finalizeMarket-এর মতোই — createMarket একটা transaction পাঠায়, তাই
      // এটাকে blindly callRpcWithBackoff-এ wrap করা যাবে না (double-send
      // ঝুঁকি)। শুধু nonce/mempool race-এর জন্য আলাদা safe retry।
      let tx;
      let sendAttempt = 0;
      const MAX_SEND_RETRIES = 3;
      while (true) {
        try {
          tx = await contract.createMarket(marketId, STAKING_DURATION_SEC, RESOLUTION_DURATION_SEC);
          break;
        } catch (sendErr) {
          const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
          if (!isNonceRace || sendAttempt >= MAX_SEND_RETRIES) throw sendErr;
          sendAttempt++;
          const wait = 1500 * sendAttempt;
          console.log(`  ⏳ Nonce/mempool race on ${marketId} (${sendErr.code}), attempt ${sendAttempt}/${MAX_SEND_RETRIES}. Waiting ${wait}ms and retrying with a fresh nonce...`);
          await delay(wait);
        }
      }
      console.log(`  Transaction sent: ${tx.hash}`);
      const receipt = await callRpcWithBackoff(() => tx.wait(), `tx.wait(${marketId})`);
      console.log(`  Confirmed in block ${receipt.blockNumber}`);

      // 🛠️ পার্মানেন্ট ফিক্স: resolution_at এখন actual on-chain confirmation
      // ব্লকের timestamp থেকে হিসাব হচ্ছে (event.created_at থেকে না), যাতে
      // Supabase-এর resolution_at আর কন্ট্রাক্টের resolutionTime সবসময় sync থাকে।
      // এতে resolve-markets.js ঠিক সময়ে ট্রিগার হবে — খুব আগে বা দেরিতে না।
      const confirmedBlock = await callRpcWithBackoff(() => provider.getBlock(receipt.blockNumber), `getBlock(${receipt.blockNumber})`);
      const chainConfirmedAt = new Date(Number(confirmedBlock.timestamp) * 1000);
      const resolutionAt = new Date(chainConfirmedAt.getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();

      // ✅ tx hash এখন Supabase-এ সেভ হচ্ছে (market_lookup view-এ cross-check করার জন্য)
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
    // 🆕 প্রতিটা market touch করার পর fixed pause — read call হোক বা তৈরি
    // হোক, উভয় ক্ষেত্রেই, যাতে rate limit-এ কখনো burst না হয়।
    await delay(RPC_THROTTLE_MS);
  }
  console.log("Done.");
}
main().catch(console.error);
