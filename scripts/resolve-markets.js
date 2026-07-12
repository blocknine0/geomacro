// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const MAX_RESOLUTIONS_PER_RUN = Number(process.env.MAX_RESOLUTIONS_PER_RUN || 5);
// NEW: hard cap on total events looked at per run (resolved or not), so a big
// backlog of already-on-chain-resolved-but-unflagged markets can't cause an
// unbounded burst of RPC calls in a single run.
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

// NEW: small fixed pause between every event we look at, regardless of outcome.
// This alone prevents bursts of RPC calls when walking a long backlog.
const RPC_THROTTLE_MS = Number(process.env.RPC_THROTTLE_MS || 350);

// 🛡️ rate limit (429) হলে backoff দিয়ে retry করে — অন্য যেকোনো real error হলে সাথে
// সাথে বাইরে ছেড়ে দেয় (উপরের কলার সেটা handle করবে)। এটা জরুরি কারণ আগে rate limit-ও
// generic catch-এ ধরা পড়ে "AI judgment failed, defaulting to DOVE" হয়ে যেত — মানে
// শুধু rate limit হওয়ার কারণেই একটা বাস্তব মার্কেটের ফলাফল ভুলভাবে DOVE-এ ঠেলে দেওয়া হতো।
async function callGroqWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      if (status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      attempt++;
      console.log(`  ⏳ Rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

// 🛡️ NEW: same idea as callGroqWithBackoff, but for RPC calls against the
// blockchain provider. QuickNode (and most RPC providers) return either a
// JSON-RPC error with code -32007 ("request limit reached") or an HTTP 429
// when you exceed their rate limit. Previously NONE of the ethers.js calls
// in this file were wrapped, so a single rate-limit hit anywhere (even the
// very first provider.getNetwork() call) would crash the whole run.
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

async function judgeOutcome(groq, event) {
  // summary truncate করা হলো — request_too_large এড়াতে
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

  try {
    const completion = await callGroqWithBackoff(
      () => groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile", // compound বাদ — এটা reliable এবং fast
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 150,
      }),
      `judgeOutcome (${event.source_title?.slice(0, 40) ?? "?"})`,
    );

    const result = JSON.parse(completion.choices[0].message.content);
    const side = result.side === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
    return { side, sideLabel: result.side === "HAWK" ? "HAWK" : "DOVE", reasoning: result.reasoning || "" };
  } catch (err) {
    console.error(`  ⚠️ AI judgment failed for "${event.source_title}", defaulting to DOVE:`, err.message);
    return { side: SIDE.DOVE, sideLabel: "DOVE", reasoning: "AI judgment failed — conservative fallback" };
  }
}

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ARC_RPC_URL, GROQ_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY)
    throw new Error("Missing env.");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — events.ai_processed/market_resolved updates will likely be silently blocked by RLS (anon has no UPDATE grant on events).");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  // ⚠️ FIX: events টেবিলে anon role-এর কোনো UPDATE policy নেই (শুধু SELECT + INSERT আছে),
  // তাই anon client দিয়ে .update() কল করলে RLS silently সব রো ব্লক করে দেয় — কোনো error
  // থ্রো না করেই। তাই সব events.update() কল এখন থেকে adminSupabase (service-role) দিয়ে হবে।
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : supabase; // fallback — অন্তত silently সব বন্ধ হয়ে যাওয়ার চেয়ে চেষ্টা করাই ভালো
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    timeout: 30 * 1000,
    maxRetries: 3,
    fetch: fetch,
  });

  // NEW: wrapped in callRpcWithBackoff so a rate-limit hit here (this is exactly
  // where the previous crash happened — the very first RPC call of the run) no
  // longer kills the whole process.
  const network = await callRpcWithBackoff(() => provider.getNetwork(), "getNetwork");
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const now = new Date().toISOString();
  // ⚠️ FIX: আগে এখানে market_resolved = false দিয়ে খোঁজা হতো, কিন্তু এই script
  // কখনো market_resolved সেট করে না (সেটা finalize-markets.js-এর কাজ) — তাই একই
  // backlog বারবার ফিরে আসছিল, প্রতিটা run-এ MAX_EVENTS_PER_RUN কোটা "আগেই AI-verdict
  // পাওয়া" market স্ক্যান করতেই খরচ হয়ে যাচ্ছিল। এই script-এর আসল কাজ AI verdict
  // দেওয়া, তাই ai_processed = false দিয়ে খোঁজাই সঠিক — প্রতিবার সত্যিকারের নতুন/বাকি
  // থাকা market-ই আসবে।
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

  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    // NEW: hard stop on total events examined per run, independent of how many
    // were actually resolved. This is what prevents a big backlog of
    // already-on-chain-resolved-but-unflagged markets from generating an
    // unbounded burst of getMarketFullDetails() calls in a single run.
    if (eventsLookedAt >= MAX_EVENTS_PER_RUN) {
      console.log(`  ⏹ Reached MAX_EVENTS_PER_RUN (${MAX_EVENTS_PER_RUN}) for this run, stopping early. Remaining backlog will be picked up next run.`);
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
        // ⚠️ FIX: আগে এখানে শুধু `continue` করা হতো, যার ফলে যদি কোনো আগের রানে
        // declareWinnerByAI অনচেইনে সফল হলেও Supabase-এর ai_processed আপডেট fail
        // করে থাকে, তাহলে এই event চিরতরে "invisible" হয়ে যেত (finalize-markets.js
        // কখনো এটা ধরতে পারত না, কারণ সেটা ai_processed=true ছাড়া খোঁজেই না)।
        // এখন on-chain-এর tentativeWinner থেকেই retroactively ai_processed ঠিক করে দিচ্ছি।
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
      const judgment = await judgeOutcome(groq, event);
      console.log(`  AI verdict: ${judgment.sideLabel} — ${judgment.reasoning}`);

      console.log(`Resolving market ${marketId} as ${judgment.sideLabel}...`);
      const tx = await callRpcWithBackoff(
        () => contract.declareWinnerByAI(marketId, judgment.side),
        `declareWinnerByAI(${marketId})`,
      );
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

  console.log(`Done. Looked at ${eventsLookedAt} market(s), resolved ${resolvedCount} this run.`);
}

main().catch(console.error);
