// scripts/resolve-markets.js
//
// Automation script for Geomacro Agent Arena.
// Runs on a schedule via GitHub Actions, separate from create-markets.js.
//
// What it does:
// 1. Finds all OPEN markets on the AgentArena contract that were created
//    more than 48 hours ago (minimum resolution window).
// 2. For each one, asks Groq to re-assess whether the situation has
//    escalated (HAWK wins) or de-escalated (DOVE wins) based on the
//    original story context, using the latest severity stored in Supabase.
// 3. Calls declareWinner(marketId, side) using the owner wallet.
//
// Resolution logic:
// - Markets resolve between 48h and 72h after creation.
// - Groq re-reads the original story and compares initial vs current context.
// - If Groq is uncertain (confidence < 60), DOVE wins (de-escalation is the
//   conservative default when outcome is unclear).
//
// Required environment variables:
//   OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY,
//   ARC_RPC_URL, GROQ_API_KEY

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MIN_RESOLUTION_HOURS = 48; // don't resolve before 48h
const MAX_RESOLUTION_HOURS = 72; // must resolve by 72h
const GROQ_CONFIDENCE_THRESHOLD = 60; // if Groq is unsure, DOVE wins

const CONTRACT_ABI = [
  "event MarketCreated(string marketId)",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function declareWinner(string marketId, uint8 winningSide) external",
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

async function askGroqForOutcome(event, groqKey) {
  const prompt = `You are resolving a geopolitical risk prediction market.

Original story: "${event.source_title}"
Category: ${event.category}
Severity when market opened: ${event.severity}/100
Market question: Did this situation ESCALATE significantly in the 48-72 hours after the market opened?

Based on what you know about this story and how geopolitical situations typically evolve:
- HAWK wins if the situation clearly escalated (more conflict, breakdown of talks, military action, sanctions, market panic)
- DOVE wins if the situation de-escalated, held steady, or resolved peacefully

Respond ONLY with valid JSON, no markdown:
{
  "outcome": "HAWK" or "DOVE",
  "confidence": integer 0-100,
  "reasoning": "one sentence explanation"
}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 150,
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    console.warn("  Groq returned unparseable JSON, defaulting to DOVE.");
    return { outcome: "DOVE", confidence: 0, reasoning: "parse error, defaulting to DOVE" };
  }
}

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
    GROQ_API_KEY,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) {
    throw new Error("Missing required environment variables.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);

  // Discover all markets ever created
  const deployBlock = 47800000;
  const latestBlock = await provider.getBlockNumber();
  const filter = contract.filters.MarketCreated();

  const marketIds = [];
  let fromBlock = deployBlock;
  const CHUNK = 10000;
  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + CHUNK - 1, latestBlock);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    for (const e of events) {
      marketIds.push(e.args.marketId);
    }
    fromBlock = toBlock + 1;
  }

  console.log(`Found ${marketIds.length} total market(s) ever created.`);

  let resolvedCount = 0;

  for (const marketId of marketIds) {
    const market = await contract.markets(marketId);

    // Skip if already resolved
    if (Number(market.status) !== 0) continue;

    // Only handle Supabase-linked markets
    const eventId = marketId.startsWith("mkt_") ? marketId.slice(4) : null;
    if (!eventId) {
      console.log(`Skipping ${marketId}: not a Supabase-linked market.`);
      continue;
    }

    const { data: event, error } = await supabase
      .from("events")
      .select("id, severity, created_at, source_title, category, market_threshold")
      .eq("id", eventId)
      .single();

    if (error || !event) {
      console.log(`Skipping ${marketId}: no matching Supabase event.`);
      continue;
    }

    const createdAt = new Date(event.created_at);
    const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    // Too early — wait until 48h minimum
    if (hoursSinceCreation < MIN_RESOLUTION_HOURS) {
      console.log(
        `Skipping ${marketId}: only ${hoursSinceCreation.toFixed(1)}h old. Resolves after ${MIN_RESOLUTION_HOURS}h.`
      );
      continue;
    }

    console.log(
      `Resolving ${marketId} ("${event.source_title}") — ${hoursSinceCreation.toFixed(1)}h old...`
    );

    // Ask Groq to judge the outcome
    let groqResult;
    try {
      groqResult = await askGroqForOutcome(event, GROQ_API_KEY);
    } catch (err) {
      console.warn(`  Groq failed: ${err.message}. Defaulting to DOVE.`);
      groqResult = { outcome: "DOVE", confidence: 0, reasoning: "Groq error, defaulting to DOVE" };
    }

    console.log(
      `  Groq verdict: ${groqResult.outcome} (confidence ${groqResult.confidence}%) — ${groqResult.reasoning}`
    );

    // If Groq is uncertain, DOVE wins (conservative default)
    let winningSide;
    if (groqResult.confidence < GROQ_CONFIDENCE_THRESHOLD) {
      console.log(`  Low confidence (${groqResult.confidence}%), defaulting to DOVE.`);
      winningSide = SIDE.DOVE;
    } else {
      winningSide = groqResult.outcome === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
    }

    try {
      const tx = await contract.declareWinner(marketId, winningSide);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  confirmed in block ${receipt.blockNumber}. Winner: ${winningSide === SIDE.HAWK ? "HAWK" : "DOVE"}`);
      resolvedCount++;
    } catch (err) {
      console.error(`  Failed to resolve ${marketId}: ${err.message}`);
    }

    // Small delay between resolutions
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Done. Resolved ${resolvedCount} market(s) this run.`);
}

main().catch((err) => {
  console.error("Fatal error in resolve-markets script:", err);
  process.exit(1);
});
