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

// 🆕 FIX: এই তিনটা constant আগে finalize-markets.js/resolve-markets.js-এ ছিল,
// এখানে ছিল না — অথচ এখানেও ঠিক একই সমস্যার ঝুঁকি ছিল। একবারে ২৬৮+ market-এর
// জন্য কোনো throttle বা batch cap ছাড়া পরপর RPC call করলে QuickNode-এর
// ~100/sec limit-এ ধাক্কা খাওয়া প্রায় নিশ্চিত। যেহেতু নিচের try/catch প্রতিটা
// market আলাদাভাবে ধরে ফেলত, rate-limit hit হওয়া market শুধু
// "sync error" হিসেবে log হয়ে সাইলেন্টলি skip হয়ে যেত — lifecycle_stage
// কখনো আপডেট হতো না, আর পরের run-এও যদি একই rate-limit আবার হয় (বড়
// backlog-এ প্রায় নিশ্চিত), সেই market চিরকাল stale থেকে যেতে পারত।
// এটাই সবচেয়ে সম্ভাব্য কারণ কেন Supabase-এর lifecycle_stage আসল on-chain
// অবস্থা (staking_closed/resolve উভয়ই শূন্য) থেকে পিছিয়ে ছিল।
const MAX_EVENTS_PER_RUN = Number(process.env.SYNC_MAX_EVENTS_PER_RUN || 150);
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 350);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🛡️ finalize-markets.js/resolve-markets.js-এর সাথে হুবহু মেলানো backoff
// pattern। QuickNode (এবং বেশিরভাগ RPC provider) per-second request limit
// ছাড়িয়ে গেলে JSON-RPC error code -32007 বা HTTP 429 রিটার্ন করে।
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
  const { APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL } = process.env;
  if (!APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ARC_RPC_URL) {
    throw new Error("Missing env: APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL required.");
  }

  const adminSupabase = createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  const { data: allEvents, error } = await adminSupabase
    .from("events")
    .select("id, lifecycle_stage, disputer_address, market_resolved")
    .eq("market_created", true)
    .neq("lifecycle_stage", "completed"); // "market_resolved=false" এর বদলে এখন এটা —
    // নাহলে যেসব market ইতিমধ্যে market_resolved=true হয়ে গেছে কিন্তু lifecycle_stage
    // কখনো 'completed'-এ flip হয়নি, তারা চিরতরে বাদ পড়ে যেত।

  if (error) throw new Error(`Could not read events: ${error.message}`);
  if (!allEvents || allEvents.length === 0) {
    console.log("No open markets to sync.");
    return;
  }

  // 🆕 FIX: hard cap per run, same reasoning as finalize-markets.js — a big
  // backlog can't generate an unbounded burst of RPC calls in one go. The
  // rest gets picked up on the next scheduled run (every 30 min).
  const events = allEvents.slice(0, MAX_EVENTS_PER_RUN);
  console.log(`Syncing lifecycle_stage for ${events.length} of ${allEvents.length} open market(s) this run.`);
  let changed = 0;
  let rateLimitFailures = 0;

  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    try {
      const details = await callRpcWithBackoff(
        () => contract.getMarketFullDetails(marketId),
        `getMarketFullDetails(${marketId})`,
      );
      const status = Number(details.status);
      const newStage = STAGE_BY_STATUS[status] ?? "active";
      const disputer = details.disputer && details.disputer !== ethers.ZeroAddress ? details.disputer : null;

      if (newStage === event.lifecycle_stage && disputer === event.disputer_address) {
        await delay(RPC_THROTTLE_MS);
        continue;
      }

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
      await delay(RPC_THROTTLE_MS);
    } catch (err) {
      const message = err?.message || String(err);
      if (/rate limit|request limit|too many requests/i.test(message)) rateLimitFailures += 1;
      console.log(`  ${marketId}: sync error — ${message}`);
      await delay(RPC_THROTTLE_MS);
    }
  }

  console.log(`Done. ${changed} market(s) updated. ${allEvents.length - events.length} remaining for next run.`);
  if (rateLimitFailures > 0) {
    console.log(`  ⚠️ ${rateLimitFailures} market(s) still failed after retries due to rate limiting — they'll be retried next run since they weren't marked updated.`);
  }
}

main().catch((err) => {
  console.error("sync-lifecycle failed:", err);
  process.exit(1);
});
