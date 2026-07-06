// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const MAX_RESOLUTIONS_PER_RUN = 5;

const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

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
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile", // compound বাদ — এটা reliable এবং fast
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 150,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    const side = result.side === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
    return { side, sideLabel: result.side === "HAWK" ? "HAWK" : "DOVE", reasoning: result.reasoning || "" };
  } catch (err) {
    console.error(`  ⚠️ AI judgment failed for "${event.source_title}", defaulting to DOVE:`, err.message);
    return { side: SIDE.DOVE, sideLabel: "DOVE", reasoning: "AI judgment failed — conservative fallback" };
  }
}

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL, GROQ_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY)
    throw new Error("Missing env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    timeout: 30 * 1000,
    maxRetries: 3,
    fetch: fetch,
  });

  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const now = new Date().toISOString();
  const { data: dueEvents, error: fetchError } = await supabase
    .from("events")
    .select("*")
    .eq("market_created", true)
    .eq("market_resolved", false)
    .lte("resolution_at", now);

  if (fetchError) throw new Error(`Supabase error: ${fetchError.message}`);
  if (!dueEvents || dueEvents.length === 0) return console.log("No due markets for resolution.");

  console.log(`Found ${dueEvents.length} market(s) to process.`);
  let resolvedCount = 0;

  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    const marketId = `mkt_${event.id}`;

    try {
      let marketStatus = 0;
      try {
        const market = await contract.getMarketFullDetails(marketId);
        marketStatus = Number(market.status);
      } catch (decodeErr) {
        console.log(`⚠️ Warning: Could not fetch details for ${marketId}. Skipping.`);
        continue;
      }

      // 2 = AI_RESOLVED, 3 = DISPUTED, 4 = FINALIZED
      // ⚠️ FIX: এখানে market_resolved=true সেট করা হতো না, কারণ এই script কখনো
      // positions sync করে না। শুধু finalize-markets.js-ই (যেখানে syncPositionsForMarket
      // আছে) এই flag-এর একমাত্র মালিক হওয়া উচিত — নাহলে positions sync ছাড়াই
      // event orphaned হয়ে যেতে পারে (আগের বাগের মতোই)।
      if (marketStatus >= 2) {
        continue;
      }

      console.log(`Judging outcome for ${marketId}: "${event.source_title}"...`);
      const judgment = await judgeOutcome(groq, event);
      console.log(`  AI verdict: ${judgment.sideLabel} — ${judgment.reasoning}`);

      console.log(`Resolving market ${marketId} as ${judgment.sideLabel}...`);
      const tx = await contract.declareWinnerByAI(marketId, judgment.side);
      console.log(`  Transaction sent: ${tx.hash}`);
      await tx.wait();
      resolvedCount++;

      const { error: updateErr } = await supabase.from("events").update({
        ai_processed: true,
        ai_tentative_winner: judgment.sideLabel,
        ai_resolved_at: new Date().toISOString(),
      }).eq("id", event.id);

      if (updateErr)
        console.error(`  ⚠️ On-chain resolve succeeded but Supabase update failed for ${marketId}:`, updateErr.message);

      console.log(`  Successfully resolved on-chain: ${marketId}`);

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`❌ Resolution failed for ${marketId}: ${err.message}`);
    }
  }

  console.log(`Done. Resolved ${resolvedCount} market(s) this run.`);
}

main().catch(console.error);
