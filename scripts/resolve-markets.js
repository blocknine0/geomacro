// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const MAX_RESOLUTIONS_PER_RUN = Number(process.env.MAX_RESOLUTIONS_PER_RUN || 5);
// hard cap on total events looked at per run (resolved or not)
const MAX_EVENTS_PER_RUN = Number(process.env.MAX_EVENTS_PER_RUN || 40);

const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

// 🛡️ NEW: canonical Multicall3 deployment address (same across most EVM
// chains, including the one already used in the frontend's agent-arena.ts).
// Lets us batch N getMarketFullDetails reads into a single RPC call instead
// of N separate calls — read traffic was eating into the same rate-limit
// budget that tx sends need, so cutting it down directly helps writes succeed.
const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

const MAX_RATE_LIMIT_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bumped default from 350ms -> 800ms. The old value was firing bursts of
// RPC calls faster than the provider's real per-second cap, which is the
// main reason nearly every send in a run was getting -32011'd.
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 800);

// How many times to retry a tx *send* specifically when it's rejected for
// being rate-limited (not a nonce race). Separate from MAX_RATE_LIMIT_RETRIES
// because a send retry after a rate-limit rejection is safe (never broadcast)
// and worth trying harder for, since we've already paid the Groq cost for
// this judgment and don't want to throw it away.
const MAX_SEND_RATE_LIMIT_RETRIES = Number(process.env.RPC_SEND_MAX_RETRIES || 6);

// 🛡️ NEW: stop starting new market resolutions once this much wall-clock time
// has passed since the run started. The previous run got force-cancelled by
// GitHub Actions mid-transaction (visible as "Error: The operation was
// canceled" in the log) because backoff waits stacked up past the workflow's
// timeout — a mid-await cancellation is unsafe, since we can't tell if the
// in-flight tx was actually broadcast. Default 4 min leaves headroom under a
// typical 5 min job timeout; override via RUN_TIME_BUDGET_MS if your workflow
// timeout is set higher.
const RUN_TIME_BUDGET_MS = Number(process.env.RUN_TIME_BUDGET_MS || 4 * 60 * 1000);
const runStartedAt = Date.now();
const timeBudgetExceeded = () => Date.now() - runStartedAt > RUN_TIME_BUDGET_MS;

// 🛡️ Shared RPC rate-limit detector. FIX: previously only checked code === -32007,
// but Arc Testnet's node actually returns -32011 ("request limit reached") — a
// *different* code with the same meaning. Checking by message text as the primary
// signal (with code as a secondary hint) makes this robust to whichever code the
// node happens to use, instead of hardcoding one specific number.
function isRpcRateLimitError(error) {
  const code = error?.error?.code ?? error?.code;
  const message = String(error?.error?.message ?? error?.message ?? error?.shortMessage ?? "");
  return (
    code === -32007 ||
    code === -32011 ||
    error?.status === 429 ||
    /request limit|rate limit|too many requests/i.test(message)
  );
}

async function callGroqWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const message = String(error?.message ?? error?.error?.message ?? "");
      // 🛡️ NEW: distinguish "tokens per day" (TPD) exhaustion from ordinary
      // per-minute rate limiting. A TPD cap resets on a ~24h rolling window —
      // no amount of exponential backoff within a single script run (which
      // lasts at most a few minutes) will ever clear it. Retrying anyway just
      // burns 1-2 minutes of GitHub Actions time before falling back to a fake
      // DOVE verdict that gets written on-chain as if it were real judgment.
      // We throw a typed error instead so the caller can abort the whole run's
      // remaining Groq calls immediately, rather than mis-resolving markets.
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

async function callRpcWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRpcRateLimitError(error) || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      attempt++;
      console.log(`  ⏳ RPC rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

// 🛡️ FIX (root cause of "resolved 0 this run"): the tx send itself
// (contract.declareWinnerByAI) was previously only retried for nonce races,
// never for RPC rate limits — so every single send just failed outright the
// moment the provider returned -32011.
//
// 🛡️ FIX #2 (root cause of "Invalid status" reverts): -32011 is NOT always a
// safe "rejected before broadcast" signal in this environment. When a
// FallbackProvider with 2+ RPC endpoints is used for sending, ethers forwards
// the signed raw tx to *all* configured providers to maximize propagation —
// so one endpoint can return -32011 to the caller while a different endpoint
// silently accepted and mined the exact same tx. Retrying blindly after that
// then sends a *second* declareWinnerByAI call against an already-resolved
// market, which reverts with "Invalid status". To make retries safe again we
// re-check the market's actual on-chain status before every retry attempt —
// if it's already past the resolvable state, we know an earlier attempt
// silently succeeded, so we stop and let the caller repair the Supabase flag
// instead of sending again.
async function sendTxWithRetry(contract, readContract, marketId, side) {
  let nonceAttempt = 0;
  let rateLimitAttempt = 0;
  const MAX_NONCE_RETRIES = 3;
  while (true) {
    try {
      return await contract.declareWinnerByAI(marketId, side);
    } catch (sendErr) {
      const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
      const isRateLimited = isRpcRateLimitError(sendErr);

      if ((isNonceRace || isRateLimited) && (nonceAttempt < MAX_NONCE_RETRIES || rateLimitAttempt < MAX_SEND_RATE_LIMIT_RETRIES)) {
        // Before waiting and retrying, confirm the market is still actually
        // resolvable. If an earlier attempt was secretly broadcast by a
        // different fallback RPC and already mined, retrying here would just
        // waste the backoff wait and then revert anyway — better to bail out
        // immediately and let the caller's repair path sync Supabase.
        try {
          const market = await readContract.getMarketFullDetails(marketId);
          if (Number(market.status) >= 2) {
            const alreadyResolvedErr = new Error(`Market ${marketId} was already resolved on-chain by an earlier (phantom) broadcast — skipping duplicate send.`);
            alreadyResolvedErr.alreadyResolved = true;
            throw alreadyResolvedErr;
          }
        } catch (checkErr) {
          if (checkErr.alreadyResolved) throw checkErr;
          // status-check itself failed (probably also rate limited) — fall through to normal retry logic below
        }
      }

      if (isNonceRace && nonceAttempt < MAX_NONCE_RETRIES) {
        nonceAttempt++;
        const wait = 1500 * nonceAttempt;
        console.log(`  ⏳ Nonce/mempool race on ${marketId} (${sendErr.code}), attempt ${nonceAttempt}/${MAX_NONCE_RETRIES}. Waiting ${wait}ms and retrying with a fresh nonce...`);
        await delay(wait);
        continue;
      }

      if (isRateLimited && rateLimitAttempt < MAX_SEND_RATE_LIMIT_RETRIES) {
        rateLimitAttempt++;
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** rateLimitAttempt, MAX_BACKOFF_MS);
        const jitter = Math.random() * 500;
        console.log(`  ⏳ RPC rate limited sending declareWinnerByAI(${marketId}), attempt ${rateLimitAttempt}/${MAX_SEND_RATE_LIMIT_RETRIES}. Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
        await delay(backoff + jitter);
        continue;
      }

      throw sendErr;
    }
  }
}

// 🛡️ NEW: batch getMarketFullDetails for many markets into a single RPC call
// via Multicall3.aggregate3, instead of one call per market. allowFailure:true
// means a market whose call reverts (e.g. bad/legacy marketId) doesn't break
// the whole batch — it just comes back as success:false and we treat it the
// same as "couldn't fetch details, skip this one" further down.
//
// Falls back to null (caller should fall back to per-market calls) if the
// multicall itself fails outright — most likely because Multicall3 isn't
// actually deployed at MULTICALL3_ADDRESS on this chain. We only find that
// out by trying, since an eth_call to an address with no code doesn't throw
// a distinct error from a genuine RPC failure.
async function batchGetMarketDetails(readProvider, contractInterface, marketIds) {
  const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
  const calls = marketIds.map((marketId) => ({
    target: CONTRACT_ADDRESS,
    allowFailure: true,
    callData: contractInterface.encodeFunctionData("getMarketFullDetails", [marketId]),
  }));

  const results = await callRpcWithBackoff(
    () => multicall.aggregate3.staticCall(calls),
    `multicall.aggregate3 (${marketIds.length} markets)`,
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
  // 🛡️ Cerebras doesn't guarantee response_format:json_object the way Groq does,
  // so strip any accidental markdown fences before parsing instead of assuming
  // a clean JSON string.
  const cleaned = rawContent.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned);
  const side = result.side === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
  return { side, sideLabel: result.side === "HAWK" ? "HAWK" : "DOVE", reasoning: result.reasoning || "" };
}

// 🛡️ NEW: second free-tier provider used only when Groq's daily quota (TPD/RPD)
// is exhausted. Cerebras has a completely separate 1M-tokens/day free quota, so
// this effectively doubles the daily judging budget at zero cost, instead of the
// run just giving up on remaining events until Groq resets.
async function callCerebrasJudge(cerebrasApiKey, event) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cerebrasApiKey}`,
    },
    body: JSON.stringify({
      model: "llama3.1-8b", // Cerebras' free-tier model name (not "llama-3.1-8b-instant" like Groq)
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
        model: "llama-3.1-8b-instant", // switched from 70b-versatile: free tier gives this model ~14,400 req/day vs 1,000 RPD / 100K TPD on 70b — this task is simple structured classification, doesn't need the bigger model
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 150,
      }),
      `judgeOutcome (${event.source_title?.slice(0, 40) ?? "?"})`,
    );
    return parseJudgeResult(completion.choices[0].message.content);
  } catch (groqErr) {
    // Only fall through to Cerebras for genuine daily-quota exhaustion — any
    // other error (bad prompt, malformed JSON, etc.) should surface normally
    // rather than silently trying a second provider.
    if (!groqErr.isQuotaExhausted || !cerebrasApiKey) throw groqErr;
    console.log(`  ↪ Groq daily quota exhausted — falling back to Cerebras (separate free quota) for this judgment...`);
    return await callCerebrasJudge(cerebrasApiKey, event);
  }
}

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL, ARC_RPC_URL_2, GROQ_API_KEY, CEREBRAS_API_KEY } = process.env;
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

  // 🛡️ FIX: ethers' FallbackProvider forwards *sendTransaction* calls to all
  // configured providers to maximize propagation — that's fine for read calls
  // but dangerous for state-changing calls, because it can cause the exact
  // same signed tx to be silently accepted/mined by one endpoint while another
  // endpoint returns -32011 to us, triggering a duplicate retry that reverts
  // with "Invalid status". So: reads get the resilience of a FallbackProvider
  // when a second RPC URL is configured, but the wallet that actually signs
  // and sends transactions always uses a single, primary provider only.
  const readProvider = ARC_RPC_URL_2
    ? new ethers.FallbackProvider([
        { provider: new ethers.JsonRpcProvider(ARC_RPC_URL), priority: 1, weight: 1 },
        { provider: new ethers.JsonRpcProvider(ARC_RPC_URL_2), priority: 2, weight: 1 },
      ], undefined, { quorum: 1 })
    : new ethers.JsonRpcProvider(ARC_RPC_URL);
  const writeProvider = new ethers.JsonRpcProvider(ARC_RPC_URL);

  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    timeout: 30 * 1000,
    maxRetries: 3,
    fetch: fetch,
  });

  const network = await callRpcWithBackoff(() => readProvider.getNetwork(), "getNetwork");
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, writeProvider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  // read-only calls (getMarketFullDetails etc.) go through the resilient reader
  const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);

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

  // 🛡️ NEW: prefetch status for the whole batch in one Multicall3 call instead
  // of one getMarketFullDetails RPC call per market in the loop below. This is
  // the single biggest lever on total RPC volume per run, since read calls
  // were competing with tx sends for the same rate-limit budget.
  const batchMarketIds = dueEvents.slice(0, MAX_EVENTS_PER_RUN).map((e) => `mkt_${e.id}`);
  let prefetchedDetails = new Map();
  try {
    prefetchedDetails = await batchGetMarketDetails(readProvider, contract.interface, batchMarketIds);
    console.log(`  📦 Batched status check for ${batchMarketIds.length} markets via Multicall3 (1 RPC call instead of ${batchMarketIds.length}).`);
  } catch (multicallErr) {
    console.log(`  ⚠️ Multicall3 batch prefetch failed (${multicallErr.message}) — falling back to one getMarketFullDetails call per market. If this keeps happening, Multicall3 is likely not deployed at ${MULTICALL3_ADDRESS} on this chain — set MULTICALL3_ADDRESS if it's deployed elsewhere, or ignore if this chain doesn't have it.`);
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
    // 🛡️ NEW: once Groq's daily quota is confirmed exhausted, stop trying to
    // judge further events entirely for the rest of this run — every attempt
    // will fail the same way and previously fell back to a fake DOVE that got
    // written on-chain as a real verdict. Leaving ai_processed=false means
    // these events are simply picked up again by the next scheduled run
    // (every 2h), once the quota has had a chance to reset.
    if (groqQuotaExhausted) {
      console.log(`  ⏭ Skipping remaining events this run — daily AI quota is exhausted. They'll be retried next run.`);
      break;
    }
    eventsLookedAt++;
    const marketId = `mkt_${event.id}`;

    try {
      let marketStatus = 0;
      try {
        // Use the prefetched multicall result if we have one for this market;
        // otherwise (multicall failed, or this market wasn't in the prefetch
        // batch) fall back to the original single-market RPC call.
        const cached = prefetchedDetails.get(marketId);
        const market = cached !== undefined && cached !== null
          ? cached
          : await callRpcWithBackoff(
              () => readContract.getMarketFullDetails(marketId),
              `getMarketFullDetails(${marketId})`,
            );
        marketStatus = Number(market.status);
      } catch (decodeErr) {
        console.log(`⚠️ Warning: Could not fetch details for ${marketId}. Skipping. Reason: ${decodeErr.message}`);
        await delay(RPC_THROTTLE_MS);
        continue;
      }

      // 2 = AI_RESOLVED, 3 = DISPUTED, 4 = FINALIZED
      if (marketStatus >= 2) {
        if (!event.ai_processed) {
          try {
            const market = await callRpcWithBackoff(
              () => readContract.getMarketFullDetails(marketId),
              `getMarketFullDetails-repair(${marketId})`,
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
          continue; // event stays ai_processed=false, picked up next run
        }
        console.error(`  ⚠️ AI judgment failed for "${event.source_title}", defaulting to DOVE: ${judgeErr.message}`);
        judgment = { side: SIDE.DOVE, sideLabel: "DOVE", reasoning: "AI judgment failed — conservative fallback" };
      }
      console.log(`  AI verdict: ${judgment.sideLabel} — ${judgment.reasoning}`);

      console.log(`Resolving market ${marketId} as ${judgment.sideLabel}...`);
      let tx;
      try {
        tx = await sendTxWithRetry(contract, readContract, marketId, judgment.side);
      } catch (sendErr) {
        if (sendErr.alreadyResolved) {
          // An earlier attempt (this run or a prior one) was silently broadcast
          // and mined via a different fallback RPC before we ever saw success.
          // Repair the Supabase flag from the real on-chain outcome instead of
          // treating this as a failure or re-attempting the send.
          console.log(`  ↪ ${sendErr.message}`);
          const market = await readContract.getMarketFullDetails(marketId);
          const tentative = Number(market.tentativeWinner);
          const sideLabel = tentative === SIDE.HAWK ? "HAWK" : tentative === SIDE.DOVE ? "DOVE" : null;
          if (sideLabel) {
            const { error: repairUpdErr } = await adminSupabase.from("events").update({
              ai_processed: true,
              ai_tentative_winner: sideLabel,
              ai_resolved_at: new Date().toISOString(),
            }).eq("id", event.id);
            if (repairUpdErr) console.log(`  ⚠️ Repair write failed for ${marketId}: ${repairUpdErr.message}`);
            else console.log(`  ✅ Repaired ${marketId} — was already resolved on-chain as ${sideLabel} by an earlier phantom broadcast.`);
          }
          await delay(RPC_THROTTLE_MS);
          continue;
        }
        throw sendErr;
      }
      console.log(`  Transaction sent: ${tx.hash}`);
      await callRpcWithBackoff(() => tx.wait(), `tx.wait(${marketId})`);
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
