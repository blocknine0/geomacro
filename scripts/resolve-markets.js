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
// moment the provider returned -32011. A -32011 rejection means the node
// bounced the request *before* it ever reached the mempool, so it is always
// safe to retry with a fresh nonce fetch: there is no risk of double-sending.
async function sendTxWithRetry(contract, marketId, side) {
  let nonceAttempt = 0;
  let rateLimitAttempt = 0;
  const MAX_NONCE_RETRIES = 3;
  while (true) {
    try {
      return await contract.declareWinnerByAI(marketId, side);
    } catch (sendErr) {
      const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
      const isRateLimited = isRpcRateLimitError(sendErr);

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

async function judgeOutcome(groq, event) {
  const summary = (event.summary || "").slice(0, 300);
  const narrative = (event.narrative || "").slice(0, 200);

  const prompt = `You are a geopolitical/macro risk analyst judging the outcome of a prediction market, 48 hours after the original event was reported.

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

Respond STRICTLY in JSON:
{ "side": "HAWK" | "DOVE", "reasoning": "one sentence justification" }`;

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

  const result = JSON.parse(completion.choices[0].message.content);
  const side = result.side === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
  return { side, sideLabel: result.side === "HAWK" ? "HAWK" : "DOVE", reasoning: result.reasoning || "" };
}

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL, ARC_RPC_URL_2, GROQ_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY)
    throw new Error("Missing env.");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — events.ai_processed/market_resolved updates will likely be silently blocked by RLS.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

  // 🛡️ NEW: use a FallbackProvider over two RPC endpoints when a second URL is
  // configured, same pattern already used elsewhere in the frontend (agent-arena.ts).
  // resolve-markets.js was the one script still hammering a single RPC with no
  // fallback — a single-provider rate limit had nowhere else to route to.
  const provider = ARC_RPC_URL_2
    ? new ethers.FallbackProvider([
        { provider: new ethers.JsonRpcProvider(ARC_RPC_URL), priority: 1, weight: 1 },
        { provider: new ethers.JsonRpcProvider(ARC_RPC_URL_2), priority: 2, weight: 1 },
      ], undefined, { quorum: 1 })
    : new ethers.JsonRpcProvider(ARC_RPC_URL);

  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    timeout: 30 * 1000,
    maxRetries: 3,
    fetch: fetch,
  });

  const network = await callRpcWithBackoff(() => provider.getNetwork(), "getNetwork");
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

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

  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    if (eventsLookedAt >= MAX_EVENTS_PER_RUN) {
      console.log(`  ⏹ Reached MAX_EVENTS_PER_RUN (${MAX_EVENTS_PER_RUN}) for this run, stopping early. Remaining backlog will be picked up next run.`);
      break;
    }
    // 🛡️ NEW: once Groq's daily quota is confirmed exhausted, stop trying to
    // judge further events entirely for the rest of this run — every attempt
    // will fail the same way and previously fell back to a fake DOVE that got
    // written on-chain as a real verdict. Leaving ai_processed=false means
    // these events are simply picked up again by the next scheduled run
    // (every 2h), once the quota has had a chance to reset.
    if (groqQuotaExhausted) {
      console.log(`  ⏭ Skipping remaining events this run — Groq daily token quota is exhausted. They'll be retried next run.`);
      break;
    }
    eventsLookedAt++;
    const marketId = `mkt_${event.id}`;

    try {
      let marketStatus = 0;
      try {
        const market = await callRpcWithBackoff(
          () => contract.getMarketFullDetails(marketId),
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
              () => contract.getMarketFullDetails(marketId),
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
        judgment = await judgeOutcome(groq, event);
      } catch (judgeErr) {
        if (judgeErr.isQuotaExhausted) {
          console.error(`  🛑 ${judgeErr.message}`);
          console.error(`  🛑 Halting further Groq calls for this run — will NOT fall back to a fake DOVE verdict.`);
          groqQuotaExhausted = true;
          continue; // event stays ai_processed=false, picked up next run
        }
        console.error(`  ⚠️ AI judgment failed for "${event.source_title}", defaulting to DOVE: ${judgeErr.message}`);
        judgment = { side: SIDE.DOVE, sideLabel: "DOVE", reasoning: "AI judgment failed — conservative fallback" };
      }
      console.log(`  AI verdict: ${judgment.sideLabel} — ${judgment.reasoning}`);

      console.log(`Resolving market ${marketId} as ${judgment.sideLabel}...`);
      const tx = await sendTxWithRetry(contract, marketId, judgment.side);
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

  console.log(`Done. Looked at ${eventsLookedAt} market(s), resolved ${resolvedCount} this run.${groqQuotaExhausted ? " (stopped early: Groq daily quota exhausted)" : ""}`);
}

main().catch(console.error);
