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

// 🆕 Dual-contract transition: markets created before the V2 migration live
// on the old, non-upgradeable contract (7-field getMarketFullDetails, no
// dispute-bond fields). Markets created after point at the new UUPS proxy
// (9-field, includes disputeBond/disputeRaisedAt). Every event row already
// carries its own market_address (written by create-markets.js) — this
// script routes each market to the right contract+ABI by that column
// instead of assuming a single global CONTRACT_ADDRESS. Once every legacy
// market has reached lifecycle_stage="completed" (expected within ~72h of
// the V2 deploy), the OLD_CONTRACT_ADDRESS branch can be deleted entirely.
const OLD_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.OLD_CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe").toLowerCase(),
);
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!RAW_ADDRESS) throw new Error("Missing env: CONTRACT_ADDRESS (the new AgentArenaProxy address)");
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

const OLD_CONTRACT_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
];
const CONTRACT_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer, uint256 disputeBond, uint256 disputeRaisedAt)",
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

// 🛡️ NOTE: no total-market cap here anymore (see fix below) — this script
// only reads + writes, no tx sends, so there's no rate-limit reason to cap
// the total. SYNC_MULTICALL_CHUNK_SIZE controls the internal Multicall3
// batch size instead.
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
async function batchGetMarketDetails(readRpcManager, contractInterface, targetAddress, marketIds) {
  const calls = marketIds.map((marketId) => ({
    target: targetAddress,
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
  const oldContractInterface = new ethers.Interface(OLD_CONTRACT_ABI);

  const { data: allEvents, error } = await adminSupabase
    .from("events")
    .select("id, lifecycle_stage, disputer_address, market_resolved, market_address")
    .eq("market_created", true)
    .neq("lifecycle_stage", "completed"); // "market_resolved=false" এর বদলে এখন এটা —
    // নাহলে যেসব market ইতিমধ্যে market_resolved=true হয়ে গেছে কিন্তু lifecycle_stage
    // কখনো 'completed'-এ flip হয়নি, তারা চিরতরে বাদ পড়ে যেত।

  if (error) throw new Error(`Could not read events: ${error.message}`);
  if (!allEvents || allEvents.length === 0) {
    console.log("No open markets to sync.");
    return;
  }

  // 🆕 Dual-contract split: a market with no market_address recorded
  // (shouldn't happen post-migration, but covers pre-existing rows from
  // before market_address was added) is treated as legacy by default.
  // 🛡️ FIX: before the real V2 cutover, CONTRACT_ADDRESS and
  // OLD_CONTRACT_ADDRESS are the same value on purpose (V2 deployed but not
  // yet activated). Without this guard, every legacy market matched BOTH
  // the legacy and "v2" filters (since the two addresses were identical),
  // so everything got processed twice — once successfully as legacy, once
  // via a failing V2-ABI multicall that fell back to slow per-market calls.
  // Once CONTRACT_ADDRESS is actually switched to the real V2 proxy address,
  // this condition becomes false automatically and dual-contract routing
  // kicks in for real, no code change needed at cutover time.
  // 🛡️ FIX: legacy and "v2" filters must be mutually exclusive, or every
  // market matches both whenever CONTRACT_ADDRESS still equals
  // OLD_CONTRACT_ADDRESS (true right now, on purpose — V2 is deployed but
  // not yet activated). Adding "&& not the old address" to the v2 filter
  // makes this self-resolving: multicall for the v2 group stays fully wired
  // and active (no mode flag, nothing to flip later), it just naturally
  // batches 0 markets today. The moment CONTRACT_ADDRESS is switched to the
  // real V2 proxy, new markets start landing here automatically.
  const v2CutoverActive = CONTRACT_ADDRESS.toLowerCase() !== OLD_CONTRACT_ADDRESS.toLowerCase();
  const legacyEvents = allEvents.filter((e) => (e.market_address || OLD_CONTRACT_ADDRESS).toLowerCase() === OLD_CONTRACT_ADDRESS.toLowerCase());
  const v2Events = allEvents.filter(
    (e) =>
      e.market_address &&
      e.market_address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() &&
      e.market_address.toLowerCase() !== OLD_CONTRACT_ADDRESS.toLowerCase(),
  );
  console.log(`Legacy-contract markets to sync: ${legacyEvents.length}. V2-contract markets to sync: ${v2Events.length}.${v2CutoverActive ? "" : " (new contract address not active yet)"}`);

  // 🛡️ FIX: previously capped at MAX_EVENTS_PER_RUN (150) with a plain
  // .slice(0, N) — since Supabase returns rows in a stable order with no
  // explicit ORDER BY/rotation, this silently processed the SAME first N
  // markets every single run and permanently starved whatever was left over
  // (e.g. "28 remaining" stayed exactly 28 across 4 consecutive runs in
  // production — those markets would never have been synced, ever). Since
  // this script only reads + writes to Supabase (no tx sends, unlike
  // resolve/finalize/create-markets where a cap limits expensive/rate-limited
  // sends), there's no real reason to cap the total at all — Multicall3
  // already turns this into just a few RPC calls regardless of count. Now
  // processes every open market every run, chunking the Multicall3 calls
  // internally so this scales cleanly as the market count grows.
  const events = [...legacyEvents, ...v2Events];
  const CHUNK_SIZE = Number(process.env.SYNC_MULTICALL_CHUNK_SIZE || 150);
  console.log(`Syncing lifecycle_stage for all ${events.length} open market(s) this run (in chunks of ${CHUNK_SIZE}).`);

  let prefetchedDetails = new Map();

  async function prefetchGroup(groupEvents, targetAddress, iface, groupLabel) {
    if (groupEvents.length === 0) return;
    const groupMarketIds = groupEvents.map((e) => `mkt_${e.id}`);
    try {
      for (let i = 0; i < groupMarketIds.length; i += CHUNK_SIZE) {
        const chunk = groupMarketIds.slice(i, i + CHUNK_SIZE);
        const chunkDetails = await batchGetMarketDetails(readRpcManager, iface, targetAddress, chunk);
        for (const [marketId, details] of chunkDetails) prefetchedDetails.set(marketId, details);
        console.log(`  📦 [${groupLabel}] Batched status check for markets ${i + 1}-${Math.min(i + CHUNK_SIZE, groupMarketIds.length)} of ${groupMarketIds.length} via Multicall3 (1 RPC call per chunk).`);
      }
    } catch (multicallErr) {
      console.log(`  ⚠️ [${groupLabel}] Multicall3 batch prefetch failed (${multicallErr.message}) — falling back to one getMarketFullDetails call per market.`);
    }
  }

  await prefetchGroup(legacyEvents, OLD_CONTRACT_ADDRESS, oldContractInterface, "legacy");
  await prefetchGroup(v2Events, CONTRACT_ADDRESS, contractInterface, "v2");

  let changed = 0;
  let rateLimitFailures = 0;
  let processedCount = 0;

  for (const event of events) {
    if (timeBudgetExceeded()) {
      console.log(`  ⏹ Reached RUN_TIME_BUDGET_MS (${RUN_TIME_BUDGET_MS}ms) for this run, stopping early. Remaining backlog will be picked up next run.`);
      break;
    }
    processedCount++;
    const isLegacy = (event.market_address || OLD_CONTRACT_ADDRESS).toLowerCase() === OLD_CONTRACT_ADDRESS.toLowerCase();
    const targetAddress = isLegacy ? OLD_CONTRACT_ADDRESS : CONTRACT_ADDRESS;
    const activeInterface = isLegacy ? oldContractInterface : contractInterface;
    const marketId = `mkt_${event.id}`;
    try {
      const cached = prefetchedDetails.get(marketId);
      const details = cached !== undefined && cached !== null
        ? cached
        : await callRpcWithBackoff(
            () => new ethers.Contract(targetAddress, isLegacy ? OLD_CONTRACT_ABI : CONTRACT_ABI, readRpcManager.current()).getMarketFullDetails(marketId),
            `getMarketFullDetails(${marketId})`,
            readRpcManager,
          );
      const status = Number(details.status);
      const stakingEndTime = Number(details.stakingEndTime ?? 0);
      const nowSec = Math.floor(Date.now() / 1000);
      // Contract status remains OPEN until the resolver runs, even after the
      // staking cutoff. Treat an expired OPEN market as staking-closed so the
      // DB/frontend never keeps showing it as active for up to the next resolver run.
      let newStage = STAGE_BY_STATUS[status] ?? "active";
      if (status === 0 && stakingEndTime > 0 && nowSec > stakingEndTime) {
        newStage = "awaiting_dispute";
      }
      const disputer = details.disputer && details.disputer !== ethers.ZeroAddress ? details.disputer : null;

      if (newStage === event.lifecycle_stage && disputer === event.disputer_address) {
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      const aiResolutionTime = Number(details.aiResolutionTime);
      const disputeWindowEndsAt = aiResolutionTime > 0
        ? new Date((aiResolutionTime + DISPUTE_WINDOW_SECONDS) * 1000).toISOString()
        : null;

      const { error: updateError } = await adminSupabase
        .from("events")
        .update({
          lifecycle_stage: newStage,
          disputer_address: disputer,
          dispute_window_ends_at: disputeWindowEndsAt,
          ...(newStage === "disputed" && event.lifecycle_stage !== "disputed" ? { disputed_at: new Date().toISOString() } : {}),
        })
        .eq("id", event.id);

      // 🛡️ FIX: this update's result was never checked. If it silently
      // failed (RLS, constraint, bad column value), the console still
      // logged the transition as if it succeeded, and the same market got
      // reprocessed every single run forever with no visible cause. Now it
      // logs the real Supabase error and skips the "changed" counter for
      // this market, so the next run's log actually explains what's wrong.
      if (updateError) {
        console.log(`  ❌ ${marketId}: Supabase update FAILED — ${updateError.message} (code: ${updateError.code ?? "n/a"})`);
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      // নতুন dispute হলে audit log-এও একটা এন্ট্রি রাখো
      if (newStage === "disputed" && event.lifecycle_stage !== "disputed" && disputer) {
        const { error: disputeInsertError } = await adminSupabase.from("market_disputes").insert({
          event_id: event.id,
          market_id: marketId,
          disputer_address: disputer,
          // Legacy-contract disputes have no bond field in their ABI shape —
          // bond_amount stays null for those, which is fine since the old
          // DAO-vote dispute path was never wired to any script anyway.
          ...(!isLegacy && details.disputeBond !== undefined ? { bond_amount: details.disputeBond.toString() } : {}),
        });
        if (disputeInsertError) {
          console.log(`  ⚠️ ${marketId}: market_disputes insert failed — ${disputeInsertError.message}`);
        }
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

  console.log(`Done. ${changed} market(s) updated. ${events.length - processedCount} remaining for next run (out of a full time-budget stop, not a count cap).`);
  if (rateLimitFailures > 0) {
    console.log(`  ⚠️ ${rateLimitFailures} market(s) still failed after retries due to rate limiting — they'll be retried next run since they weren't marked updated.`);
  }
}

main().catch((err) => {
  console.error("sync-lifecycle failed:", err);
  process.exit(1);
});
