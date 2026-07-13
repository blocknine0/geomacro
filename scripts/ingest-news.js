import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// ১. সুপাবেস ও গ্রোক ইনিশিয়ালাইজেশন (Timeout ও Max Retries সহ)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 30 * 1000, // batch prompt বড়, তাই টাইমআউট একটু বাড়ানো হলো
  maxRetries: 0,       // SDK-এর নিজস্ব retry বন্ধ — আমরা নিজেরাই rate-limit-aware retry করব নিচে
  fetch: fetch          // 🛠️ undici (built-in fetch)-এর POST premature-close bug
                         // এড়াতে node-fetch explicitly পাস করা হলো
});

// 💡 RATE-LIMIT কন্ট্রোল — env দিয়ে override করা যায়, নাহলে এই ডিফল্ট
const BATCH_SIZE = Number(process.env.GROQ_BATCH_SIZE || 5);       // প্রতি কলে কয়টা আর্টিকেল
const BATCH_DELAY_MS = Number(process.env.GROQ_BATCH_DELAY_MS || 2000); // প্রতিটা batch call-এর মাঝে delay
const MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;

// ২. সম্পূর্ণ আন্তর্জাতিক লেভেলের গ্লোবাল ক্যাটাগরি এবং কুয়েরি সেট
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
      "space race military satellite anti-satellite weapon test",
      "United Nations Security Council veto resolution crisis",
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
      "global crypto mining energy consumption ban restriction",
      "central bank digital currency pilot rollout country",
    ],
  },
];

// ৩. টাইটেল নরমালাইজেশন ফাংশন
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🛡️ Rate-limit-aware wrapper — যেকোনো Groq কলকে এটা দিয়ে wrap করলে
// 429 পেলে exponential backoff দিয়ে retry করবে (Retry-After header থাকলে সেটা মেনে চলবে),
// অন্য error হলে সাথে সাথে re-throw করবে (অকারণে retry না করার জন্য)।
async function callGroqWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const isRateLimit = status === 429;

      if (!isRateLimit || attempt >= MAX_RETRIES) {
        throw error;
      }

      // Groq/OpenAI-স্টাইল ক্লায়েন্ট error object-এ headers থাকলে সেখান থেকে
      // retry-after পড়ার চেষ্টা করো, না পেলে exponential backoff + jitter।
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

// ৪. Groq LLM দিয়ে একটা ব্যাচ (একাধিক আর্টিকেল একসাথে) রিলেভেন্স+সিভিয়ারিটি স্কোরিং —
// আগে প্রতিটা আর্টিকেলের জন্য আলাদা কল হতো, এখন BATCH_SIZE-টা একসাথে একটা কলে যাচ্ছে,
// যাতে মোট request সংখ্যা (আর তাই rate-limit exposure) কয়েকগুণ কমে যায়।
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

  const chatCompletion = await callGroqWithBackoff(
    () => groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      response_format: { type: "json_object" },
    }),
    `batch-classify (${articles.length} articles)`,
  );

  try {
    const parsed = JSON.parse(chatCompletion.choices[0].message.content);
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    // Defensive: ইনপুট আর আউটপুট length না মিললে (মডেল কিছু বাদ দিয়ে ফেলতে পারে),
    // index-ভিত্তিক align করার চেষ্টা করো, বাকিগুলোকে safe default দাও।
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

// ৫. এপিআই ফেচিং হ্যান্ডলার (Guardian primary, NewsAPI শুধু fallback — quota বাঁচাতে)
//    NewsAPI free tier দিনে মাত্র ১০০ request দেয়, যেটা এই script-এর প্রতি run-এ
//    দরকার হওয়া ৮০+ query-র তুলনায় খুবই কম। তাই Guardian (যেখানে অনেক বেশি headroom
//    আছে)-কে আগে কল করা হচ্ছে, আর NewsAPI শুধু তখনই কল হবে যখন Guardian fail করে
//    বা কোনো ফলাফল না দেয় — এতে NewsAPI quota প্রায় পুরোটাই সংরক্ষিত থাকবে।
const DISABLE_NEWSAPI = process.env.DISABLE_NEWSAPI === 'true';

async function fetchArticlesFromApis(query) {
  // ১. প্রথমে Guardian (primary)
  try {
    const guardianUrl = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&show-fields=trailText&page-size=10&api-key=${process.env.GUARDIAN_API_KEY}`;
    const response = await fetch(guardianUrl);

    if (response.status === 429) {
      throw new Error("Guardian rate limit hit");
    }

    const data = await response.json();
    if (data.response && data.response.results && data.response.results.length > 0) {
      return data.response.results.map(a => ({
        title: a.webTitle,
        description: a.fields?.trailText || "",
        url: a.webUrl,
        publishedAt: a.webPublicationDate || new Date().toISOString(),
        source: 'guardian'
      }));
    }

    // Guardian কল সফল হয়েছে কিন্তু কোনো ফলাফল নেই — NewsAPI দিয়ে চেষ্টা করার মতো যথেষ্ট কারণ
    console.log(`   Guardian returned no results for query "${query}". Trying NewsAPI fallback...`);
  } catch (e) {
    console.log(`   Guardian failed for query "${query}" (${e.message}). Trying NewsAPI fallback...`);
  }

  // ২. Guardian fail করলে বা খালি ফলাফল দিলে NewsAPI (fallback), যদি explicitly বন্ধ না থাকে
  if (DISABLE_NEWSAPI) {
    return [];
  }

  try {
    const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`;
    const response = await fetch(newsApiUrl);

    if (response.status === 429) {
      throw new Error("NewsAPI rate limit hit");
    }

    const data = await response.json();
    if (data.articles) {
      return data.articles.map(a => ({
        title: a.title,
        description: a.description || "",
        url: a.url,
        publishedAt: a.publishedAt || new Date().toISOString(),
        source: 'newsapi'
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

// ৬. মেইন ইনজেকশন রান ফাংশন
async function ingestNews() {
  console.log("Run node scripts/ingest-news.js");

  const { data: existingEvents, error: fetchError } = await supabase
    .from('events')
    .select('source_url, source_title');

  if (fetchError) {
    console.error("❌ Failed to fetch existing entries from Supabase:", fetchError.message);
    return;
  }

  const existingUrls = new Set(existingEvents.map(e => e.source_url));
  const existingTitles = new Set(existingEvents.map(e => normalizeTitle(e.source_title)));

  console.log(`${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`);

  let totalInserted = 0;

  for (const category of CATEGORIES) {
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

    // প্রথমে এই ক্যাটাগরির সব query থেকে unique, নতুন আর্টিকেল জড়ো করো —
    // Groq-কে কল করার আগে, যাতে পুরো ক্যাটাগরি জুড়ে ব্যাচ করা যায়।
    let candidateArticles = [];
    for (const query of category.queries) {
      const fetched = await fetchArticlesFromApis(query);
      for (const article of fetched) {
        const normTitle = normalizeTitle(article.title);
        if (existingUrls.has(article.url) || existingTitles.has(normTitle) || seenInCurrentRun.has(normTitle)) {
          continue;
        }
        seenInCurrentRun.add(normTitle);
        candidateArticles.push(article);
      }
    }

    console.log(`  ${candidateArticles.length} new unique candidate article(s) to classify.`);

    // এখন BATCH_SIZE করে গ্রুপ করে Groq-কে কল করো — মোট call সংখ্যা এখন
    // (candidateArticles.length / BATCH_SIZE), আগে candidateArticles.length ছিল।
    const batches = chunk(candidateArticles, BATCH_SIZE);
    for (const [batchIndex, batch] of batches.entries()) {
      const assessments = await checkArticlesBatchRelevance(batch, category.name);

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

      // পরের batch-এর আগে সংক্ষিপ্ত delay (fixed per-article delay এর বদলে,
      // যেহেতু এখন call সংখ্যা অনেক কম, এই delay-ও ছোট রাখা যায়)।
      if (batchIndex < batches.length - 1) {
        await delay(BATCH_DELAY_MS);
      }
    }

    console.log(`Inserted ${categoryInserted} events for ${category.name}.`);
  }

  console.log(`\nDone. Total unique inserted: ${totalInserted} events.`);
}

ingestNews().catch(console.error);
