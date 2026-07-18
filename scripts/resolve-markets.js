// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const MAX_RESOLUTIONS_PER_RUN = Number(process.env.MAX_RESOLUTIONS_PER_RUN || 15);
const MAX_EVENTS_PER_RUN = Number(process.env.MAX_EVENTS_PER_RUN || 20);

const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

// Canonical Multicall3 deployment address (same one already used in the
// frontend's agent-arena.ts). Lets us batch N reads into 1 RPC call.
const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

const MAX_RATE_LIMIT_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 800);

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

// 🛡️ NEW: rotating multi-RPC manager. Instead of hammering one endpoint and
// waiting out a rate limit (which does nothing if the limit is a shared,
// sustained cap on a public/free-tier RPC — waiting 60s doesn't help if the
// endpoint is *still* saturated 60s later), this switches to a different
// configured endpoint immediately on a rate-limit error. Time-based backoff
// is now the last resort, only used once every configured endpoint has
// already been tried in the current sweep and all of them failed.
//
// Deliberately sequential (never simultaneous) — only one endpoint is ever
// "current" at a time, whether reading or sending a transaction. This avoids
// the double-broadcast risk a simultaneous multi-provider FallbackProvider
// has for writes (one endpoint silently mining a tx while another reports
// it as rate-limited, causing duplicate-send reverts on retry).
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

// Generic retry wrapper for read-only RPC calls. `fn` is called with no args
// and should internally read `rpcManager.current()` fresh each time (via a
// contract-getter closure) so it always targets whichever endpoint is
// currently active after a rotation.
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
        continue; // try the new endpoint immediately, no wait
      }
      // every configured endpoint failed in this sweep (or only one endpoint
      // exists) — now fall back to a timed backoff before trying again
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

async function callGroqWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const message = String(error?.message ?? error?.error?.message ?? "");
      const isDailyQuotaExhausted = status === 429 && /tokens per day|requests per day|TPD|RPD/i.test(message);
      if (isDailyQuotaExhausted) {
        const quotaErr = new Error(`Groq daily token quota exhausted: ${message}`);
        quotaErr.isQuotaExhausted = true;
        throw quotaErr;
      }
      if (status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      attempt++;
      console.log(`  ⏳ Rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

// 🛡️ Tx sends: rotate through write endpoints immediately on rate limit
// (never simultaneously — only one active at a time, so no duplicate
// broadcast risk), and re-check on-chain market status before every retry in
// case an earlier attempt was silently mined despite us seeing an error.
async function sendTxWithRetry(getWriteContract, getReadContract, writeRpcManager, marketId, side) {
  let nonceAttempt = 0;
  let sweepAttempt = 0;
  let totalRateLimitAttempt = 0;
  const MAX_NONCE_RETRIES = 3;
  const endpointCount = writeRpcManager.count();
  const MAX_TOTAL_RATE_LIMIT_ATTEMPTS = 6 * Math.max(1, endpointCount);

  while (true) {
    try {
      const contract = getWriteContract();
      return await contract.declareWinnerByAI(marketId, side);
    } catch (sendErr) {
      const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
      const isRateLimited = isRpcRateLimitError(sendErr);

      if ((isNonceRace || isRateLimited) && (nonceAttempt < MAX_NONCE_RETRIES || totalRateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS)) {
        // Before retrying, confirm the market is still actually resolvable —
        // if an earlier attempt silently succeeded, stop and let the caller
        // repair Supabase instead of sending a duplicate.
        try {
          const readContract = getReadContract();
          const market = await readContract.getMarketFullDetails(marketId);
          if (Number(market.status) >= 2) {
            const alreadyResolvedErr = new Error(`Market ${marketId} was already resolved on-chain by an earlier attempt — skipping duplicate send.`);
            alreadyResolvedErr.alreadyResolved = true;
            throw alreadyResolvedErr;
          }
        } catch (checkErr) {
          if (checkErr.alreadyResolved) throw checkErr;
          // status-check itself failed too — fall through to normal retry logic
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
          continue; // try the new endpoint immediately, no wait
        }
        // exhausted all endpoints this sweep — timed backoff, then reset sweep
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.floor(totalRateLimitAttempt / endpointCount), MAX_BACKOFF_MS);
        const jitter = Math.random() * 500;
        console.log(`  ⏳ RPC rate limited sending declareWinnerByAI(${marketId}) — all ${endpointCount} endpoint(s) tried. Waiting ${Math.round((backoff + jitter) / 1000)}s before next sweep...`);
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
async function batchGetMarketDetails(getReadContract, readRpcManager, contractInterface, marketIds) {
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

function buildJudgePrompt(event) {
  const summary = (event.summary || "").slice(0, 300);
  const narrative = (event.narrative || "").slice(0, 200);
  return `You are a geopolitical/macro risk analyst judging the outcome of a prediction market, 48 hours after the original event was reported.

Original event details:
- Category: ${event.category}
- Headline: "${event.source_title}"
- Narrative: "${narrative}"
- Summary: "${summary}"
- Original severity score (0-100): ${event.severity}

Task: Judge whether the risk described has:
- ESCALATED or remained highly active/unresolved → side "HAWK"
- DE-ESCALATED, been resolved, or proven overstated → side "DOVE"

If genuinely uncertain, default to "DOVE".

Respond STRICTLY in JSON, no markdown fences, no extra text:
{ "side": "HAWK" | "DOVE", "reasoning": "one sentence justification" }`;
}

function parseJudgeResult(rawContent) {
  const cleaned = rawContent.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned);
  const side = result.side === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
  return { side, sideLabel: result.side === "HAWK" ? "HAWK" : "DOVE", reasoning: result.reasoning || "" };
}

async function callCerebrasJudge(cerebrasApiKey, event) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cerebrasApiKey}`,
    },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [{ role: "user", content: buildJudgePrompt(event) }],
      temperature: 0.1,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(`Cerebras HTTP ${response.status}: ${body.slice(0, 200)}`);
    err.status = response.status;
    if (response.status === 429) err.isQuotaExhausted = true;
    throw err;
  }

  const data = await response.json();
  return parseJudgeResult(data.choices[0].message.content);
}

async function judgeOutcome(groq, event, cerebrasApiKey) {
  const prompt = buildJudgePrompt(event);

  try {
    const completion = await callGroqWithBackoff(
      () => groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 150,
      }),
      `judgeOutcome (${event.source_title?.slice(0, 40) ?? "?"})`,
    );
    return parseJudgeResult(completion.choices[0].message.content);
  } catch (groqErr) {
    if (!groqErr.isQuotaExhausted || !cerebrasApiKey) throw groqErr;
    console.log(`  ↪ Groq daily quota exhausted — falling back to Cerebras (separate free quota) for this judgment...`);
    return await callCerebrasJudge(cerebrasApiKey, event);
  }
}

async function main() {
  const {
    OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
    ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, ARC_RPC_URL_5,
    GROQ_API_KEY, CEREBRAS_API_KEY,
  } = process.env;

  // 🛡️ NEW: the original public Arc Testnet RPC (rpc.testnet.arc.network) is
  // kept as a 5th fallback slot by default, even after configuring 4 dedicated
  // keys (Alchemy, QuickNode, GetBlock, dRPC). It's the one most likely to be
  // rate-limited under heavy shared load, but an extra fallback that
  // occasionally works is still strictly better than none — the RpcManager
  // only reaches it after the first 4 endpoints all fail in the same sweep.
  // Note: GitHub Actions passes an empty string for an unset secret,
  // indistinguishable from "explicitly set to empty", so we just default
  // whenever it's falsy rather than trying to detect intentional opt-out.
  const publicFallbackUrl = ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY)
    throw new Error("Missing env.");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — events.ai_processed/market_resolved updates will likely be silently blocked by RLS.");
  }
  if (!CEREBRAS_API_KEY) {
    console.warn("⚠️ CEREBRAS_API_KEY missing — no fallback provider if Groq's daily quota runs out (events will just wait for next run instead).");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

  // Both read and write share the same pool of RPC URLs, but each keeps its
  // own independent RpcManager (its own "current index") — a write rotation
  // doesn't force reads to rotate too, and vice versa, since they fail
  // independently.
  const rpcUrls = [ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, publicFallbackUrl];
  const readRpcManager = new RpcManager(rpcUrls, "read");
  const writeRpcManager = new RpcManager(rpcUrls, "write");
  console.log(`Configured ${readRpcManager.count()} RPC endpoint(s) for automatic failover.`);

  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    timeout: 30 * 1000,
    maxRetries: 3,
    fetch: fetch,
  });

  const network = await callRpcWithBackoff(() => readRpcManager.current().getNetwork(), "getNetwork", readRpcManager);
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  // Always construct fresh Contract instances bound to whichever provider is
  // currently active — cheap (no network call), and guarantees every call
  // targets the post-rotation endpoint rather than a stale one.
  const getWriteContract = () => {
    const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, writeRpcManager.current());
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  };
  const getReadContract = () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
  // 🛡️ NEW: for reads that immediately follow a write, use the SAME provider
  // that mined the transaction rather than the independently-rotating read
  // provider — different testnet RPC providers don't always sync to the
  // exact same block at the exact same time, which can surface as a spurious
  // "missing revert data" error on a plain storage-read function.
  const getPostTxReadContract = () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, writeRpcManager.current());
  // used only to get contractInterface for encoding/decoding multicall data — doesn't matter which provider
  const contractInterface = new ethers.Interface(CONTRACT_ABI);

  const now = new Date().toISOString();
  const { data: dueEvents, error: fetchError } = await supabase
    .from("events")
    .select("*")
    .eq("market_created", true)
    .eq("ai_processed", false)
    .lte("resolution_at", now);

  if (fetchError) throw new Error(`Supabase error: ${fetchError.message}`);
  if (!dueEvents || dueEvents.length === 0) return console.log("No due markets for resolution.");

  console.log(`Found ${dueEvents.length} market(s) due for resolution (will look at up to ${MAX_EVENTS_PER_RUN} this run, resolve up to ${MAX_RESOLUTIONS_PER_RUN}).`);
  let resolvedCount = 0;
  let eventsLookedAt = 0;
  let groqQuotaExhausted = false;

  const batchMarketIds = dueEvents.slice(0, MAX_EVENTS_PER_RUN).map((e) => `mkt_${e.id}`);
  let prefetchedDetails = new Map();
  try {
    prefetchedDetails = await batchGetMarketDetails(getReadContract, readRpcManager, contractInterface, batchMarketIds);
    console.log(`  📦 Batched status check for ${batchMarketIds.length} markets via Multicall3 (1 RPC call instead of ${batchMarketIds.length}).`);
  } catch (multicallErr) {
    console.log(`  ⚠️ Multicall3 batch prefetch failed (${multicallErr.message}) — falling back to one getMarketFullDetails call per market. If this keeps happening, Multicall3 is likely not deployed at ${MULTICALL3_ADDRESS} on this chain.`);
  }

  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    if (eventsLookedAt >= MAX_EVENTS_PER_RUN) {
      console.log(`  ⏹ Reached MAX_EVENTS_PER_RUN (${MAX_EVENTS_PER_RUN}) for this run, stopping early. Remaining backlog will be picked up next run.`);
      break;
    }
    if (timeBudgetExceeded()) {
      console.log(`  ⏹ Reached RUN_TIME_BUDGET_MS (${RUN_TIME_BUDGET_MS}ms) for this run, stopping early to avoid a mid-transaction cancel. Remaining backlog will be picked up next run.`);
      break;
    }
    if (groqQuotaExhausted) {
      console.log(`  ⏭ Skipping remaining events this run — daily AI quota is exhausted. They'll be retried next run.`);
      break;
    }
    eventsLookedAt++;
    const marketId = `mkt_${event.id}`;

    try {
      let market;
      try {
        const cached = prefetchedDetails.get(marketId);
        market = cached !== undefined && cached !== null
          ? cached
          : await callRpcWithBackoff(
              () => getReadContract().getMarketFullDetails(marketId),
              `getMarketFullDetails(${marketId})`,
              readRpcManager,
            );
      } catch (decodeErr) {
        console.log(`⚠️ Warning: Could not fetch details for ${marketId}. Skipping. Reason: ${decodeErr.message}`);
        await delay(RPC_THROTTLE_MS);
        continue;
      }
      const marketStatus = Number(market.status);

      // 🛡️ NEW: Supabase's resolution_at can be wrong for markets created
      // before create-markets.js's on-chain-timestamp fix — it was computed
      // from event.created_at (news ingestion time) instead of the actual
      // on-chain market-creation timestamp, so it can say "ready" well before
      // the contract's real resolutionTime. Sending a resolve tx in that
      // window always reverts with "Too early to resolve" — pure wasted gas
      // and RPC calls. We already have resolutionTime from the batch
      // prefetch, so check it before ever attempting a send, and repair
      // Supabase's resolution_at from the real on-chain value so future
      // queries stop re-selecting this market until it's actually due.
      const onChainResolutionTime = Number(market.resolutionTime ?? 0);
      const nowSec = Math.floor(Date.now() / 1000);
      if (marketStatus < 2 && onChainResolutionTime > 0 && onChainResolutionTime > nowSec) {
        const secondsRemaining = onChainResolutionTime - nowSec;
        console.log(`  ⏭ Skipping ${marketId}: on-chain resolutionTime not reached yet (${secondsRemaining}s remaining). Repairing Supabase's resolution_at, which was stale.`);
        const correctResolutionAt = new Date(onChainResolutionTime * 1000).toISOString();
        const { error: repairErr } = await adminSupabase.from("events").update({ resolution_at: correctResolutionAt }).eq("id", event.id);
        if (repairErr) console.log(`  ⚠️ Could not repair resolution_at for ${marketId}: ${repairErr.message}`);
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      // 2 = AI_RESOLVED, 3 = DISPUTED, 4 = FINALIZED
      if (marketStatus >= 2) {
        if (!event.ai_processed) {
          try {
            const market = await callRpcWithBackoff(
              () => getReadContract().getMarketFullDetails(marketId),
              `getMarketFullDetails-repair(${marketId})`,
              readRpcManager,
            );
            const tentative = Number(market.tentativeWinner);
            const sideLabel = tentative === SIDE.HAWK ? "HAWK" : tentative === SIDE.DOVE ? "DOVE" : null;
            if (sideLabel) {
              const { error: repairUpdErr, count } = await adminSupabase.from("events").update({
                ai_processed: true,
                ai_tentative_winner: sideLabel,
                ai_resolved_at: new Date().toISOString(),
              }, { count: "exact" }).eq("id", event.id);
              if (repairUpdErr) {
                console.log(`  ⚠️ Repair write failed for ${marketId}: ${repairUpdErr.message}`);
              } else {
                console.log(`  ✅ Repaired orphaned ai_processed flag for ${marketId} (was already resolved on-chain as ${sideLabel}, but Supabase flag was never set). Rows affected: ${count}`);
              }
            }
          } catch (repairErr) {
            console.log(`  ⚠️ Could not repair ai_processed for ${marketId}: ${repairErr.message}`);
          }
        }
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      console.log(`Judging outcome for ${marketId}: "${event.source_title}"...`);
      let judgment;
      try {
        judgment = await judgeOutcome(groq, event, CEREBRAS_API_KEY);
      } catch (judgeErr) {
        if (judgeErr.isQuotaExhausted) {
          console.error(`  🛑 ${judgeErr.message}`);
          console.error(`  🛑 Halting further AI calls for this run — ${CEREBRAS_API_KEY ? "both Groq and Cerebras are" : "Groq is"} out of daily quota. Will NOT fall back to a fake DOVE verdict.`);
          groqQuotaExhausted = true;
          continue;
        }
        console.error(`  ⚠️ AI judgment failed for "${event.source_title}", defaulting to DOVE: ${judgeErr.message}`);
        judgment = { side: SIDE.DOVE, sideLabel: "DOVE", reasoning: "AI judgment failed — conservative fallback" };
      }
      console.log(`  AI verdict: ${judgment.sideLabel} — ${judgment.reasoning}`);

      console.log(`Resolving market ${marketId} as ${judgment.sideLabel}...`);
      let tx;
      try {
        tx = await sendTxWithRetry(getWriteContract, getPostTxReadContract, writeRpcManager, marketId, judgment.side);
      } catch (sendErr) {
        if (sendErr.alreadyResolved) {
          console.log(`  ↪ ${sendErr.message}`);
          const market = await getPostTxReadContract().getMarketFullDetails(marketId);
          const tentative = Number(market.tentativeWinner);
          const sideLabel = tentative === SIDE.HAWK ? "HAWK" : tentative === SIDE.DOVE ? "DOVE" : null;
          if (sideLabel) {
            const { error: repairUpdErr } = await adminSupabase.from("events").update({
              ai_processed: true,
              ai_tentative_winner: sideLabel,
              ai_resolved_at: new Date().toISOString(),
            }).eq("id", event.id);
            if (repairUpdErr) console.log(`  ⚠️ Repair write failed for ${marketId}: ${repairUpdErr.message}`);
            else console.log(`  ✅ Repaired ${marketId} — was already resolved on-chain as ${sideLabel} by an earlier attempt.`);
          }
          await delay(RPC_THROTTLE_MS);
          continue;
        }
        throw sendErr;
      }
      console.log(`  Transaction sent: ${tx.hash}`);
      await callRpcWithBackoff(() => tx.wait(), `tx.wait(${marketId})`, writeRpcManager);
      resolvedCount++;

      const { error: updateErr } = await adminSupabase.from("events").update({
        ai_processed: true,
        ai_tentative_winner: judgment.sideLabel,
        ai_resolved_at: new Date().toISOString(),
      }).eq("id", event.id);

      if (updateErr)
        console.error(`  ⚠️ On-chain resolve succeeded but Supabase update failed for ${marketId}:`, updateErr.message);

      console.log(`  Successfully resolved on-chain: ${marketId}`);

      await delay(RPC_THROTTLE_MS);
    } catch (err) {
      console.error(`❌ Resolution failed for ${marketId}: ${err.message}`);
      await delay(RPC_THROTTLE_MS);
    }
  }

  console.log(`Done. Looked at ${eventsLookedAt} market(s), resolved ${resolvedCount} this run.${groqQuotaExhausted ? " (stopped early: daily AI quota exhausted)" : ""}`);
}

main().catch(console.error);
