// scripts/finalize-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const PROTOCOL_FEE_BPS = 150n; // 1.5% — must mirror AgentArena.sol PROTOCOL_FEE_BPS exactly

// NEW: hard cap on how many markets this run will touch, so a big backlog
// can't generate an unbounded burst of RPC calls in a single run (this is
// what was crashing the whole process against QuickNode's 100/sec limit).
const MAX_EVENTS_PER_RUN = Number(process.env.MAX_EVENTS_PER_RUN || 40);
// Small fixed pause between every market we touch, regardless of outcome.
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 350);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CONTRACT_ABI = [
  "function finalizeMarket(string marketId) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)"
];

const SIDE_LABEL = { 0: "NONE", 1: "HAWK", 2: "DOVE" };

// 🛡️ NEW: same backoff pattern used in resolve-markets.js. QuickNode (and most
// RPC providers) return JSON-RPC error code -32007 or HTTP 429 when you exceed
// their per-second request limit. Previously NONE of the RPC calls in this
// file were wrapped, so a single rate-limit hit anywhere would throw, get
// caught by the per-market try/catch, and silently skip that market forever
// (or, if it happened early enough and wasn't caught, crash the whole run).
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

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY, // নতুন — positions/wallet_balance_history-এ লিখতে লাগবে, RLS bypass করার জন্য
    ARC_RPC_URL
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) {
    throw new Error("Missing Env.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — positions/balance-history sync will be skipped this run.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  // service-role client শুধু positions / wallet_balance_history-এর জন্য — events টেবিলের বাকি সব কাজ আগের মতোই anon client দিয়ে
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const { data: pendingMarkets } = await supabase
    .from("events")
    .select("id")
    .eq("market_created", true)
    .eq("market_resolved", false)
    .eq("ai_processed", true);

  if (!pendingMarkets || pendingMarkets.length === 0) return;

  // NEW: only take the first MAX_EVENTS_PER_RUN — the rest will be picked up
  // by the next scheduled run. This is the main fix: previously this loop had
  // no cap at all and would try to burn through the entire backlog (which can
  // be hundreds of markets) in one go, each needing 2-3 RPC calls, which is
  // exactly what triggered "100/second request limit reached" crashes.
  const batch = pendingMarkets.slice(0, MAX_EVENTS_PER_RUN);
  console.log(`Found ${pendingMarkets.length} market(s) pending finalization. Processing ${batch.length} this run.`);

  let finalizedCount = 0;

  for (const event of batch) {
    const marketId = `mkt_${event.id}`;
    try {
      const onChainMarket = await callRpcWithBackoff(
        () => contract.getMarketFullDetails(marketId),
        `getMarketFullDetails(${marketId})`,
      );
      const status = Number(onChainMarket.status);

      if (status === 4) {
        // ইতিমধ্যে finalized on-chain (আগের রান মিস হয়ে থাকতে পারে) — শুধু sync করে দাও
        // ⚠️ FIX: adminSupabase না থাকলে (বা sync fail করলে) market_resolved=true সেট করা যাবে না,
        // নাহলে এই event চিরতরে orphaned হয়ে যাবে (পরের run আর কখনো retry করবে না)
        if (!adminSupabase) {
          console.log(`  ⚠️ Skipping resolved-flag update for ${marketId}: no service-role key, cannot sync positions safely.`);
          await delay(RPC_THROTTLE_MS);
          continue;
        }
        const winLabel = SIDE_LABEL[Number(onChainMarket.winner)];
        if (winLabel && winLabel !== "NONE") {
          const pools = await callRpcWithBackoff(() => contract.getMarket(marketId), `getMarket(${marketId})`);
          await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
        }
        await adminSupabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        finalizedCount++;
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      console.log(`Finalizing ${marketId}...`);
      const tx = await callRpcWithBackoff(() => contract.finalizeMarket(marketId), `finalizeMarket(${marketId})`);
      await callRpcWithBackoff(() => tx.wait(), `tx.wait(${marketId})`);

      // finalize এর পরে fresh state পড়ে নাও যাতে real m.winner + pool totals পাওয়া যায়
      const finalized = await callRpcWithBackoff(
        () => contract.getMarketFullDetails(marketId),
        `getMarketFullDetails-postfinalize(${marketId})`,
      );
      const finalStatus = Number(finalized.status);

      if (finalStatus === 4) {
        // ⚠️ FIX: এখানেও একই কারণে — sync guaranteed না হলে resolved flag সেট করা যাবে না
        if (!adminSupabase) {
          console.log(`  ⚠️ Finalized ${marketId} on-chain, but skipping resolved-flag update: no service-role key.`);
        } else {
          const winLabel = SIDE_LABEL[Number(finalized.winner)];
          if (winLabel && winLabel !== "NONE") {
            const pools = await callRpcWithBackoff(() => contract.getMarket(marketId), `getMarket-postfinalize(${marketId})`);
            await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
          }
          await adminSupabase.from("events").update({ market_resolved: true }).eq("id", event.id);
          finalizedCount++;
        }
      }
      // finalStatus 4 না হলে (এখনো DISPUTED phase চলছে) — market_resolved false-ই থাকবে,
      // পরের cron run-এ আবার চেষ্টা হবে যতক্ষণ না dispute window শেষ হয়।
      await delay(RPC_THROTTLE_MS);
    } catch (err) {
      console.log(`Skipping ${marketId}: ${err.reason || err.shortMessage || err.message}`);
      await delay(RPC_THROTTLE_MS);
    }
  }

  console.log(`Done. Finalized/synced ${finalizedCount} of ${batch.length} market(s) attempted this run. ${pendingMarkets.length - batch.length} remaining in backlog.`);
}

main().catch(console.error);
