import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 30 * 1000,
  maxRetries: 0,
  fetch: fetch
});
if (!process.env.CEREBRAS_API_KEY) {
  console.warn("⚠️ CEREBRAS_API_KEY missing — no fallback if Groq's daily quota runs out mid-run.");
}

const BATCH_SIZE = Number(process.env.GROQ_BATCH_SIZE || 5);
// ⚠️ FIX: query count per category went up a lot (geopolitics ~20 -> ~47),
// so more candidate articles -> more Groq batches per run. Bumped the
// default delay between batches so we don't hammer Groq back-to-back.
const BATCH_DELAY_MS = Number(process.env.GROQ_BATCH_DELAY_MS || 3000);
const MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;

// ⚠️ FIX: with more queries per category, Guardian/NewsAPI were being hit
// back-to-back with zero delay in the query loop below. Neither had any
// retry/backoff (only Groq did) — a single 429 from either just skipped
// straight to the other API or returned []  instead of waiting and retrying.
// Added a small delay between queries + a shared backoff wrapper so both
// news APIs behave like Groq's callGroqWithBackoff on rate limits.
const QUERY_DELAY_MS = Number(process.env.NEWS_QUERY_DELAY_MS || 800);
const NEWS_MAX_RETRIES = Number(process.env.NEWS_MAX_RETRIES || 3);

// ⚠️ FIX: this Groq API key is shared with other services (rate limits are
// enforced org/key-wide by Groq, not per-script — see docs). This script
// previously assumed it owned the whole quota. Two safety nets added:
// 1) a hard cap on how many Groq requests THIS run will make, so it always
//    leaves headroom for whatever else is using the key.
// 2) proactive throttling based on the x-ratelimit-remaining-* headers Groq
//    returns on every response — if remaining quota (from ANY consumer of
//    this key, not just us) gets low, we pause before hitting a hard 429.
const GROQ_MAX_REQUESTS_PER_RUN = Number(process.env.GROQ_MAX_REQUESTS_PER_RUN || 40);
const GROQ_MIN_REMAINING_REQUESTS = Number(process.env.GROQ_MIN_REMAINING_REQUESTS || 3);
const GROQ_MIN_REMAINING_TOKENS = Number(process.env.GROQ_MIN_REMAINING_TOKENS || 500);
let groqRequestsThisRun = 0;

const GUARDIAN_SECTIONS = {
  geopolitics: "world|politics",
  macro: "business|world|money",
  rare_earth: "business|environment|world|technology",
  crypto: "technology|business",
};

const CATEGORIES = [
  {
    name: "geopolitics",
    queries: [
      "global war military conflict ceasefire",
      "NATO Russia Ukraine war peace talks",
      "China Taiwan strait military tension invasion risk",
      "Middle East Israel Iran Gaza Lebanon Houthi conflict",
      "nuclear weapons diplomacy multilateral treaty UN Security Council",
      "BRICS global south bilateral security pact",
      "South Asia India Pakistan Kashmir border conflict",
      "North Korea South Korea missile test sanctions",
      "African Union Sahel coup Sudan Ethiopia Congo conflict",
      "Latin America Venezuela Colombia drug cartel political crisis",
      "Southeast Asia South China Sea territorial dispute Philippines Vietnam",
      "Central Asia Caucasus Armenia Azerbaijan Kazakhstan geopolitics",
      "Balkans Serbia Kosovo EU accession tension",
      "Arctic sovereignty military buildup Russia US Canada",
      "African coastal piracy Red Sea Suez shipping security",
      "global terrorism extremist group insurgency attack",
      "refugee migration crisis border policy Europe Africa Asia",
      "cyberwarfare state-sponsored hacking critical infrastructure attack",
      "Strait of Hormuz Malacca Bab-el-Mandeb naval blockade shipping",
      "Latin America Guyana Venezuela Essequibo border tension",
      "Central Asia Kazakhstan Uzbekistan Russia geopolitics water conflict",
      "Arctic Northern Sea Route Russia China NATO militarization",
      "Pacific Islands Solomon Islands US China naval security pact",
      "Armenia Azerbaijan Nagorno-Karabakh Zangezur corridor conflict",
      "Baltic Sea underwater pipeline cable sabotage critical infrastructure",
      "Global military coup junta democratic breakdown UN sanction",
      "BRICS expansion de-dollarization bilateral local currency trade",
      "space race military satellite anti-satellite weapon test",
      "United Nations Security Council veto resolution crisis",

      // Middle East — new/escalating war situations
      "Israel Iran war strikes nuclear military",
      "US Iran military conflict Middle East escalation",
      "Israel Lebanon Hezbollah ground offensive",
      "Israel Gaza ceasefire violation humanitarian crisis",
      "Iraq Syria US troops militia attack",
      "Yemen Houthi Red Sea shipping strike",
      "Iran proxy militia regional war spillover",

      // South Asia
      "India Pakistan war Kashmir military escalation",
      "India Pakistan ceasefire border conflict",

      // Africa
      "Sudan civil war RSF SAF famine displacement",
      "DRC Congo M23 offensive Goma conflict",
      "Mali Sahel Africa Corps mercenary violence",
      "Somalia Al-Shabaab insurgency counterterrorism",
      "Ethiopia Tigray internal conflict instability",

      // Asia
      "Myanmar civil war junta resistance fighting",
      "Afghanistan Taliban instability insurgency",

      // Europe
      "Russia Ukraine war frontline offensive",
      "Ukraine drone strikes Russia territory",
      "Russia nuclear doctrine escalation warning",

      // Americas
      "Mexico cartel violence military conflict",
      "Colombia ELN guerrilla conflict violence",
      "Venezuela political crisis military tension",

      // Global tracking / catch-all
      "civil war insurgency casualties displacement global",
      "ceasefire peace negotiation collapse conflict",
      "war crimes humanitarian law violation conflict zone",
    ],
  },
  {
    name: "macro",
    queries: [
      "Federal Reserve ECB BOJ interest rates inflation central bank",
      "global recession GDP stagflation IMF World Bank forecast",
      "sovereign debt default restructuring IMF bailout emerging markets",
      "currency war dollar dominance yuan yen currency devaluation",
      "supply chain shock shipping disruption energy crisis oil prices",
      "global banking crisis contagion systemic risk credit crunch",
      "India RBI inflation growth economic reform",
      "China property crisis local government debt stimulus",
      "Japan yen intervention Bank of Japan policy shift",
      "eurozone Germany France Italy fiscal crisis recession",
      "UK Bank of England inflation gilt market crisis",
      "Brazil Argentina Mexico Latin America inflation currency crisis",
      "Nigeria South Africa Egypt African economy debt crisis",
      "Gulf states Saudi Arabia UAE oil revenue diversification economy",
      "Southeast Asia ASEAN economic growth trade currency",
      "Turkey lira inflation central bank crisis",
      "global trade war tariffs WTO dispute",
      "Central Bank liquidity swap lines Federal Reserve PBOC",
      "Sovereign debt restructuring Paris Club IMF conditionality emerging markets",
      "Baltic Dry Index container shipping freight rates supply chain bottleneck",
      "Global shadow banking private credit systemic risk contagion",
      "Global food security export bans wheat rice fertilizer trade protectionism",
      "Commercial real estate debt default regional bank crisis",
      "Gold reserves central bank de-dollarization treasury selling",
      "OPEC oil production cut price war energy market",
      "global food price crisis agriculture commodity shortage",
      "unemployment labor market wage growth major economies",
    ],
  },
  {
    name: "rare_earth",
    queries: [
      "semiconductor ASML TSMC chips export controls",
      "lithium cobalt nickel critical minerals mining policy",
      "rare earth refining monopoly processing export ban China",
      "global tech war technology decoupling supply chain localization",
      "US EU Africa South America critical raw materials trade agreement",
      "Democratic Republic Congo cobalt mining conflict minerals",
      "Australia lithium rare earth mining export policy",
      "Chile Argentina Bolivia lithium triangle mining deal",
      "Indonesia nickel export ban processing investment",
      "Africa mineral resource nationalism mining nationalization",
      "India critical minerals strategy domestic production",
      "Japan South Korea rare earth stockpile diversification",
      "Russia rare earth uranium mineral export sanctions",
      "Gallium Germanium export controls China Western supply chain",
      "Antimony tungsten critical defense mineral supply restriction",
      "Deep sea polymetallic nodules mining ISA regulation Clarion-Clipperton",
      "Nickel processing HPAL smelter environmental ban Indonesia New Caledonia",
      "Graphite synthetic natural anode material EV battery export restrictions",
      "Platinum Group Metals PGM South Africa Russia supply shock",
      "Rare earth permanent magnets NdFeB defense aerospace supply risk",
      "Resource nationalism lithium windfall tax Latin America Africa",
      "US CHIPS Act semiconductor manufacturing subsidy",
      "European Union critical raw materials act strategy",
      "solar panel battery supply chain graphite manganese",
      "deep sea mining international regulation critical minerals",
    ],
  },
  {
    name: "crypto",
    queries: [
      "global crypto regulation SEC MiCA cross border payment",
      "Bitcoin Ethereum institutional adoption spot ETF volume",
      "stablecoin CBDC DeFi blockchain policy global financial system",
      "crypto exchange liquidity crisis hack exploit enforcement action",
      "India crypto tax regulation digital rupee CBDC",
      "China digital yuan crypto ban blockchain policy",
      "El Salvador Latin America Bitcoin legal tender adoption",
      "Nigeria Africa crypto adoption remittance regulation",
      "European Union MiCA stablecoin licensing enforcement",
      "United Arab Emirates Dubai crypto hub regulation license",
      "South Korea Japan crypto exchange regulation retail trading",
      "Russia crypto sanctions evasion mining regulation",
      "US SEC CFTC crypto enforcement subpoena litigation action",
      "Stablecoin depeg algorithmic reserve run liquidity crisis",
      "Tether USDT Circle USDC reserve backing audit regulation",
      "Crypto mixer sanction OFAC compliance Tornado Cash protocol",
      "Layer 1 validator slashing centralization risk infrastructure outage",
      "Cross-chain bridge exploit smart contract hack million drained",
      "Institutional crypto custody bank bankruptcy reserve audit",
      "global crypto mining energy consumption ban restriction",
      "central bank digital currency pilot rollout country",
    ],
  },
];

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// NEW: extracts a clean, deduped-friendly domain (e.g. "theguardian.com")
// from an article URL. Used to populate `source_domain` so the frontend can
// show real, verifiable publisher names instead of just "guardian"/"newsapi".
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGroqWithBackoff(fn, label) {
  if (groqRequestsThisRun >= GROQ_MAX_REQUESTS_PER_RUN) {
    const budgetErr = new Error(`Groq per-run budget exhausted (${GROQ_MAX_REQUESTS_PER_RUN} requests) — leaving quota for other services on this key.`);
    budgetErr.isBudgetExhausted = true;
    throw budgetErr;
  }

  let attempt = 0;
  while (true) {
    try {
      groqRequestsThisRun++;
      const { data, response } = await fn();

      // Proactively back off based on shared org-wide quota, even if we
      // personally didn't get a 429 — some other consumer of this key may
      // have used most of it.
      const remainingRequests = Number(response?.headers?.get?.('x-ratelimit-remaining-requests'));
      const remainingTokens = Number(response?.headers?.get?.('x-ratelimit-remaining-tokens'));
      const resetRequests = response?.headers?.get?.('x-ratelimit-reset-requests');
      const resetTokens = response?.headers?.get?.('x-ratelimit-reset-tokens');

      if (Number.isFinite(remainingRequests) && remainingRequests <= GROQ_MIN_REMAINING_REQUESTS) {
        console.log(`  ⚠️ Groq shared quota low: only ${remainingRequests} requests left (resets in ${resetRequests || '?'}). Pausing briefly to leave room for other services.`);
        await delay(5000);
      } else if (Number.isFinite(remainingTokens) && remainingTokens <= GROQ_MIN_REMAINING_TOKENS) {
        console.log(`  ⚠️ Groq shared quota low: only ${remainingTokens} tokens left (resets in ${resetTokens || '?'}). Pausing briefly to leave room for other services.`);
        await delay(5000);
      }

      return data;
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const message = String(error?.message ?? error?.error?.message ?? "");
      const isDailyQuotaExhausted = status === 429 && /tokens per day|requests per day|TPD|RPD/i.test(message);
      if (isDailyQuotaExhausted) {
        const quotaErr = new Error(`Groq daily quota exhausted: ${message}`);
        quotaErr.isQuotaExhausted = true;
        throw quotaErr;
      }
      const isRateLimit = status === 429;

      if (!isRateLimit || attempt >= MAX_RETRIES) {
        throw error;
      }

      const retryAfterHeader =
        error?.headers?.['retry-after'] ?? error?.response?.headers?.get?.('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;

      const backoff = retryAfterMs && Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;

      attempt++;
      console.log(`  ⏳ Rate limited on ${label} (attempt ${attempt}/${MAX_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

async function callCerebras(cerebrasApiKey, prompt) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cerebrasApiKey}` },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
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
  return data.choices[0].message.content;
}

async function checkArticlesBatchRelevance(articles, category) {
  const articlesBlock = articles
    .map((a, i) => `[${i}] Title: "${a.title}"\nDescription: "${a.description}"`)
    .join('\n\n');

  const prompt = `You are an expert financial and geopolitical risk analyst. Analyze EACH of the following ${articles.length} articles for the category "${category}".

${articlesBlock}

For each article, determine if it represents a significant macro/geopolitical trend or shock. Discard sports, celebrity gossip, local crimes, or casual entertainment reviews.

Respond STRICTLY as a JSON object with a single key "results", an array of exactly ${articles.length} objects in the SAME ORDER as the articles above, each with:
- "relevant": boolean
- "severity": number (0-100, where 100 is catastrophic global impact, e.g., world war or global systemic market crash)
- "confidence": number (0-100, how confident you are in this assessment)
- "narrative": string (a short one-sentence framing of what risk/trend this event represents)
- "summary": string (2-3 sentence neutral summary of the article's core facts)

Example shape: { "results": [ { "relevant": true, "severity": 65, "confidence": 70, "narrative": "...", "summary": "..." }, ... ] }`;

  let rawContent;
  try {
    const chatCompletion = await callGroqWithBackoff(
      async () => {
        const request = groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: "openai/gpt-oss-20b",
          reasoning_effort: "low",
          response_format: { type: "json_object" },
        });
        if (typeof request.withResponse === 'function') {
          return await request.withResponse();
        }
        const data = await request;
        return { data, response: null };
      },
      `batch-classify (${articles.length} articles)`,
    );
    rawContent = chatCompletion.choices[0].message.content;
  } catch (e) {
    if (!e.isQuotaExhausted && !e.isBudgetExhausted) throw e;
    if (!process.env.CEREBRAS_API_KEY) throw e;
    console.log(`  ↪ Groq quota exhausted for batch-classify (${articles.length} articles) — falling back to Cerebras.`);
    rawContent = await callCerebras(process.env.CEREBRAS_API_KEY, prompt);
  }

  try {
    const parsed = JSON.parse(rawContent);
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    return articles.map((a, i) => {
      const r = results[i];
      if (!r) {
        return { relevant: false, severity: 0, confidence: 0, narrative: a.title, summary: a.description || a.title };
      }
      return {
        relevant: !!r.relevant,
        severity: Number.isFinite(r.severity) ? r.severity : 0,
        confidence: Number.isFinite(r.confidence) ? r.confidence : 50,
        narrative: r.narrative || a.title,
        summary: r.summary || a.description || a.title,
      };
    });
  } catch (parseErr) {
    console.error(`  ❌ Failed to parse batch response: ${parseErr.message}`);
    return articles.map((a) => ({ relevant: false, severity: 0, confidence: 0, narrative: a.title, summary: a.description || a.title }));
  }
}

const DISABLE_NEWSAPI = process.env.DISABLE_NEWSAPI === 'true';

// Shared retry/backoff for the two news APIs, same shape as callGroqWithBackoff.
// `fn` should return the fetch Response; a 429 triggers exponential backoff
// (honoring Retry-After when the API sends one) instead of an immediate
// fall-through/give-up.
async function fetchWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    const response = await fn();

    if (response.status !== 429) {
      return response;
    }

    if (attempt >= NEWS_MAX_RETRIES) {
      throw new Error(`${label} rate limit hit (out of retries)`);
    }

    const retryAfterHeader = response.headers?.get?.('retry-after');
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
    const backoff = retryAfterMs && Number.isFinite(retryAfterMs)
      ? retryAfterMs
      : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    const jitter = Math.random() * 500;

    attempt++;
    console.log(`  ⏳ Rate limited on ${label} (attempt ${attempt}/${NEWS_MAX_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
    await delay(backoff + jitter);
  }
}

async function fetchArticlesFromApis(query, categoryName) {
  try {
    const sectionFilter = GUARDIAN_SECTIONS[categoryName];
    const sectionParam = sectionFilter ? `&section=${encodeURIComponent(sectionFilter)}` : '';
    const guardianUrl = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&type=article${sectionParam}&order-by=relevance&show-fields=trailText&page-size=10&api-key=${process.env.GUARDIAN_API_KEY}`;
    const response = await fetchWithBackoff(() => fetch(guardianUrl), `Guardian ("${query}")`);

    const data = await response.json();

    if (!data.response || !data.response.results || data.response.results.length === 0) {
      console.log(`   🔍 Guardian raw response for "${query}": ${JSON.stringify(data).slice(0, 300)}`);
    }

    if (data.response && data.response.results && data.response.results.length > 0) {
      return data.response.results.map(a => ({
        title: a.webTitle,
        description: a.fields?.trailText || "",
        url: a.webUrl,
        publishedAt: a.webPublicationDate || new Date().toISOString(),
        source: 'guardian',
        sourceDomain: extractDomain(a.webUrl), // NEW: real publisher domain, e.g. "theguardian.com"
      }));
    }

    console.log(`   Guardian returned no results for query "${query}". Trying NewsAPI fallback...`);
  } catch (e) {
    console.log(`   Guardian failed for query "${query}" (${e.message}). Trying NewsAPI fallback...`);
  }

  if (DISABLE_NEWSAPI) {
    return [];
  }

  try {
    const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`;
    const response = await fetchWithBackoff(() => fetch(newsApiUrl), `NewsAPI ("${query}")`);

    const data = await response.json();
    if (data.articles) {
      return data.articles.map(a => ({
        title: a.title,
        description: a.description || "",
        url: a.url,
        publishedAt: a.publishedAt || new Date().toISOString(),
        source: 'newsapi',
        sourceDomain: extractDomain(a.url), // NEW: real publisher domain, e.g. "reuters.com"
      }));
    }
  } catch (ne) {
    console.error(`   Failed fetching from NewsAPI for query "${query}":`, ne.message);
  }

  return [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ingestNews() {
  console.log("Run node scripts/ingest-news.js");

  let existingEvents = [];
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('events')
        .select('source_url, source_title')
        .range(from, from + PAGE_SIZE - 1);
      if (pageError) {
        console.error("❌ Failed to fetch existing entries from Supabase:", pageError.message);
        return;
      }
      if (!page || page.length === 0) break;
      existingEvents = existingEvents.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const existingUrls = new Set(existingEvents.map(e => e.source_url));
  const existingTitles = new Set(existingEvents.map(e => normalizeTitle(e.source_title)));

  console.log(`${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`);

  let totalInserted = 0;
  let stopRun = false;

  for (const category of CATEGORIES) {
    if (stopRun) break;
    console.log(`\nProcessing category: ${category.name}`);
    let categoryInserted = 0;
    let seenInCurrentRun = new Set();

    let baselineSeverity = null;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: baselineRows, error: baselineError } = await supabase
        .from('events')
        .select('severity')
        .eq('category', category.name)
        .gte('published_at', since);
      if (baselineError) {
        console.error(`  ⚠️ Baseline query failed for ${category.name}:`, baselineError.message);
      } else if (baselineRows && baselineRows.length > 0) {
        const sum = baselineRows.reduce((acc, r) => acc + Number(r.severity ?? 0), 0);
        baselineSeverity = sum / baselineRows.length;
        console.log(`  Baseline severity for ${category.name}: ${baselineSeverity.toFixed(1)} (from ${baselineRows.length} events)`);
      }
    } catch (be) {
      console.error(`  ⚠️ Baseline computation threw for ${category.name}:`, be.message);
    }

    let candidateArticles = [];
    for (const [queryIndex, query] of category.queries.entries()) {
      const fetched = await fetchArticlesFromApis(query, category.name);
      for (const article of fetched) {
        const normTitle = normalizeTitle(article.title);
        if (existingUrls.has(article.url) || existingTitles.has(normTitle) || seenInCurrentRun.has(normTitle)) {
          continue;
        }
        seenInCurrentRun.add(normTitle);
        candidateArticles.push(article);
      }
      // ⚠️ FIX: query lists got longer (geopolitics ~20 -> ~47), and this loop
      // previously fired queries at Guardian/NewsAPI with zero gap between
      // them. Small delay here keeps us well under both APIs' per-second/
      // per-minute rate limits even with many more queries per category.
      if (queryIndex < category.queries.length - 1) {
        await delay(QUERY_DELAY_MS);
      }
    }

    console.log(`  ${candidateArticles.length} new unique candidate article(s) to classify.`);

    const batches = chunk(candidateArticles, BATCH_SIZE);
    for (const [batchIndex, batch] of batches.entries()) {
      let assessments;
      try {
        assessments = await checkArticlesBatchRelevance(batch, category.name);
      } catch (batchErr) {
        if (batchErr.isBudgetExhausted || batchErr.isQuotaExhausted) {
          console.error(`  🛑 ${batchErr.message} — stopping this run early (remaining articles will be picked up next run).`);
          stopRun = true;
          break;
        }
        console.error(`  ❌ Batch ${batchIndex + 1}/${batches.length} classification failed for ${category.name} (${batchErr.message}) — skipping this batch, continuing with the rest of the run.`);
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const article = batch[i];
        const assessment = assessments[i];

        if (assessment.relevant) {
          if (baselineSeverity === null) baselineSeverity = assessment.severity;
          const delta = Math.round(assessment.severity - baselineSeverity);

          const { error: insertError } = await supabase
            .from('events')
            .insert([{
              source_url: article.url,
              source_title: article.title,
              source_name: article.source,
              source_domain: article.sourceDomain, // NEW: real, verifiable publisher domain
              category: category.name,
              narrative: assessment.narrative,
              summary: assessment.summary,
              stage: 'new',
              severity: assessment.severity,
              confidence: assessment.confidence,
              delta,
              published_at: article.publishedAt,
              market_created: false,
              created_at: new Date().toISOString()
            }]);

          if (!insertError) {
            console.log(`  ✅ Successfully Inserted: "${article.title}" (severity ${assessment.severity}, delta ${delta})`);
            categoryInserted++;
            totalInserted++;
            existingTitles.add(normalizeTitle(article.title));
            existingUrls.add(article.url);
          } else {
            console.error(`  ❌ Database insertion failed:`, insertError.message);
          }
        } else {
          console.log(`  Rejected by LLM relevance check: "${article.title}"`);
        }
      }

      if (batchIndex < batches.length - 1) {
        await delay(BATCH_DELAY_MS);
      }
    }

    console.log(`Inserted ${categoryInserted} events for ${category.name}.`);
  }

  console.log(`\nDone. Total unique inserted: ${totalInserted} events.`);
}

ingestNews().catch(console.error);
