// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MIN_RESOLUTION_HOURS = 48;
const GROQ_CONFIDENCE_THRESHOLD = 55;
const MAX_RESOLUTIONS_PER_RUN = 5;
const CONSENSUS_CALLS = 3;

const GROQ_MAX_RETRIES = 4;
const GROQ_BASE_DELAY_MS = 8000; 
const GROQ_BACKOFF_FACTOR = 2;   
const INTER_MARKET_RPC_DELAY_MS = 300;

const TRUSTED_DOMAINS = ["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "aljazeera.com", "theguardian.com", "nytimes.com", "wsj.com", "ft.com", "bloomberg.com"].join(",");
const STOP_WORDS = new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by","from"]);

// নতুন க কাস্টম ভিউ ফাংশন (getMarketFullDetails) সহ ABI
const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractKeywords(title, maxWords = 6) {
  const words = title.replace(/[“”‘’`"'()\[\]{}<>,.!?;:@#$%^&*+=|\\\/~-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  const seen = new Set(); const unique = [];
  for (const w of words) { const key = w.toLowerCase(); if (!seen.has(key)) { seen.add(key); unique.push(w); } }
  return unique.slice(0, maxWords).join(" ");
}

function isArticleRelevant(articleText, eventTitle) {
  const keywords = extractKeywords(eventTitle, 8).toLowerCase().split(/\s+/);
  const haystack = articleText.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw)).length >= 2;
}

async function rpcWithRetry(fn, label = "RPC call", retries = 5) {
  let delay = 3000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { return await fn(); } catch (err) {
      if ((err?.message?.includes("rate limit") || err?.error?.code === -32007) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30000); continue;
      } throw err;
    }
  }
}

async function groqWithRetry(payload, groqKey, label = "") {
  let delay = GROQ_BASE_DELAY_MS;
  for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 + 1000 : delay;
      await new Promise((r) => setTimeout(r, waitMs)); delay *= GROQ_BACKOFF_FACTOR; continue;
    }
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    return await res.json();
  }
  throw new Error(`Groq retries exceeded for ${label}`);
}

// ── News Engine ──────────────────────────────────────────────────────────────
async function fetchLatestNewsContext(event, newsApiKey, guardianApiKey) {
  const eventTs = new Date(event.created_at).getTime();
  const fromISO = new Date(Math.max(eventTs - 24 * 60 * 60 * 1000, Date.now() - 7 * 24 * 60 * 60 * 1000)).toISOString();
  
  if (newsApiKey) {
    try {
      const query = extractKeywords(event.source_title, 6).replace(/[^a-zA-Z0-9 ]/g, " ");
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromISO}&sortBy=publishedAt&pageSize=5&language=en&domains=${encodeURIComponent(TRUSTED_DOMAINS)}&apiKey=${newsApiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const relevant = (data.articles || []).filter(a => isArticleRelevant(`${a.title} ${a.description}`, event.source_title));
        if (relevant.length > 0) {
          return { context: relevant.map((a, i) => `[${i + 1}] ${a.source?.name}: ${a.title}. ${a.description || ""}`).join("\n") };
        }
      }
    } catch (e) { console.warn("NewsAPI failed, structural fallback to Guardian."); }
  }
  return { context: "No relevant recent verified news found." };
}

async function singleGroqVerdict(event, newsContext, threshold, groqKey, callIndex) {
  const prompt = `Impartial judge JSON resolver. Question: Did "${event.source_title}" escalate past severity ${threshold}/100 within 48h? News Context:\n${newsContext}\nRespond ONLY valid JSON: {"outcome": "HAWK" or "DOVE", "confidence": 0-100, "reasoning": "cite news"}`;
  const data = await groqWithRetry({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2 + callIndex * 0.1,
    max_tokens: 150,
  }, groqKey, `[Call ${callIndex + 1}]`);
  
  try { return JSON.parse(data.choices[0].message.content.replace(/```json|```/g, "").trim()); }
  catch { return { outcome: "DOVE", confidence: 0, reasoning: "parse error" }; }
}

// ── Main Engine ──────────────────────────────────────────────────────────────
async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL, GROQ_API_KEY, NEWSAPI_KEY, GUARDIAN_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) throw new Error("Missing Env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - MIN_RESOLUTION_HOURS * 60 * 60 * 1000).toISOString();
  
  const { data: eDue } = await supabase.from("events").select("*").eq("market_created", true).eq("market_resolved", false).not("resolution_at", "is", null).lte("resolution_at", now);
  const { data: iDue } = await supabase.from("events").select("*").eq("market_created", true).eq("market_resolved", false).is("resolution_at", null).lte("created_at", cutoff);
  const dueEvents = [...(eDue || []), ...(iDue || [])];

  console.log(`Found ${dueEvents.length} markets for AI resolution.`);
  let resolvedCount = 0;

  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    const marketId = `mkt_${event.id}`;

    // ওল্ড markets() এর বদলে getMarketFullDetails() কল
    const market = await rpcWithRetry(() => contract.getMarketFullDetails(marketId), `getMarketFullDetails(${marketId})`);
    await new Promise((r) => setTimeout(r, INTER_MARKET_RPC_DELAY_MS));

    // private mapping এ মার্কেট না থাকলে status ০ থাকবে, কিন্তু ইভেন্ট তৈরি হয়ে থাকলে চেইনে রেডি। 
    // যদি অন-চেইনে অলরেডি AI_RESOLVED (2), DISPUTED (3) বা FINALIZED (4) হয়ে থাকে, তবে স্কিপ হবে।
    if (Number(market.status) >= 2) {
      if (Number(market.status) === 4) await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
      continue;
    }

    const threshold = event.market_threshold ?? (event.severity + 5);
    const { context: newsContext } = await fetchLatestNewsContext(event, NEWSAPI_KEY, GUARDIAN_API_KEY);

    const verdicts = [];
    for (let i = 0; i < CONSENSUS_CALLS; i++) {
      verdicts.push(await singleGroqVerdict(event, newsContext, threshold, GROQ_API_KEY, i));
      if (i < CONSENSUS_CALLS - 1) await new Promise((r) => setTimeout(r, 10000));
    }

    const hawkVotes = verdicts.filter(v => v.outcome === "HAWK").length;
    const avgConf = Math.round(verdicts.reduce((s, v) => s + v.confidence, 0) / verdicts.length);
    let finalOutcome = hawkVotes > (CONSENSUS_CALLS / 2) ? "HAWK" : "DOVE";
    if (avgConf < GROQ_CONFIDENCE_THRESHOLD) finalOutcome = "DOVE";

    try {
      // চেইনে AI রায় সাবমিট (declareWinnerByAI)
      const tx = await contract.declareWinnerByAI(marketId, finalOutcome === "HAWK" ? SIDE.HAWK : SIDE.DOVE);
      await tx.wait();
      resolvedCount++;

      await supabase.from("events").update({ 
        ai_processed: true,
        ai_tentative_winner: finalOutcome,
        ai_resolved_at: new Date().toISOString()
      }).eq("id", event.id);

      console.log(`  AI resolved submitted for ${marketId}. Dispute window OPEN.`);
    } catch (err) {
      console.error(`  Execution Failed for ${marketId}: ${err.message}`);
    }
  }
}

main().catch(console.error);
