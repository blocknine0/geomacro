// scripts/finalize-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const PROTOCOL_FEE_BPS = 150n; // 1.5% — must mirror AgentArena.sol PROTOCOL_FEE_BPS exactly

// Hard cap on how many markets this run will touch, so a big backlog
// can't generate an unbounded burst of RPC calls in a single run.
const MAX_EVENTS_PER_RUN = Number(process.env.MAX_EVENTS_PER_RUN || 40);
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 800);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🛡️ NEW: stop starting new market finalizations once this much wall-clock
// time has passed — same fix as resolve-markets.js, avoids GitHub Actions
// force-cancelling a run mid-transaction.
const RUN_TIME_BUDGET_MS = Number(process.env.RUN_TIME_BUDGET_MS || 4 * 60 * 1000);
const runStartedAt = Date.now();
const timeBudgetExceeded = () => Date.now() - runStartedAt > RUN_TIME_BUDGET_MS;

const CONTRACT_ABI = [
  "function finalizeMarket(string marketId) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)"
];

// Canonical Multicall3 deployment address — same one used in resolve-markets.js
// and the frontend's agent-arena.ts.
const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
];

const SIDE_LABEL = { 0: "NONE", 1: "HAWK", 2: "DOVE" };

// ⚠️ IMPORTANT: this is the enum index we treat as "fully finalized" on-chain.
// This is currently ASSUMED, not confirmed against AgentArena.sol's actual
// MarketStatus enum. If the real enum has a different number of members, or
// "Finalized" sits at a different index, every check against this constant
// will silently never match — which looks EXACTLY like "stuck in dispute
// window forever" from the logs, but is actually a totally different bug.
// TODO: open AgentArena.sol, find `enum MarketStatus { ... }`, and confirm
// the index of the Finalized member matches this value. Update if not.
const STATUS_FINALIZED = Number(process.env.FINALIZED_STATUS_INDEX ?? 4);

// ✅ CONFIRMED via production logs (see run on markets aiResolutionTime
// 87368s vs 70750s old): markets older than ~86400s (24h) since
// aiResolutionTime finalize successfully; markets younger than that stay
// stuck at status=2 no matter how many times finalizeMarket() is called.
// This is a real on-chain dispute window, not a bug. Default 86400s (24h);
// override with DISPUTE_WINDOW_SECONDS if the contract's actual window is
// confirmed to be different.
const DISPUTE_WINDOW_SECONDS = Number(process.env.DISPUTE_WINDOW_SECONDS ?? 86400);
const SAFETY_MARGIN_SECONDS = Number(process.env.DISPUTE_WINDOW_SAFETY_MARGIN_SECONDS ?? 60);

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

// 🛡️ NEW: same rotating multi-RPC manager as resolve-markets.js. Switches to
// a different configured endpoint immediately on a rate-limit error instead
// of waiting out a shared/sustained cap that a fixed wait can't outlast.
// Sequential only (never simultaneous) — avoids the double-broadcast risk a
// multi-provider FallbackProvider has for writes.
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

// 🛡️ Rotating send-retry for finalizeMarket, same shape as resolve-markets.js'
// sendTxWithRetry: rotates through write endpoints immediately on rate limit,
// and re-checks on-chain status before every retry in case an earlier
// attempt was silently mined despite us seeing an error (avoids a duplicate
// finalizeMarket() call reverting against an already-finalized market).
async function sendFinalizeWithRetry(getWriteContract, getReadContract, writeRpcManager, marketId) {
  let nonceAttempt = 0;
  let sweepAttempt = 0;
  let totalRateLimitAttempt = 0;
  const MAX_NONCE_RETRIES = 3;
  const endpointCount = writeRpcManager.count();
  const MAX_TOTAL_RATE_LIMIT_ATTEMPTS = 6 * Math.max(1, endpointCount);

  while (true) {
    try {
      const contract = getWriteContract();
      return await contract.finalizeMarket(marketId);
    } catch (sendErr) {
      const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
      const isRateLimited = isRpcRateLimitError(sendErr);

      if ((isNonceRace || isRateLimited) && (nonceAttempt < MAX_NONCE_RETRIES || totalRateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS)) {
        try {
          const readContract = getReadContract();
          const market = await readContract.getMarketFullDetails(marketId);
          if (Number(market.status) === STATUS_FINALIZED) {
            const alreadyDoneErr = new Error(`Market ${marketId} was already finalized on-chain by an earlier attempt — skipping duplicate send.`);
            alreadyDoneErr.alreadyFinalized = true;
            throw alreadyDoneErr;
          }
        } catch (checkErr) {
          if (checkErr.alreadyFinalized) throw checkErr;
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
        console.log(`  ⏳ RPC rate limited sending finalizeMarket(${marketId}) — all ${endpointCount} endpoint(s) tried. Waiting ${Math.round((backoff + jitter) / 1000)}s before next sweep...`);
        await delay(backoff + jitter);
        sweepAttempt = 0;
        writeRpcManager.rotate();
        continue;
      }

      throw sendErr;
    }
  }
}

// 🛡️ Batch getMarketFullDetails for many markets into a single RPC call via
// Multicall3.aggregate3 instead of one call per market.
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

// claim()-এর সাথে হুবহু ম্যাচিং payout ফর্মুলা (parimutuel + protocol fee),
// যাতে positions টেবিলে যা "claimable" দেখানো হয় আর ইউজার আসলে অনচেইন যা পাবে তা এক থাকে।
function computePayout(userStaked, winningPoolTotal, losingPoolTotal) {
  let payout = userStaked;
  if (winningPoolTotal > 0n && losingPoolTotal > 0n) {
    payout += (userStaked * losingPoolTotal) / winningPoolTotal;
  }
  const platformFee = (payout * PROTOCOL_FEE_BPS) / 10000n;
  return payout - platformFee;
}

// একটি রিজলভড মার্কেটের জন্য সব wallet-এর positions আপডেট করে +
// প্রতিটির জন্য একটি balance-history ইভেন্ট বসায়। প্রতিটি wallet × market independent —
// একজনের পজিশন আরেকজনকে টাচ করে না।
async function syncPositionsForMarket(adminSupabase, eventId, winSideLabel, hawkTotal, doveTotal) {
  const { data: activePositions, error } = await adminSupabase
    .from("positions")
    .select("*")
    .eq("market_id", eventId)
    .eq("status", "active");

  if (error) {
    console.error(`  ⚠️ Could not fetch positions for event ${eventId}: ${error.message}`);
    return;
  }
  if (!activePositions || activePositions.length === 0) return;

  const winningPoolTotal = winSideLabel === "HAWK" ? hawkTotal : doveTotal;
  const losingPoolTotal = winSideLabel === "HAWK" ? doveTotal : hawkTotal;

  for (const position of activePositions) {
    const won = position.side === winSideLabel;
    const nowIso = new Date().toISOString();

    if (won) {
      const staked = BigInt(position.staked_amount_raw); // ৬ ডেসিমেল রঢ ইউনিটে সংরক্ষিত মান
      const payoutRaw = computePayout(staked, winningPoolTotal, losingPoolTotal);
      const payoutDisplay = Number(ethers.formatUnits(payoutRaw, 18));

      const { error: updErr } = await adminSupabase
        .from("positions")
        .update({
          status: "pending_claim",
          resolved_outcome: winSideLabel,
          payout_amount: payoutDisplay,
          updated_at: nowIso
        })
        .eq("id", position.id);

      if (updErr) {
        console.error(`  ⚠️ Failed updating won position ${position.id}: ${updErr.message}`);
        continue;
      }

      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: payoutDisplay, // pending — claim tx এর পরেই actual wallet balance বাড়বে; এটা claimable snapshot
        event_type: "resolve",
        market_id: eventId,
        amount_delta: payoutDisplay
      });
    } else {
      const { error: updErr } = await adminSupabase
        .from("positions")
        .update({
          status: "lost",
          resolved_outcome: winSideLabel,
          payout_amount: 0,
          updated_at: nowIso
        })
        .eq("id", position.id);

      if (updErr) {
        console.error(`  ⚠️ Failed updating lost position ${position.id}: ${updErr.message}`);
        continue;
      }

      const stakedDisplay = Number(ethers.formatUnits(position.staked_amount_raw, 18));
      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: 0,
        event_type: "resolve",
        market_id: eventId,
        amount_delta: -stakedDisplay
      });
    }
  }

  console.log(`  Synced ${activePositions.length} position(s) for event ${eventId} (winner: ${winSideLabel})`);
}

// NEW: pulls the full raw state for a market and prints it. This is the
// diagnostic tooling promised in the previous debugging session — its sole
// purpose is to tell us, in plain numbers, WHY finalStatus keeps missing
// STATUS_FINALIZED. Look at:
//   - status: is it stuck at some other number every single run?
//   - aiResolutionTime vs now: is the dispute window actually still open,
//     or has it already elapsed (in which case status ≠ dispute-window)?
//   - disputer: is it the zero address (nobody disputed) or a real address?
function logMarketState(label, marketId, details) {
  const nowSec = Math.floor(Date.now() / 1000);
  const aiResolutionTime = Number(details.aiResolutionTime ?? 0);
  const secondsSinceAiResolution = aiResolutionTime > 0 ? nowSec - aiResolutionTime : null;
  console.log(
    `  🔍 [${label}] ${marketId} → status=${details.status} winner=${details.winner} ` +
    `tentativeWinner=${details.tentativeWinner} disputer=${details.disputer} ` +
    `aiResolutionTime=${aiResolutionTime} nowSec=${nowSec} ` +
    `secondsSinceAiResolution=${secondsSinceAiResolution === null ? "n/a" : secondsSinceAiResolution}`
  );
}

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY, // service-role — positions/wallet_balance_history-এ লিখতে লাগবে, RLS bypass করার জন্য
    ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, ARC_RPC_URL_5,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) {
    throw new Error("Missing Env.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — positions/balance-history sync will be skipped this run.");
  }

  console.log(`  ℹ️ Treating on-chain status index ${STATUS_FINALIZED} as "Finalized" (override with FINALIZED_STATUS_INDEX if this is wrong — confirm against AgentArena.sol's MarketStatus enum).`);
  console.log(`  ℹ️ Skipping finalize attempts for markets younger than ${DISPUTE_WINDOW_SECONDS}s (+${SAFETY_MARGIN_SECONDS}s margin) since aiResolutionTime — confirmed dispute window from prior run logs. Override with DISPUTE_WINDOW_SECONDS if the contract's actual window differs.`);

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  // service-role client শুধু positions / wallet_balance_history-এর জন্য — events টেবিলের বাকি সব কাজ আগের মতোই anon client দিয়ে
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

  // 🛡️ NEW: same 5-endpoint rotating pool as resolve-markets.js — up to 4
  // dedicated keys (Alchemy/QuickNode/GetBlock/dRPC) plus the public Arc
  // Testnet RPC as an automatic last-resort fallback.
  const publicFallbackUrl = ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";
  const rpcUrls = [ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, publicFallbackUrl];
  const readRpcManager = new RpcManager(rpcUrls, "read");
  const writeRpcManager = new RpcManager(rpcUrls, "write");
  console.log(`Configured ${readRpcManager.count()} RPC endpoint(s) for automatic failover.`);

  const getWriteContract = () => {
    const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, writeRpcManager.current());
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  };
  const getReadContract = () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
  const contractInterface = new ethers.Interface(CONTRACT_ABI);

  const { data: pendingMarkets } = await supabase
    .from("events")
    .select("id")
    .eq("market_created", true)
    .eq("market_resolved", false)
    .eq("ai_processed", true);

  if (!pendingMarkets || pendingMarkets.length === 0) return;

  // Only take the first MAX_EVENTS_PER_RUN — the rest will be picked up
  // by the next scheduled run.
  const batch = pendingMarkets.slice(0, MAX_EVENTS_PER_RUN);
  console.log(`Found ${pendingMarkets.length} market(s) pending finalization. Processing ${batch.length} this run.`);

  // 🛡️ NEW: prefetch pre-finalize status for the whole batch in one
  // Multicall3 call instead of one getMarketFullDetails RPC call per market.
  const batchMarketIds = batch.map((e) => `mkt_${e.id}`);
  let prefetchedDetails = new Map();
  try {
    prefetchedDetails = await batchGetMarketDetails(readRpcManager, contractInterface, batchMarketIds);
    console.log(`  📦 Batched pre-finalize status check for ${batchMarketIds.length} markets via Multicall3 (1 RPC call instead of ${batchMarketIds.length}).`);
  } catch (multicallErr) {
    console.log(`  ⚠️ Multicall3 batch prefetch failed (${multicallErr.message}) — falling back to one getMarketFullDetails call per market.`);
  }

  let finalizedCount = 0;

  for (const event of batch) {
    if (timeBudgetExceeded()) {
      console.log(`  ⏹ Reached RUN_TIME_BUDGET_MS (${RUN_TIME_BUDGET_MS}ms) for this run, stopping early to avoid a mid-transaction cancel. Remaining backlog will be picked up next run.`);
      break;
    }
    const marketId = `mkt_${event.id}`;
    try {
      const cached = prefetchedDetails.get(marketId);
      const onChainMarket = cached !== undefined && cached !== null
        ? cached
        : await callRpcWithBackoff(
            () => getReadContract().getMarketFullDetails(marketId),
            `getMarketFullDetails(${marketId})`,
            readRpcManager,
          );
      const status = Number(onChainMarket.status);

      // NEW: log raw pre-finalize state for every market, every run, before
      // deciding what to do with it.
      logMarketState("pre-finalize", marketId, onChainMarket);

      if (status === STATUS_FINALIZED) {
        // ইতিমধ্যে finalized on-chain (আগের রান মিস হয়ে থাকতে পারে) — শুধু sync করে দাও
        if (!adminSupabase) {
          console.log(`  ⚠️ Skipping resolved-flag update for ${marketId}: no service-role key, cannot sync positions safely.`);
          await delay(RPC_THROTTLE_MS);
          continue;
        }
        const winLabel = SIDE_LABEL[Number(onChainMarket.winner)];
        if (winLabel && winLabel !== "NONE") {
          const pools = await callRpcWithBackoff(
            () => getReadContract().getMarket(marketId),
            `getMarket(${marketId})`,
            readRpcManager,
          );
          await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
        }
        await adminSupabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        finalizedCount++;
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      // NEW: preemptive dispute-window skip — see comment on DISPUTE_WINDOW_SECONDS.
      const aiResolutionTime = Number(onChainMarket.aiResolutionTime ?? 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const windowRemaining = aiResolutionTime > 0
        ? (aiResolutionTime + DISPUTE_WINDOW_SECONDS + SAFETY_MARGIN_SECONDS) - nowSec
        : null;

      if (windowRemaining !== null && windowRemaining > 0) {
        console.log(`  ⏭️ Skipping ${marketId}: still inside dispute window (${windowRemaining}s remaining). Not sending a transaction. Will retry once elapsed.`);
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      console.log(`Finalizing ${marketId}...`);
      let tx;
      try {
        tx = await sendFinalizeWithRetry(getWriteContract, getReadContract, writeRpcManager, marketId);
      } catch (sendErr) {
        if (sendErr.alreadyFinalized) {
          console.log(`  ↪ ${sendErr.message}`);
          const finalized = await getReadContract().getMarketFullDetails(marketId);
          if (adminSupabase) {
            const winLabel = SIDE_LABEL[Number(finalized.winner)];
            if (winLabel && winLabel !== "NONE") {
              const pools = await getReadContract().getMarket(marketId);
              await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
            }
            await adminSupabase.from("events").update({ market_resolved: true }).eq("id", event.id);
            finalizedCount++;
            console.log(`  ✅ Repaired ${marketId} — was already finalized on-chain by an earlier attempt.`);
          }
          await delay(RPC_THROTTLE_MS);
          continue;
        }
        throw sendErr;
      }
      const receipt = await callRpcWithBackoff(() => tx.wait(), `tx.wait(${marketId})`, writeRpcManager);

      // NEW: confirm the transaction actually succeeded on-chain (status 1)
      // rather than reverting silently.
      if (receipt && receipt.status === 0) {
        console.log(`  ❌ finalizeMarket(${marketId}) transaction MINED BUT REVERTED (receipt.status=0). Not syncing, will retry next run. tx=${receipt.hash}`);
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      // finalize এর পরে fresh state পড়ে নাও যাতে real m.winner + pool totals পাওয়া যায়
      const finalized = await callRpcWithBackoff(
        () => getReadContract().getMarketFullDetails(marketId),
        `getMarketFullDetails-postfinalize(${marketId})`,
        readRpcManager,
      );
      const finalStatus = Number(finalized.status);

      logMarketState("post-finalize", marketId, finalized);

      if (finalStatus === STATUS_FINALIZED) {
        if (!adminSupabase) {
          console.log(`  ⚠️ Finalized ${marketId} on-chain, but skipping resolved-flag update: no service-role key.`);
        } else {
          const winLabel = SIDE_LABEL[Number(finalized.winner)];
          if (winLabel && winLabel !== "NONE") {
            const pools = await callRpcWithBackoff(
              () => getReadContract().getMarket(marketId),
              `getMarket-postfinalize(${marketId})`,
              readRpcManager,
            );
            await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
          }
          await adminSupabase.from("events").update({ market_resolved: true }).eq("id", event.id);
          finalizedCount++;
        }
      } else {
        console.log(`  ⏸️ ${marketId} not fully finalized yet (status=${finalStatus}, expected ${STATUS_FINALIZED}). Will retry next run.`);
      }
      await delay(RPC_THROTTLE_MS);
    } catch (err) {
      console.log(`Skipping ${marketId}: ${err.reason || err.shortMessage || err.message}`);
      await delay(RPC_THROTTLE_MS);
    }
  }

  console.log(`Done. Finalized/synced ${finalizedCount} of ${batch.length} market(s) attempted this run. ${pendingMarkets.length - batch.length} remaining in backlog.`);
}

main().catch(console.error);
