// scripts/sync-lifecycle.js
// প্রতি ২ ঘণ্টা সাইকেলে দুইবার চালানোর জন্য (GitHub Actions workflow দিয়ে)।
// প্রতিটা open market-এর on-chain status পড়ে events.lifecycle_stage আপডেট করে,
// আর নতুন dispute ধরা পড়লে market_disputes টেবিলে একটা রো insert করে।
//
// 🛡️ এই script-ই events.lifecycle_stage-এর একমাত্র লেখক (authoritative source),
// আর frontend + create-markets.js/resolve-markets.js/finalize-markets.js সবাই
// এই কলামের উপর নির্ভর করে। তাই এখানে RPC ব্যর্থ হলে বা rate-limit খেলে পুরো
// পাইপলাইন জুড়ে frontend/backend count mismatch দেখা দেয় — এই fix-এর আগে এই
// script একাই একটা getMarketFullDetails RPC call করত প্রতিটা market-এর জন্য,
// কোনো multicall বা multi-RPC fallback ছাড়া।
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

const CONTRACT_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
];

// Canonical Multicall3 deployment address — same one used in resolve-markets.js,
// finalize-markets.js, create-markets.js, and the frontend's agent-arena.ts.
const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
];

// status 1 (staking closed, awaiting resolution) এবং status 2 (AI resolved,
// dispute window open) দুটোই frontend-এর ৪-bucket ডিজাইনে "awaiting_dispute"।
const STAGE_BY_STATUS = { 0: "active", 1: "awaiting_dispute", 2: "awaiting_dispute", 3: "disputed", 4: "completed" };
const DISPUTE_WINDOW_SECONDS = 24 * 60 * 60; // AgentArena.sol এর DISPUTE_WINDOW constant-এর সাথে মিলিয়ে

const MAX_EVENTS_PER_RUN = Number(process.env.SYNC_MAX_EVENTS_PER_RUN || 150);
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 500);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🛡️ NEW: stop starting new writes once this much wall-clock time has passed
// — same fix as the other three scripts, avoids GitHub Actions force-cancelling
// a run mid-write.
const RUN_TIME_BUDGET_MS = Number(process.env.RUN_TIME_BUDGET_MS || 4 * 60 * 1000);
const runStartedAt = Date.now();
const timeBudgetExceeded = () => Date.now() - runStartedAt > RUN_TIME_BUDGET_MS;

function isRpcRateLimitError(error) {
  const code = error?.error?.code ?? error?.code;
  const message = String(error?.error?.message ?? error?.message ?? error?.shortMessage ?? "");
  return (
    code === -32007 ||
    code === -32011 ||
    error?.status === 429 ||
    /request limit|rate limit|too many requests|failed to detect network/i.test(message)
  );
}

// 🛡️ NEW: same rotating multi-RPC manager as the other three scripts.
class RpcManager {
  constructor(urls, label) {
    this.urls = urls.filter(Boolean);
    if (this.urls.length === 0) throw new Error(`No RPC URLs configured for ${label}`);
    this.label = label;
    this.index = 0;
    this._provider = new ethers.JsonRpcProvider(this.urls[this.index]);
  }
  current() {
    return this._provider;
  }
  rotate() {
    const previous = this.index + 1;
    this.index = (this.index + 1) % this.urls.length;
    this._provider = new ethers.JsonRpcProvider(this.urls[this.index]);
    console.log(`  🔄 Rotated ${this.label} RPC: endpoint #${previous} → #${this.index + 1} of ${this.urls.length}`);
    return this._provider;
  }
  hasMultiple() {
    return this.urls.length > 1;
  }
  count() {
    return this.urls.length;
  }
}

async function callRpcWithBackoff(fn, label, rpcManager) {
  let sweepAttempt = 0;
  let totalAttempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRpcRateLimitError(error)) throw error;
      totalAttempt++;
      if (rpcManager?.hasMultiple() && sweepAttempt < rpcManager.count() - 1) {
        sweepAttempt++;
        rpcManager.rotate();
        continue;
      }
      if (totalAttempt >= MAX_RATE_LIMIT_RETRIES * Math.max(1, rpcManager?.count() ?? 1)) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.floor(totalAttempt / Math.max(1, rpcManager?.count() ?? 1)), MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      console.log(`  ⏳ RPC rate limited on ${label} (all ${rpcManager?.count() ?? 1} endpoint(s) tried). Waiting ${Math.round((backoff + jitter) / 1000)}s before next sweep...`);
      await delay(backoff + jitter);
      sweepAttempt = 0;
      rpcManager?.rotate();
    }
  }
}

// 🛡️ NEW: batch getMarketFullDetails for many markets into a single RPC call
// via Multicall3.aggregate3 instead of one call per market — this is the
// biggest single lever here, since this script previously made one RPC call
// per open market with no batching at all.
async function batchGetMarketDetails(readRpcManager, contractInterface, marketIds) {
  const calls = marketIds.map((marketId) => ({
    target: CONTRACT_ADDRESS,
    allowFailure: true,
    callData: contractInterface.encodeFunctionData("getMarketFullDetails", [marketId]),
  }));

  const results = await callRpcWithBackoff(
    () => {
      const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readRpcManager.current());
      return multicall.aggregate3.staticCall(calls);
    },
    `multicall.aggregate3 (${marketIds.length} markets)`,
    readRpcManager,
  );

  const detailsByMarketId = new Map();
  results.forEach((result, i) => {
    const marketId = marketIds[i];
    if (!result.success) {
      detailsByMarketId.set(marketId, null);
      return;
    }
    try {
      detailsByMarketId.set(marketId, contractInterface.decodeFunctionResult("getMarketFullDetails", result.returnData));
    } catch {
      detailsByMarketId.set(marketId, null);
    }
  });
  return detailsByMarketId;
}

async function main() {
  const { APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, ARC_RPC_URL_5 } = process.env;
  if (!APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ARC_RPC_URL) {
    throw new Error("Missing env: APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL required.");
  }

  const adminSupabase = createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 🛡️ NEW: same 5-endpoint rotating pool as the other three scripts.
  const publicFallbackUrl = ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";
  const rpcUrls = [ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, publicFallbackUrl];
  const readRpcManager = new RpcManager(rpcUrls, "read");
  console.log(`Configured ${readRpcManager.count()} RPC endpoint(s) for automatic failover.`);

  const contractInterface = new ethers.Interface(CONTRACT_ABI);

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

  const events = allEvents.slice(0, MAX_EVENTS_PER_RUN);
  console.log(`Syncing lifecycle_stage for ${events.length} of ${allEvents.length} open market(s) this run.`);

  // 🛡️ NEW: batch-prefetch on-chain details for the entire run's worth of
  // markets in one Multicall3 call instead of one getMarketFullDetails RPC
  // call per market. For a typical 100-150 market backlog this turns ~150
  // sequential RPC calls into 1.
  const batchMarketIds = events.map((e) => `mkt_${e.id}`);
  let prefetchedDetails = new Map();
  try {
    prefetchedDetails = await batchGetMarketDetails(readRpcManager, contractInterface, batchMarketIds);
    console.log(`  📦 Batched status check for ${batchMarketIds.length} markets via Multicall3 (1 RPC call instead of ${batchMarketIds.length}).`);
  } catch (multicallErr) {
    console.log(`  ⚠️ Multicall3 batch prefetch failed (${multicallErr.message}) — falling back to one getMarketFullDetails call per market.`);
  }

  let changed = 0;
  let rateLimitFailures = 0;

  for (const event of events) {
    if (timeBudgetExceeded()) {
      console.log(`  ⏹ Reached RUN_TIME_BUDGET_MS (${RUN_TIME_BUDGET_MS}ms) for this run, stopping early. Remaining backlog will be picked up next run.`);
      break;
    }
    const marketId = `mkt_${event.id}`;
    try {
      const cached = prefetchedDetails.get(marketId);
      const details = cached !== undefined && cached !== null
        ? cached
        : await callRpcWithBackoff(
            () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current()).getMarketFullDetails(marketId),
            `getMarketFullDetails(${marketId})`,
            readRpcManager,
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
