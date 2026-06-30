// scripts/resolve-markets.js
//
// Upgraded automation resolver script for Geomacro Agent Arena (DAO-enabled).
//
// Resolution logic (Option A + C):
// 1. Fetch latest news about the story from NewsAPI/Guardian
// 2. Pass those articles to Groq as context
// 3. Run 3 independent Groq calls with the same context (consensus)
// 4. 2/3 majority wins. If no consensus → DOVE (conservative default)
// 5. Exponential backoff on rate limit errors
// 6. Submits tentative winner to contract via declareWinnerByAI() -> Opens 24h Dispute Window

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MIN_RESOLUTION_HOURS = 48;
const GROQ_CONFIDENCE_THRESHOLD = 55;
const MAX_RESOLUTIONS_PER_RUN = 5;
const CONSENSUS_CALLS = 3;

// Rate limit / retry config
const GROQ_MAX_RETRIES = 4;
const GROQ_BASE_DELAY_MS = 8000; 
const GROQ_BACKOFF_FACTOR = 2;   

const INTER_MARKET_RPC_DELAY_MS = 300;

const TRUSTED_DOMAINS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
  "aljazeera.com", "theguardian.com", "nytimes.com",
  "wsj.com", "ft.com", "bloomberg.com", "economist.com",
  "foreignpolicy.com", "politico.com", "axios.com",
].join(",");

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","as","is","was","are","were","be","been","being","have",
  "has","had","do","does","did","will","would","could","should","may",
  "might","shall","can","its","it","this","that","these","those","after",
  "amid","new","says","say","over","under","into","out","up","down",
]);

const CONTRACT_ABI = [
  "event MarketCreated(string marketId)",
  // নতুন markets() ভিউ সিগনেচার (সলিডিটি স্ট্রাক্ট অনুযায়ী আপডেট করা হয়েছে)
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint8 tentativeWinner, uint256 hawkTotal, uint256 doveTotal, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer, uint256 hawkVotes, uint256 doveVotes, bool exists)",
  // নতুন ফাংশন সিগনেচার
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

// ── Keyword extraction ────────────────────────────────────────────────────────
function extractKeywords(title, maxWords = 6) {
  const words = title
    .replace(/[“”‘’`"'()\[\]{}<>,.!?;:@#$%^&*+=|\\\/~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    const key = w.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(w); }
  }
  return unique.slice(0, maxWords).join(" ");
}

// ── Relevance check ───────────────────────────────────────────────────────────
function isArticleRelevant(articleText, eventTitle, minMatches = 2) {
  const keywords = extractKeywords(eventTitle, 8).toLowerCase().split(/\s+/);
  const haystack = articleText.toLowerCase();
  const matches = keywords.filter((kw) => haystack.includes(kw)).length;
  return matches >= minMatches;
}

// ── RPC helpers with retry ────────────────────────────────────────────────────
function isRpcRateLimit(err) {
  return (
    err?.error?.code === -32007 ||
    (err?.code === "UNKNOWN_ERROR" && err?.error?.code === -32007) ||
    err?.message?.includes("rate limit") ||
    err?.message?.includes("100/second")
  );
}

async function rpcWithRetry(fn, label = "RPC call", retries = 5) {
  let delay = 3000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRpcRateLimit(err) && attempt < retries) {
        console.warn(`  ${label}: RPC rate limit hit. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30000);
        continue;
      }
      throw err;
    }
  }
}

async function groqWithRetry(payload, groqKey, label = "") {
  let delay = GROQ_BASE_DELAY_MS;
  for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 + 1000 : delay;
      console.warn(`  ${label} Rate limited (429). Waiting ${(waitMs / 1000).toFixed(0)}s before retry ${attempt}/${GROQ_MAX_RETRIES}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      delay *= GROQ_BACKOFF_FACTOR;
      continue;
    }

    if (res.status >= 500) {
      console.warn(`  ${label} Groq server error ${res.status}. Waiting ${(delay / 1000).toFixed(0)}s before retry ${attempt}/${GROQ_MAX_RETRIES}...`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= GROQ_BACKOFF_FACTOR;
      continue;
    }

    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    return await res.json();
  }
  throw new Error(`Groq: max retries (${GROQ_MAX_RETRIES}) exceeded for ${label}`);
}

// ── NewsAPI fetch ─────────────────────────────────────────────────────────────
async function fetchFromNewsAPI(event, newsApiKey, from) {
  const rawQuery = extractKeywords(event.source_title, 6);
  const query = rawQuery.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  console.log(`  NewsAPI query: "${query}"`);

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&pageSize=10&language=en&domains=${encodeURIComponent(TRUSTED_DOMAINS)}&apiKey=${newsApiKey}`;
  const res = await fetch(url);

  if (res.status === 429) {
    console.warn(`  NewsAPI 429 (rate limit).`);
    return null;
  }
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);

  const data = await res.json();
  let articles = (data.articles || []);

  const relevant = articles.filter((a) => {
    const text = `${a.title || ""} ${a.description || ""}`;
    return isArticleRelevant(text, event.source_title);
  });

  if (relevant.length === 0 && articles.length === 0) {
    console.warn(`  NewsAPI: no results on trusted domains, retrying without domain filter...`);
    const url2 = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${newsApiKey}`;
    const res2 = await fetch(url2);
    if (res2.ok) {
      const data2 = await res2.json();
      const all2 = (data2.articles || []);
      const rel2 = all2.filter((a) => {
        const text = `${a.title || ""} ${a.description || ""}`;
        return isArticleRelevant(text, event.source_title);
      });
      if (rel2.length > 0) return rel2.slice(0, 5);

      const shortQuery = query.split(" ").slice(0, 3).join(" ");
      if (shortQuery !== query) {
        console.warn(`  NewsAPI: retrying with shorter query "${shortQuery}" (no date filter)...`);
        const url3 = `https://newsapi.org/v2/everything?q=${encodeURIComponent(shortQuery)}&sortBy=relevancy&pageSize=10&language=en&apiKey=${newsApiKey}`;
        const res3 = await fetch(url3);
        if (res3.ok) {
          const data3 = await res3.json();
          const all3 = (data3.articles || []);
          const rel3 = all3.filter((a) => {
            const text = `${a.title || ""} ${a.description || ""}`;
            return isArticleRelevant(text, event.source_title, 1);
          });
          if (rel3.length > 0) return rel3.slice(0, 5);
        }
      }
    }
    return null;
  }

  if (relevant.length === 0) {
    console.warn(`  NewsAPI: ${articles.length} articles returned but none are relevant to this event.`);
    return null;
  }
  return relevant.slice(0, 5);
}

// ── Guardian API fetch ────────────────────────────────────────────────────────
async function fetchFromGuardian(event, guardianApiKey, fromDate) {
  const rawQuery = extractKeywords(event.source_title, 6);
  const query = rawQuery.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  console.log(`  Guardian query: "${query}"`);

  const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&from-date=${fromDate}&order-by=newest&page-size=10&show-fields=trailText&api-key=${guardianApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Guardian API error: ${res.status}`);

  const data = await res.json();
  const articles = (data.response?.results || []);

  const relevant = articles.filter((a) => {
    const text = `${a.webTitle || ""} ${a.fields?.trailText || ""}`;
    return isArticleRelevant(text, event.source_title);
  });

  if (relevant.length === 0) {
    const shortQuery = query.split(" ").slice(0, 3).join(" ");
    if (shortQuery !== query && articles.length > 0) {
      const loose = articles.filter((a) => {
        const text = `${a.webTitle || ""} ${a.fields?.trailText || ""}`;
        return isArticleRelevant(text, event.source_title, 1);
      });
      if (loose.length > 0) return loose.slice(0, 5);
    }
    return null;
  }
  return relevant.slice(0, 5);
}

// ── Combined news context fetch ───────────────────────────────────────────────
async function fetchLatestNewsContext(event, newsApiKey, guardianApiKey) {
  const eventTs = new Date(event.created_at).getTime();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const fromTs = Math.max(eventTs - 24 * 60 * 60 * 1000, sevenDaysAgo);
  const fromISO = new Date(fromTs).toISOString();
  const fromDate = fromISO.split("T")[0];

  if (newsApiKey) {
    try {
      const articles = await fetchFromNewsAPI(event, newsApiKey, fromISO);
      if (articles && articles.length > 0) {
        const sources = articles.map((a) => a.source?.name || "Unknown");
        const context = articles
          .map((a, i) => `[${i + 1}] ${a.source?.name}: ${a.title}. ${a.description || ""}`)
          .join("\n");
        return { context, sources };
      }
    } catch (err) {
      console.warn(`  NewsAPI failed: ${err.message}. Trying Guardian API...`);
    }
  }

  if (guardianApiKey) {
    try {
      const articles = await fetchFromGuardian(event, guardianApiKey, fromDate);
      if (articles && articles.length > 0) {
        const sources = articles.map(() => "The Guardian");
        const context = articles
          .map((a, i) => `[${i + 1}] The Guardian: ${a.webTitle}. ${a.fields?.trailText || ""}`)
          .join("\n");
        return { context, sources };
      }
    } catch (err) {
      console.warn(`  Guardian API failed: ${err.message}.`);
    }
  }

  return { context: "No relevant recent news found for this story.", sources: [] };
}

// ── Single Groq verdict with retry ────────────────────────────────────────────
async function singleGroqVerdict(event, newsContext, threshold, groqKey, callIndex) {
  const hasRealNews = !newsContext.startsWith("No relevant");
  const prompt = `You are an impartial judge settling a prediction market.
${hasRealNews ? "Base your verdict ONLY on the news articles provided below." : "Use your own knowledge, apply DOVE bias."}
Market question: Did "${event.source_title}" escalate past severity ${threshold}/100 within 48 hours?
Category: ${event.category}
Respond ONLY with valid JSON:
{
  "outcome": "HAWK" or "DOVE",
  "confidence": integer 0-100,
  "reasoning": "one sentence"
}`;

  const data = await groqWithRetry(
    {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2 + callIndex * 0.1,
      max_tokens: 150,
    },
    groqKey,
    `[Call ${callIndex + 1}/${CONSENSUS_CALLS}]`
  );

  const text = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return { outcome: "DOVE", confidence: 0, reasoning: "parse error" };
  }
}

// ── 3-call consensus ──────────────────────────────────────────────────────────
async function getConsensusVerdict(event, newsContext, threshold, groqKey) {
  const verdicts = [];
  for (let i = 0; i < CONSENSUS_CALLS; i++) {
    try {
      const verdict = await singleGroqVerdict(event, newsContext, threshold, groqKey, i);
      verdicts.push(verdict);
      console.log(`  Call ${i + 1}: ${verdict.outcome} (${verdict.confidence}%)`);
    } catch (err) {
      verdicts.push({ outcome: "DOVE", confidence: 0, reasoning: err.message });
    }
    if (i < CONSENSUS_CALLS - 1) await new Promise((r) => setTimeout(r, 10000));
  }

  const hawkVotes = verdicts.filter((v) => v.outcome === "HAWK").length;
  const doveVotes = verdicts.filter((v) => v.outcome === "DOVE").length;
  const avgConfidence = Math.round(verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length);

  let finalOutcome = hawkVotes > doveVotes ? "HAWK" : "DOVE";
  if (avgConfidence < GROQ_CONFIDENCE_THRESHOLD) finalOutcome = "DOVE";

  return { outcome: finalOutcome, hawkVotes, doveVotes, avgConfidence };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
    GROQ_API_KEY,
    NEWSAPI_KEY,
    GUARDIAN_API_KEY,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) {
    throw new Error("Missing required environment variables.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);
  const now = new Date().toISOString();

  // Case A & B: Fetch due events from Supabase
  const { data: explicitDue } = await supabase.from("events").select("*").eq("market_created", true).eq("market_resolved", false).not("resolution_at", "is", null).lte("resolution_at", now);
  const cutoff = new Date(Date.now() - MIN_RESOLUTION_HOURS * 60 * 60 * 1000).toISOString();
  const { data: implicitDue } = await supabase.from("events").select("*").eq("market_created", true).eq("market_resolved", false).is("resolution_at", null).lte("created_at", cutoff);

  const dueEvents = [...(explicitDue || []), ...(implicitDue || [])];
  console.log(`Found ${dueEvents.length} event(s) past resolution time.`);
  if (dueEvents.length === 0) return;

  let resolvedCount = 0;
  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;

    const marketId = `mkt_${event.id}`;
    const market = await rpcWithRetry(() => contract.markets(marketId), `markets(${marketId})`);
    await new Promise((r) => setTimeout(r, INTER_MARKET_RPC_DELAY_MS));

    if (!market.exists) continue;
    
    // প্রধান সিকিউরিটি চেঞ্জ: যদি অন-চেইনে স্ট্যাটাস অলরেডি AI_RESOLVED (2) বা তার বেশি হয়, তবে স্কিপ হবে
    if (Number(market.status) >= 2) {
      if (Number(market.status) === 4) { // 4 = FINALIZED
        await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
      }
      continue;
    }

    const threshold = event.market_threshold ?? (event.severity + 5);
    console.log(`\nProcessing AI Resolution for ${marketId}`);

    const { context: newsContext } = (NEWSAPI_KEY || GUARDIAN_API_KEY)
      ? await fetchLatestNewsContext(event, NEWSAPI_KEY, GUARDIAN_API_KEY)
      : { context: "No news API configured.", sources: [] };

    const consensus = await getConsensusVerdict(event, newsContext, threshold, GROQ_API_KEY);
    const winningSide = consensus.outcome === "HAWK" ? SIDE.HAWK : SIDE.DOVE;

    try {
      // পরিবর্তন: declareWinner বদলে এখন declareWinnerByAI কল হবে
      const tx = await contract.declareWinnerByAI(marketId, winningSide);
      console.log(`  tx sent: ${tx.hash}`);
      await tx.wait();
      resolvedCount++;

      // পরিবর্তন: এখানে market_resolved: true করা যাবে না, কারণ আপিল উইন্ডো ওপেন হয়েছে।
      // আমরা ডাটাবেজে এআই-এর প্রাথমিক স্টেট এবং রেজাল্ট ট্র্যাকিং আপডেট সেভ রাখব।
      await supabase.from("events").update({ 
        ai_processed: true,
        ai_tentative_winner: consensus.outcome,
        ai_resolved_at: new Date().toISOString()
      }).eq("id", event.id);
      
      console.log(`  AI resolution submitted. Dispute window is now OPEN for 24h.`);
    } catch (err) {
      console.error(`  Failed to push AI resolution for ${marketId}: ${err.message}`);
    }

    if (resolvedCount < MAX_RESOLUTIONS_PER_RUN) await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`\nDone. Processed ${resolvedCount} AI resolution(s).`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
