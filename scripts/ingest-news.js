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
const BATCH_DELAY_MS = Number(process.env.GROQ_BATCH_DELAY_MS || 3000);
const MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;

const QUERY_DELAY_MS = Number(process.env.NEWS_QUERY_DELAY_MS || 800);
const NEWS_MAX_RETRIES = Number(process.env.NEWS_MAX_RETRIES || 3);

const GROQ_MAX_REQUESTS_PER_RUN = Number(process.env.GROQ_MAX_REQUESTS_PER_RUN || 40);
const GROQ_MIN_REMAINING_REQUESTS = Number(process.env.GROQ_MIN_REMAINING_REQUESTS || 3);
const GROQ_MIN_REMAINING_TOKENS = Number(process.env.GROQ_MIN_REMAINING_TOKENS || 500);
let groqRequestsThisRun = 0;

const DISABLE_NEWSAPI = process.env.DISABLE_NEWSAPI === 'true';
const MAX_ARTICLE_AGE_MS = Number(process.env.MAX_ARTICLE_AGE_MS || 72 * 60 * 60 * 1000);
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE || 60);
const MIN_SEVERITY = Number(process.env.MIN_SEVERITY || 35);

const ALLOWED_CATEGORIES = ['geopolitics', 'macro', 'rare_earth', 'crypto'];

const ALLOW = {
  geopolitics:
    /\b(war|warfare|strike|airstrike|missile|troop|troops|ceasefire|nato|blockade|coup|junta|nuclear|invasion|militia|drone|artillery|offensive|frontline|sanctions?|embargo|occupation|mobilization|hezbollah|houthi|pla|pentagon|kremlin|idf|irgc)\b/i,
  macro:
    /\b(federal reserve|the fed\b|ecb|boj|rbi|pboc|imf|world bank|inflation|interest rate|rate cut|rate hike|default|sovereign debt|tariff|bond yield|treasur(?:y|ies)|recession|devaluat(?:e|ion)|opec|stimulus|gilt|stagflation|liquidity|credit crunch|bank failure)\b/i,
  rare_earth:
    /\b(rare earths?|ree\b|neodymium|praseodymium|dysprosium|terbium|ndfeb|permanent magnet|gallium|germanium|antimony|tungsten|graphite|lithium|cobalt|nickel|lynas|mp materials|iluka|refin(?:e|ing)|export (?:ban|quota|license|control)|critical minerals?)\b/i,
  crypto:
    /\b(sec\b|cftc|mica|stablecoin|usdc|usdt|tether|depeg|hack|exploit|etf|ofac|cbdc|binance|coinbase|tornado cash|mixer|bridge exploit|withdrawal halt|reserve audit)\b/i,
};

const DENY =
  /\b(newsletter|op-?ed|opinion column|letter to the editor|celebrity|oscar|grammy|premier league|nba|nfl|hollywood|cosplay|canoe|lifestyle|recipe|horoscope|what to watch|obituary)\b/i;

const CATEGORY_DENY = {
  rare_earth:
    /\b(anthropic|openai|semiconductor|tsmc|asml|chips act|datacent(?:er|re)|ai model|lawsuit against|blacklisting of)\b/i,
  geopolitics:
    /\b(football|cricket|tennis|film festival)\b/i,
  macro:
    /\b(crypto winter|nft|memecoin)\b/i,
  crypto:
    /\b(price prediction|how to buy|best wallet)\b/i,
};

const GUARDIAN_SECTIONS = {
  geopolitics: 'world|politics',
  macro: 'business|world|money',
  rare_earth: 'business|environment|world',
  crypto: 'technology|business',
};

const CATEGORIES = [
  {
    name: 'geopolitics',
    queries: [
      'Russia Ukraine war missile drone frontline',
      'Russia NATO military escalation nuclear doctrine',
      'Belarus Russia military corridor Poland Baltic',
      'Kaliningrad Suwalki Gap NATO military',
      'Black Sea grain fleet naval attack Ukraine Russia',
      'Moldova Transnistria Russia security crisis',
      'Serbia Kosovo military tension NATO',
      'Bosnia Republika Srpska secession crisis',
      'Arctic militarization Northern Sea Route Russia NATO',

      'Israel Iran military strike nuclear facility',
      'Israel Hezbollah Lebanon ground offensive',
      'Israel Hamas Gaza ceasefire collapse',
      'Houthi Red Sea shipping attack Bab el-Mandeb',
      'Strait of Hormuz naval blockade Iran oil',
      'Iraq Syria US troops militia attack',
      'Yemen civil war Houthi coalition offensive',
      'Turkey Syria Iraq cross-border military operation',
      'Egypt Ethiopia GERD Nile dam military tension',
      'Libya militia conflict oil terminal',

      'China Taiwan military drills blockade invasion',
      'South China Sea Philippines China naval clash',
      'Japan China East China Sea Senkaku military',
      'North Korea missile nuclear test launch',
      'South Korea North Korea military clash',
      'China India Line of Actual Control troops',

      'India Pakistan Kashmir military escalation',
      'Afghanistan Taliban Pakistan border attack',
      'Myanmar civil war junta offensive',
      'Thailand Cambodia border military clash',
      'Armenia Azerbaijan Zangezur corridor fighting',
      'Kazakhstan Uzbekistan water border security Russia',

      'Sudan civil war RSF SAF offensive',
      'DRC M23 Goma Rwanda military',
      'Sahel Mali Niger Burkina Faso junta violence',
      'Somalia Al-Shabaab offensive African Union',
      'Ethiopia Tigray Amhara Fano conflict',
      'Mozambique Cabo Delgado insurgency LNG',

      'Venezuela Guyana Essequibo military tension',
      'Mexico cartel military conflict government',
      'Haiti gang control international intervention',
      'Colombia ELN FARC violence ceasefire',

      'UN Security Council veto resolution crisis',
      'military coup junta overthrows government',
      'state sponsored cyberattack power grid pipeline undersea cable',
      'anti-satellite weapon test military space',
      'nuclear weapons facility enrichment breakout',
    ],
  },
  {
    name: 'macro',
    queries: [
      'Federal Reserve FOMC interest rate inflation',
      'ECB interest rate eurozone inflation',
      'Bank of Japan yield curve yen intervention',
      'Bank of England Bank Rate gilt inflation',
      'Swiss National Bank SNB currency intervention',
      'Bank of Canada RBA RBNZ interest rate',

      'US Treasury bond yield fiscal deficit debt ceiling',
      'US regional bank failure FDIC credit crunch',
      'US commercial real estate debt default banks',

      'China property crisis local government debt stimulus',
      'China GDP deflation PBOC stimulus package',
      'Germany France Italy fiscal deficit EU rules',
      'eurozone recession industrial production crisis',

      'IMF bailout sovereign default debt restructuring',
      'Argentina Brazil Mexico inflation currency crisis',
      'Turkey lira inflation central bank emergency',
      'Nigeria Egypt South Africa debt IMF currency',
      'Pakistan Sri Lanka sovereign default IMF',
      'Saudi Arabia UAE oil fiscal budget Vision',

      'US China tariff trade war export controls',
      'WTO dispute tariff retaliation trade',
      'OPEC plus oil production cut price war',
      'European natural gas supply shock storage',
      'wheat rice fertilizer export ban food crisis',
      'Red Sea Suez Panama Canal shipping disruption freight',
      'dollar index yuan devaluation capital flight',
      'central bank gold buying de-dollarization reserves',

      'global banking contagion liquidity swap line Fed',
      'shadow banking private credit default systemic',
    ],
  },
  {
    name: 'rare_earth',
    queries: [
      'China rare earth export license quota ban',
      'neodymium praseodymium dysprosium terbium shortage',
      'NdFeB permanent magnet supply defense',
      'Lynas MP Materials Iluka rare earth refinery',
      'Myanmar rare earth mining export China',
      'Australia rare earth mining processing permit',

      'China gallium germanium antimony graphite export control',
      'tungsten molybdenum defense mineral supply',
      'natural graphite anode export restriction China',

      'Indonesia nickel ore export ban HPAL smelter',
      'DRC cobalt mining export royalty conflict',
      'Chile lithium nationalization Codelco SQM',
      'Argentina Bolivia lithium contract expropriation',
      'Zimbabwe Namibia lithium export ban policy',
      'Philippines nickel mining ban environment',
      'New Caledonia nickel unrest production halt',

      'copper mine strike shutdown Chile Peru Panama',
      'Niger Kazakhstan uranium export coup sanctions',

      'US critical minerals stockpile Defense Production Act',
      'EU Critical Raw Materials Act strategic project',
      'India critical minerals auction import dependence',
      'resource nationalism mining windfall tax nationalization',
      'deep sea nodules Clarion-Clipperton ISA mining permit',
    ],
  },
  {
    name: 'crypto',
    queries: [
      'SEC crypto enforcement lawsuit exchange',
      'CFTC crypto derivatives enforcement',
      'US stablecoin legislation Congress Circle Tether',
      'MiCA stablecoin license ESMA enforcement',
      'UK FCA crypto stablecoin regulation',

      'China digital yuan crypto ban enforcement',
      'Hong Kong Singapore crypto license MAS SFC',
      'Japan FSA South Korea FSC crypto exchange rule',
      'India crypto tax CBDC digital rupee policy',
      'UAE VARA crypto license enforcement',
      'Nigeria Brazil crypto remittance regulation central bank',

      'USDC USDT stablecoin depeg reserve attestation',
      'Tether Circle reserve audit regulator',
      'bitcoin ethereum spot ETF approval denial flow',
      'crypto exchange insolvency withdrawal halt bankruptcy',
      'cross-chain bridge exploit hack funds drained',
      'OFAC sanctioned mixer Tornado Cash protocol',
      'major chain outage validator halt finality',
      'CBDC pilot launch ban private stablecoin',
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

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function stripHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFresh(publishedAt) {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= MAX_ARTICLE_AGE_MS;
}

function textBlob(article, assessment = {}) {
  return [
    article.title,
    article.description,
    assessment.narrative,
    assessment.summary,
  ]
    .filter(Boolean)
    .join(' ');
}

function passesGates(article, assessment, fallbackCategory) {
  const title = stripHtml(article.title);
  const description = stripHtml(article.description);
  const category = ALLOWED_CATEGORIES.includes(assessment.category)
    ? assessment.category
    : fallbackCategory;

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { ok: false, reason: `bad category "${assessment.category}"` };
  }
  if (!assessment.relevant) {
    return { ok: false, reason: 'llm relevant=false' };
  }
  if (!isFresh(article.publishedAt)) {
    return { ok: false, reason: `stale ${article.publishedAt}` };
  }
  if (DENY.test(`${title} ${description}`)) {
    return { ok: false, reason: 'global deny' };
  }
  if (CATEGORY_DENY[category]?.test(textBlob({ title, description }, assessment))) {
    return { ok: false, reason: `${category} deny` };
  }
  if (!ALLOW[category].test(textBlob({ title, description }, assessment))) {
    return { ok: false, reason: `${category} allowlist miss` };
  }
  if (Number(assessment.confidence) < MIN_CONFIDENCE) {
    return { ok: false, reason: `low confidence ${assessment.confidence}` };
  }
  if (Number(assessment.severity) < MIN_SEVERITY) {
    return { ok: false, reason: `low severity ${assessment.severity}` };
  }

  return { ok: true, category, title, description };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGroqWithBackoff(fn, label) {
  if (groqRequestsThisRun >= GROQ_MAX_REQUESTS_PER_RUN) {
    const budgetErr = new Error(
      `Groq per-run budget exhausted (${GROQ_MAX_REQUESTS_PER_RUN} requests) — leaving quota for other services on this key.`
    );
    budgetErr.isBudgetExhausted = true;
    throw budgetErr;
  }

  let attempt = 0;
  while (true) {
    try {
      groqRequestsThisRun++;
      const { data, response } = await fn();

      const remainingRequests = Number(response?.headers?.get?.('x-ratelimit-remaining-requests'));
      const remainingTokens = Number(response?.headers?.get?.('x-ratelimit-remaining-tokens'));
      const resetRequests = response?.headers?.get?.('x-ratelimit-reset-requests');
      const resetTokens = response?.headers?.get?.('x-ratelimit-reset-tokens');

      if (Number.isFinite(remainingRequests) && remainingRequests <= GROQ_MIN_REMAINING_REQUESTS) {
        console.log(
          `  ⚠️ Groq shared quota low: only ${remainingRequests} requests left (resets in ${resetRequests || '?'}). Pausing briefly to leave room for other services.`
        );
        await delay(5000);
      } else if (Number.isFinite(remainingTokens) && remainingTokens <= GROQ_MIN_REMAINING_TOKENS) {
        console.log(
          `  ⚠️ Groq shared quota low: only ${remainingTokens} tokens left (resets in ${resetTokens || '?'}). Pausing briefly to leave room for other services.`
        );
        await delay(5000);
      }

      return data;
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const message = String(error?.message ?? error?.error?.message ?? '');
      const isDailyQuotaExhausted =
        status === 429 && /tokens per day|requests per day|TPD|RPD/i.test(message);
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

      const backoff =
        retryAfterMs && Number.isFinite(retryAfterMs)
          ? retryAfterMs
          : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;

      attempt++;
      console.log(
        `  ⏳ Rate limited on ${label} (attempt ${attempt}/${MAX_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`
      );
      await delay(backoff + jitter);
    }
  }
}

async function callCerebras(cerebrasApiKey, prompt) {
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cerebrasApiKey}`,
    },
    body: JSON.stringify({
      model: 'llama3.1-8b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
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

  const prompt = `You are a strict event filter for a geopolitical/macro risk desk.
Category being fetched: "${category}".

Articles:
${articlesBlock}

For EACH article return one object in the same order.

Rules:
- relevant=true ONLY if this is a breaking or material risk event, not analysis colour, not a newsletter wrap, not an opinion letter, not historical trivia.
- category MUST be exactly one of: geopolitics, macro, rare_earth, crypto, none
- Do NOT copy the fetch bucket if the subject does not fit.
- rare_earth ONLY for rare earth elements, permanent magnets, or critical mineral mine/refine/export controls (lithium, nickel, cobalt, graphite, gallium, germanium, antimony, tungsten, copper, uranium).
- AI companies, semiconductors, datacentres, general tech lawsuits, culture, sport = none and relevant=false.
- summary: 2 sentences of THIS article's facts only. No HTML.

Respond STRICTLY as JSON:
{ "results": [ { "index": 0, "relevant": true, "category": "geopolitics", "severity": 65, "confidence": 70, "narrative": "...", "summary": "..." } ] }`;

  let rawContent;
  try {
    const chatCompletion = await callGroqWithBackoff(async () => {
      const request = groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'openai/gpt-oss-20b',
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      });
      if (typeof request.withResponse === 'function') {
        return await request.withResponse();
      }
      const data = await request;
      return { data, response: null };
    }, `batch-classify (${articles.length} articles)`);
    rawContent = chatCompletion.choices[0].message.content;
  } catch (e) {
    if (!e.isQuotaExhausted && !e.isBudgetExhausted) throw e;
    if (!process.env.CEREBRAS_API_KEY) throw e;
    console.log(
      `  ↪ Groq quota exhausted for batch-classify (${articles.length} articles) — falling back to Cerebras.`
    );
    rawContent = await callCerebras(process.env.CEREBRAS_API_KEY, prompt);
  }

  try {
    const parsed = JSON.parse(rawContent);
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const byIndex = new Map();
    for (const r of results) {
      if (Number.isInteger(r?.index) && !byIndex.has(r.index)) {
        byIndex.set(r.index, r);
      }
    }

    return articles.map((a, i) => {
      const r = byIndex.get(i);
      if (!r) {
        console.error(
          `  ⚠️ Batch classify: no grounded result for article [${i}] "${a.title}" — treating as not relevant.`
        );
        return {
          relevant: false,
          category: 'none',
          severity: 0,
          confidence: 0,
          narrative: a.title,
          summary: a.description || a.title,
        };
      }
      return {
        relevant: !!r.relevant,
        category: typeof r.category === 'string' ? r.category.trim().toLowerCase() : 'none',
        severity: Number.isFinite(r.severity) ? r.severity : 0,
        confidence: Number.isFinite(r.confidence) ? r.confidence : 50,
        narrative: stripHtml(r.narrative || a.title),
        summary: stripHtml(r.summary || a.description || a.title),
      };
    });
  } catch (parseErr) {
    console.error(`  ❌ Failed to parse batch response: ${parseErr.message}`);
    return articles.map((a) => ({
      relevant: false,
      category: 'none',
      severity: 0,
      confidence: 0,
      narrative: a.title,
      summary: a.description || a.title,
    }));
  }
}

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
    const backoff =
      retryAfterMs && Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    const jitter = Math.random() * 500;

    attempt++;
    console.log(
      `  ⏳ Rate limited on ${label} (attempt ${attempt}/${NEWS_MAX_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`
    );
    await delay(backoff + jitter);
  }
}

async function fetchArticlesFromApis(query, categoryName) {
  const fromDate = new Date(Date.now() - MAX_ARTICLE_AGE_MS).toISOString().slice(0, 10);
  const fromIso = new Date(Date.now() - MAX_ARTICLE_AGE_MS).toISOString();

  try {
    const sectionFilter = GUARDIAN_SECTIONS[categoryName];
    const sectionParam = sectionFilter ? `&section=${encodeURIComponent(sectionFilter)}` : '';
    const guardianUrl =
      `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}` +
      `&type=article${sectionParam}` +
      `&order-by=newest&from-date=${fromDate}` +
      `&show-fields=trailText&page-size=10` +
      `&api-key=${process.env.GUARDIAN_API_KEY}`;
    const response = await fetchWithBackoff(() => fetch(guardianUrl), `Guardian ("${query}")`);

    const data = await response.json();

    if (!data.response || !data.response.results || data.response.results.length === 0) {
      console.log(`   🔍 Guardian raw response for "${query}": ${JSON.stringify(data).slice(0, 300)}`);
    }

    if (data.response && data.response.results && data.response.results.length > 0) {
      return data.response.results.map((a) => ({
        title: stripHtml(a.webTitle),
        description: stripHtml(a.fields?.trailText || ''),
        url: a.webUrl,
        publishedAt: a.webPublicationDate || new Date().toISOString(),
        source: 'guardian',
        sourceDomain: extractDomain(a.webUrl),
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
    const newsApiUrl =
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
      `&language=en&sortBy=publishedAt&pageSize=10` +
      `&from=${encodeURIComponent(fromIso)}` +
      `&apiKey=${process.env.NEWSAPI_KEY}`;
    const response = await fetchWithBackoff(() => fetch(newsApiUrl), `NewsAPI ("${query}")`);

    const data = await response.json();
    if (data.articles) {
      return data.articles
        .filter((a) => a?.title && a.title !== '[Removed]')
        .map((a) => ({
          title: stripHtml(a.title),
          description: stripHtml(a.description || ''),
          url: a.url,
          publishedAt: a.publishedAt || new Date().toISOString(),
          source: 'newsapi',
          sourceDomain: extractDomain(a.url),
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
  console.log('Run node scripts/ingest-news.js');

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
        console.error('❌ Failed to fetch existing entries from Supabase:', pageError.message);
        return;
      }
      if (!page || page.length === 0) break;
      existingEvents = existingEvents.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const existingUrls = new Set(existingEvents.map((e) => e.source_url));
  const existingTitles = new Set(existingEvents.map((e) => normalizeTitle(e.source_title)));

  console.log(
    `${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`
  );

  let totalInserted = 0;
  let totalRejectedByGate = 0;
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
        console.log(
          `  Baseline severity for ${category.name}: ${baselineSeverity.toFixed(1)} (from ${baselineRows.length} events)`
        );
      }
    } catch (be) {
      console.error(`  ⚠️ Baseline computation threw for ${category.name}:`, be.message);
    }

    let candidateArticles = [];
    for (const [queryIndex, query] of category.queries.entries()) {
      const fetched = await fetchArticlesFromApis(query, category.name);
      for (const article of fetched) {
        const normTitle = normalizeTitle(article.title);
        if (!article.title || !isFresh(article.publishedAt)) continue;
        if (DENY.test(`${article.title} ${article.description}`)) continue;
        if (
          existingUrls.has(article.url) ||
          existingTitles.has(normTitle) ||
          seenInCurrentRun.has(normTitle)
        ) {
          continue;
        }
        seenInCurrentRun.add(normTitle);
        candidateArticles.push(article);
      }
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
          console.error(
            `  🛑 ${batchErr.message} — stopping this run early (remaining articles will be picked up next run).`
          );
          stopRun = true;
          break;
        }
        console.error(
          `  ❌ Batch ${batchIndex + 1}/${batches.length} classification failed for ${category.name} (${batchErr.message}) — skipping this batch, continuing with the rest of the run.`
        );
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const article = batch[i];
        const assessment = assessments[i];
        const gated = passesGates(article, assessment, category.name);

        if (!gated.ok) {
          totalRejectedByGate++;
          console.log(`  Rejected by gate (${gated.reason}): "${article.title}"`);
          continue;
        }

        if (baselineSeverity === null) baselineSeverity = assessment.severity;
        const delta = Math.round(assessment.severity - baselineSeverity);

        const { error: insertError } = await supabase.from('events').insert([
          {
            source_url: article.url,
            source_title: gated.title,
            source_name: article.source,
            source_domain: article.sourceDomain,
            category: gated.category,
            narrative: assessment.narrative,
            summary: assessment.summary,
            stage: 'new',
            severity: assessment.severity,
            confidence: assessment.confidence,
            delta,
            published_at: article.publishedAt,
            market_created: false,
            created_at: new Date().toISOString(),
          },
        ]);

        if (!insertError) {
          console.log(
            `  ✅ Inserted [${gated.category}]: "${gated.title}" (severity ${assessment.severity}, delta ${delta})`
          );
          categoryInserted++;
          totalInserted++;
          existingTitles.add(normalizeTitle(gated.title));
          existingUrls.add(article.url);
        } else {
          console.error(`  ❌ Database insertion failed:`, insertError.message);
        }
      }

      if (batchIndex < batches.length - 1) {
        await delay(BATCH_DELAY_MS);
      }
    }

    console.log(`Inserted ${categoryInserted} events for ${category.name}.`);
  }

  console.log(`\nDone. Total unique inserted: ${totalInserted} events.`);
  console.log(`Rejected by gate: ${totalRejectedByGate}.`);
}

ingestNews().catch(console.error);
