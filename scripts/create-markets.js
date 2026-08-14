// scripts/create-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { OLD_CONTRACT_ADDRESS, isLegacyEvent, partitionEventsByContract } from "./lib/dual-contract.js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
// 🆕 Dual-contract transition (mirrors resolve-markets.js/finalize-markets.js):
// NEW markets always go on CONTRACT_ADDRESS (the current/V2 contract) — no
// dual-routing needed for creation itself. But the "is this Supabase-flagged
// active market genuinely still active on-chain?" verification step below
// was checking every flagged market against CONTRACT_ADDRESS only, which
// silently mis-evaluated old V1 markets once CONTRACT_ADDRESS flipped to V2
// — see the exists-field fix in the verification block for the actual bug.
const THRESHOLD_STEP = 5;
const STAKING_DURATION_SEC = 46 * 60 * 60;   // ৪৬ ঘণ্টা পর স্টেকিং বন্ধ — শেষ মুহূর্তে স্টেক করে জেতা ঠেকাতে
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; // ৪৮ ঘণ্টা পর রিজলভ — কন্ট্রাক্ট নিজেই এনফোর্স করে
const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];

// Canonical Multicall3 deployment address — same one used in resolve-markets.js
// and finalize-markets.js.
const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
];

// Hard cap: the app is designed and tested around ~100 concurrently OPEN
// (staking) markets. Beyond that, market creation pauses (news ingestion
// continues unaffected in scripts/ingest-news.js) until earlier markets
// close staking and free up room.
const MAX_ACTIVE_MARKETS = 100;

// 🆕 PERMANENT FIX: room is now counted against genuinely OPEN-for-staking
// markets only (lifecycle_stage='active'), not staking_closed/disputed ones.
const MAX_NEW_MARKETS_PER_RUN = Number(process.env.MAX_NEW_MARKETS_PER_RUN || 30);
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 800);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🛡️ NEW: stop starting new market creations once this much wall-clock time
// has passed — same fix as resolve-markets.js / finalize-markets.js, avoids
// GitHub Actions force-cancelling a run mid-transaction.
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

// 🛡️ NEW: same rotating multi-RPC manager as resolve-markets.js /
// finalize-markets.js. Switches to a different configured endpoint
// immediately on a rate-limit error instead of waiting out a shared/
// sustained cap that a fixed wait can't outlast. Sequential only (never
// simultaneous) — avoids the double-broadcast risk a multi-provider
// FallbackProvider has for writes.
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

// 🛡️ Rotating send-retry for createMarket, same shape as resolve-markets.js'
// sendTxWithRetry / finalize-markets.js' sendFinalizeWithRetry: rotates
// through write endpoints immediately on rate limit, and re-checks on-chain
// existence before every retry in case an earlier attempt was silently
// mined despite us seeing an error (avoids a duplicate createMarket() call
// reverting against an already-created market).
async function sendCreateWithRetry(getWriteContract, getReadContract, writeRpcManager, marketId) {
  let nonceAttempt = 0;
  let sweepAttempt = 0;
  let totalRateLimitAttempt = 0;
  const MAX_NONCE_RETRIES = 3;
  const endpointCount = writeRpcManager.count();
  const MAX_TOTAL_RATE_LIMIT_ATTEMPTS = 6 * Math.max(1, endpointCount);

  while (true) {
    try {
      const contract = getWriteContract();
      return await contract.createMarket(marketId, STAKING_DURATION_SEC, RESOLUTION_DURATION_SEC);
    } catch (sendErr) {
      const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
      const isRateLimited = isRpcRateLimitError(sendErr);

      if ((isNonceRace || isRateLimited) && (nonceAttempt < MAX_NONCE_RETRIES || totalRateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS)) {
        try {
          const readContract = getReadContract();
          const existing = await readContract.getMarket(marketId);
          if (existing.exists) {
            const alreadyExistsErr = new Error(`Market ${marketId} was already created on-chain by an earlier attempt — skipping duplicate send.`);
            alreadyExistsErr.alreadyExists = true;
            throw alreadyExistsErr;
          }
        } catch (checkErr) {
          if (checkErr.alreadyExists) throw checkErr;
        }
      }

      if (isNonceRace && nonceAttempt < MAX_NONCE_RETRIES) {
        nonceAttempt++;
        const wait = 1500 * nonceAttempt;
        console.log(`  ⏳ Nonce/mempool race on ${marketId} (${sendErr.code}), attempt ${nonceAttempt}/${MAX_NONCE_RETRIES}. Waiting ${wait}ms and retrying with a fresh nonce...`);
        await delay(wait);
        continue;
      }

      if (isRateLimited && totalRateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS) {
        totalRateLimitAttempt++;
        if (writeRpcManager.hasMultiple() && sweepAttempt < endpointCount - 1) {
          sweepAttempt++;
          writeRpcManager.rotate();
          continue;
        }
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.floor(totalRateLimitAttempt / endpointCount), MAX_BACKOFF_MS);
        const jitter = Math.random() * 500;
        console.log(`  ⏳ RPC rate limited sending createMarket(${marketId}) — all ${endpointCount} endpoint(s) tried. Waiting ${Math.round((backoff + jitter) / 1000)}s before next sweep...`);
        await delay(backoff + jitter);
        sweepAttempt = 0;
        writeRpcManager.rotate();
        continue;
      }

      throw sendErr;
    }
  }
}

// 🛡️ Batch getMarket(marketId).exists for many candidate events into a
// single RPC call via Multicall3.aggregate3 instead of one call per event.
// Always targets CONTRACT_ADDRESS (current/V2) — these are candidate NEW
// markets (market_created is null/false), which always get created on the
// current contract, so no dual-routing needed here.
async function batchGetMarketExists(readRpcManager, contractInterface, marketIds) {
  const calls = marketIds.map((marketId) => ({
    target: CONTRACT_ADDRESS,
    allowFailure: true,
    callData: contractInterface.encodeFunctionData("getMarket", [marketId]),
  }));

  const results = await callRpcWithBackoff(
    () => {
      const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readRpcManager.current());
      return multicall.aggregate3.staticCall(calls);
    },
    `multicall.aggregate3 (${marketIds.length} markets)`,
    readRpcManager,
  );

  const existsByMarketId = new Map();
  results.forEach((result, i) => {
    const marketId = marketIds[i];
    if (!result.success) {
      existsByMarketId.set(marketId, null); // couldn't determine — fall back to individual call
      return;
    }
    try {
      const decoded = contractInterface.decodeFunctionResult("getMarket", result.returnData);
      existsByMarketId.set(marketId, decoded.exists);
    } catch {
      existsByMarketId.set(marketId, null);
    }
  });
  return existsByMarketId;
}

// 🛡️ NEW: batch-verify "active"-flagged events against the RIGHT contract
// per event (legacy V1 vs current V2), fixing two bugs at once:
// 1) Dual-contract routing — a V1 market's real status must be checked
//    against OLD_CONTRACT_ADDRESS, not CONTRACT_ADDRESS (which is V2 post-
//    cutover). Checking a V1-only marketId against V2 always returns a
//    zero-value struct (the market was never created there).
// 2) The exists-field bug — that zero-value struct decodes to status=0,
//    which STAGE_BY_STATUS treats as "active" (status 0 IS the real "OPEN"
//    enum value for markets that genuinely exist). Without checking the
//    ABI's own `exists` boolean first, a market that doesn't exist on the
//    queried contract at all gets misread as "genuinely active" — this is
//    exactly what produced "14 genuinely active, 0 repaired" once
//    CONTRACT_ADDRESS pointed at V2 while these 14 were still V1 markets.
async function batchVerifyActiveMarkets(readRpcManager, contractInterface, flaggedEvents) {
  const { legacyEvents, v2Events } = partitionEventsByContract(flaggedEvents, CONTRACT_ADDRESS);

  async function verifyGroup(events, targetAddress) {
    if (events.length === 0) return [];
    const marketIds = events.map((e) => `mkt_${e.id}`);
    const calls = marketIds.map((marketId) => ({
      target: targetAddress,
      allowFailure: true,
      callData: contractInterface.encodeFunctionData("getMarket", [marketId]),
    }));
    const results = await callRpcWithBackoff(
      () => {
        const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readRpcManager.current());
        return multicall.aggregate3.staticCall(calls);
      },
      `multicall.aggregate3-active-verify (${marketIds.length} markets @ ${targetAddress})`,
      readRpcManager,
    );
    return results.map((result, i) => ({ event: events[i], result }));
  }

  const [legacyResults, v2Results] = await Promise.all([
    verifyGroup(legacyEvents, OLD_CONTRACT_ADDRESS),
    verifyGroup(v2Events, CONTRACT_ADDRESS),
  ]);

  return [...legacyResults, ...v2Results];
}

// Mirrors STAGE_BY_STATUS in sync-lifecycle.js — status 1 (staking closed,
// awaiting resolution) and status 2 (AI resolved, dispute window open) both
// map to "awaiting_dispute" in the frontend's 4-bucket design.
const STAGE_BY_STATUS = { 0: "active", 1: "awaiting_dispute", 2: "awaiting_dispute", 3: "disputed", 4: "completed" };

async function main() {
  const {
    OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
    ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, ARC_RPC_URL_5,
  } = process.env;
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

  // 🛡️ NEW: same 5-endpoint rotating pool as resolve-markets.js /
  // finalize-markets.js — up to 4 dedicated keys (Alchemy/QuickNode/GetBlock/
  // dRPC) plus the public Arc Testnet RPC as an automatic last-resort fallback.
  const publicFallbackUrl = ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";
  const rpcUrls = [ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, publicFallbackUrl];
  const readRpcManager = new RpcManager(rpcUrls, "read");
  const writeRpcManager = new RpcManager(rpcUrls, "write");
  console.log(`Configured ${readRpcManager.count()} RPC endpoint(s) for automatic failover.`);

  const network = await callRpcWithBackoff(() => readRpcManager.current().getNetwork(), "getNetwork", readRpcManager);
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const getWriteContract = () => {
    const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, writeRpcManager.current());
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  };
  const getReadContract = () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
  // 🛡️ NEW: for reads that immediately follow a write (post-create block
  // lookup, duplicate-create repair reads), use the SAME provider that mined
  // the transaction rather than the independently-rotating read provider —
  // different testnet RPC providers don't always sync to the exact same
  // block at the exact same time.
  const getPostTxReadContract = () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, writeRpcManager.current());
  const contractInterface = new ethers.Interface(CONTRACT_ABI);

  // 🆕 PERMANENT FIX: don't blindly trust Supabase's lifecycle_stage column for
  // room-counting — it's written by sync-lifecycle.js only twice per 2h cycle,
  // so it can be up to ~1h stale (staking already closed on-chain, but the
  // column still says "active"). Now we batch-verify every "active"-flagged
  // row's real on-chain status via Multicall3, ROUTED TO THE CORRECT
  // CONTRACT PER MARKET (market_address-aware — see batchVerifyActiveMarkets),
  // and only count ones that are genuinely still staking-open, self-repairing
  // any stale rows we find along the way.
  const { data: flaggedActiveEvents, error: countErr } = await supabase
    .from("events")
    .select("id, market_address")
    .eq("market_created", true)
    .eq("lifecycle_stage", "active");
  if (countErr) throw new Error(`Supabase error counting active markets: ${countErr.message}`);

  let activeCount = flaggedActiveEvents?.length ?? 0;
  if (flaggedActiveEvents && flaggedActiveEvents.length > 0) {
    try {
      const verified = await batchVerifyActiveMarkets(readRpcManager, contractInterface, flaggedActiveEvents);

      let genuinelyActive = 0;
      const staleRepairs = [];
      verified.forEach(({ event, result }) => {
        if (!result.success) {
          // couldn't verify — count it as active (conservative: don't shrink
          // room based on a read we couldn't confirm)
          genuinelyActive++;
          return;
        }
        try {
          const decoded = contractInterface.decodeFunctionResult("getMarket", result.returnData);
          // 🩹 THE ACTUAL FIX: check `exists` FIRST. A market that was never
          // created on the contract we just queried decodes to a zero-value
          // struct — status=0, which STAGE_BY_STATUS treats as the real
          // "OPEN" state. Without this check, "doesn't exist here" and
          // "genuinely active" are indistinguishable.
          if (!decoded.exists) {
            staleRepairs.push({ id: event.id, newStage: "completed", reason: "does not exist on its recorded contract — likely a stale/orphaned row" });
            return;
          }
          const status = Number(decoded.status);
          const stage = status === 0 ? "active" : (STAGE_BY_STATUS[status] ?? "active");
          if (stage === "active") {
            genuinelyActive++;
          } else {
            staleRepairs.push({ id: event.id, newStage: stage, reason: `on-chain status is ${status}` });
          }
        } catch {
          genuinelyActive++;
        }
      });

      if (staleRepairs.length > 0) {
        console.log(`  🔧 Found ${staleRepairs.length} market(s) flagged "active" in Supabase but no longer (or never) active on-chain — repairing lifecycle_stage now instead of waiting for sync-lifecycle.js.`);
        for (const repair of staleRepairs) {
          console.log(`     - ${repair.id}: ${repair.reason} → ${repair.newStage}`);
          await adminSupabase.from("events").update({ lifecycle_stage: repair.newStage }).eq("id", repair.id);
        }
      }
      activeCount = genuinelyActive;
      console.log(`  📦 Verified ${flaggedActiveEvents.length} "active"-flagged market(s) via Multicall3 (split by contract) — ${genuinelyActive} genuinely still active, ${staleRepairs.length} repaired.`);
    } catch (multicallErr) {
      console.log(`  ⚠️ On-chain active-verification failed (${multicallErr.message}) — falling back to Supabase's raw lifecycle_stage count (may be stale).`);
    }
  }

  const rawRoom = MAX_ACTIVE_MARKETS - activeCount;
  const room = Math.min(Math.max(rawRoom, 0), MAX_NEW_MARKETS_PER_RUN);
  console.log(`Active markets (on-chain verified): ${activeCount} / ${MAX_ACTIVE_MARKETS}. Raw room: ${Math.max(rawRoom, 0)}. Creating up to ${room} this run (MAX_NEW_MARKETS_PER_RUN=${MAX_NEW_MARKETS_PER_RUN}).`);
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

  // 🛡️ NEW: prefetch on-chain existence for the whole batch in one
  // Multicall3 call instead of one getMarket RPC call per event. Always
  // against CONTRACT_ADDRESS (current/V2) — these are brand-new markets.
  const batchMarketIds = events.map((e) => `mkt_${e.id}`);
  let prefetchedExists = new Map();
  try {
    prefetchedExists = await batchGetMarketExists(readRpcManager, contractInterface, batchMarketIds);
    console.log(`  📦 Batched existence check for ${batchMarketIds.length} markets via Multicall3 (1 RPC call instead of ${batchMarketIds.length}).`);
  } catch (multicallErr) {
    console.log(`  ⚠️ Multicall3 batch prefetch failed (${multicallErr.message}) — falling back to one getMarket call per event.`);
  }

  for (const event of events) {
    if (timeBudgetExceeded()) {
      console.log(`  ⏹ Reached RUN_TIME_BUDGET_MS (${RUN_TIME_BUDGET_MS}ms) for this run, stopping early to avoid a mid-transaction cancel. Remaining candidates will be picked up next run.`);
      break;
    }
    const marketId = `mkt_${event.id}`;
    const marketThreshold = event.severity + THRESHOLD_STEP;
    try {
      let marketExists = false;
      try {
        const cached = prefetchedExists.get(marketId);
        marketExists = cached !== undefined && cached !== null
          ? cached
          : (await callRpcWithBackoff(() => getReadContract().getMarket(marketId), `getMarket(${marketId})`, readRpcManager)).exists;
      } catch (decodeErr) {
        // Fallback — treat as not-yet-created, createMarket's own duplicate
        // protection (via sendCreateWithRetry's pre-retry check) still
        // guards against actually double-creating.
      }
      if (marketExists) {
        console.log(`Market ${marketId} already exists on-chain. Syncing Supabase.`);
        const fallbackResolutionAt = new Date(new Date(event.created_at).getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();
        await adminSupabase.from("events").update({ market_created: true, market_threshold: marketThreshold, resolution_at: fallbackResolutionAt, market_address: CONTRACT_ADDRESS }).eq("id", event.id);
        await delay(RPC_THROTTLE_MS);
        continue;
      }
      console.log(`Creating market ${marketId} for: "${event.source_title}"...`);
      let tx;
      try {
        tx = await sendCreateWithRetry(getWriteContract, getPostTxReadContract, writeRpcManager, marketId);
      } catch (sendErr) {
        if (sendErr.alreadyExists) {
          console.log(`  ↪ ${sendErr.message}`);
          const fallbackResolutionAt = new Date(new Date(event.created_at).getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();
          await adminSupabase.from("events").update({ market_created: true, market_threshold: marketThreshold, resolution_at: fallbackResolutionAt, market_address: CONTRACT_ADDRESS }).eq("id", event.id);
          console.log(`  ✅ Repaired ${marketId} — was already created on-chain by an earlier attempt.`);
          await delay(RPC_THROTTLE_MS);
          continue;
        }
        throw sendErr;
      }
      console.log(`  Transaction sent: ${tx.hash}`);
      const receipt = await callRpcWithBackoff(() => tx.wait(), `tx.wait(${marketId})`, writeRpcManager);
      console.log(`  Confirmed in block ${receipt.blockNumber}`);

      const confirmedBlock = await callRpcWithBackoff(
        () => writeRpcManager.current().getBlock(receipt.blockNumber),
        `getBlock(${receipt.blockNumber})`,
        writeRpcManager,
      );
      const chainConfirmedAt = new Date(Number(confirmedBlock.timestamp) * 1000);
      const resolutionAt = new Date(chainConfirmedAt.getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();

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
    await delay(RPC_THROTTLE_MS);
  }
  console.log("Done.");
}
main().catch(console.error);
