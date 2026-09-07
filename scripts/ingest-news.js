import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';

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

if (
  !process.env.GEMINI_API_KEY &&
  !process.env.MISTRAL_API_KEY &&
  !process.env.CEREBRAS_API_KEY
) {
  console.warn(
    "⚠️ No secondary classifier key configured — Groq is the only active classifier provider."
  );
}

const BATCH_SIZE = Number(process.env.GROQ_BATCH_SIZE || 2);
const BATCH_DELAY_MS = Number(process.env.GROQ_BATCH_DELAY_MS || 4000);
const MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;

const QUERY_DELAY_MS = Number(process.env.NEWS_QUERY_DELAY_MS || 800);
const NEWS_MAX_RETRIES = Number(process.env.NEWS_MAX_RETRIES || 3);

const GDELT_MIN_INTERVAL_MS = Number(
  process.env.GDELT_MIN_INTERVAL_MS || 5500
);

const RELIEFWEB_APP_NAME =
  String(
    process.env.RELIEFWEB_APP_NAME || ''
  ).trim();

const RELIEFWEB_ENABLED =
  String(
    process.env.RELIEFWEB_ENABLED || ''
  ).toLowerCase() === 'true' &&
  Boolean(RELIEFWEB_APP_NAME);

const GDACS_ENABLED =
  String(
    process.env.GDACS_ENABLED || 'true'
  ).toLowerCase() !== 'false';

const GDACS_MAX_CANDIDATES = Math.max(
  1,
  Number(
    process.env.GDACS_MAX_CANDIDATES || 3
  )
);

let gdeltLastRequestAt = 0;

const providerHealth = {
  guardian: {
    calls: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
    candidates: 0,
  },
  gdelt: {
    calls: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
    candidates: 0,
  },
  gdacs: {
    calls: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
    candidates: 0,
  },
  reliefweb: {
    calls: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
    candidates: 0,
  },
};

function providerTelemetry(
  provider,
  field,
  amount = 1
) {
  if (!providerHealth[provider]) return;

  providerHealth[provider][field] =
    (providerHealth[provider][field] || 0) +
    amount;
}

const GROQ_MODEL =
  process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const GEMINI_MODEL_ORDER = [
  ...new Set(
    String(
      process.env.GEMINI_MODEL_ORDER ||
        [
          GEMINI_MODEL,
          'gemini-3.7-flash',
          'gemini-3.6-flash',
          'gemini-3.5-flash-lite',
        ].join(',')
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ),
];

const MISTRAL_MODEL =
  process.env.MISTRAL_MODEL || 'mistral-small-2603';

const CEREBRAS_MODEL =
  process.env.CEREBRAS_MODEL || 'gpt-oss-120b';

const SUPPORTED_CLASSIFIER_PROVIDERS =
  new Set([
    'groq',
    'gemini',
    'mistral',
    'cerebras',
  ]);

const CLASSIFIER_PROVIDER_ORDER =
  [
    ...new Set(
      String(
        process.env.CLASSIFIER_PROVIDER_ORDER ||
          'groq,gemini,mistral,cerebras'
      )
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

if (CLASSIFIER_PROVIDER_ORDER.length === 0) {
  throw new Error(
    'CLASSIFIER_PROVIDER_ORDER must contain at least one provider.'
  );
}

for (const provider of CLASSIFIER_PROVIDER_ORDER) {
  if (!SUPPORTED_CLASSIFIER_PROVIDERS.has(provider)) {
    throw new Error(
      `Unsupported classifier provider in CLASSIFIER_PROVIDER_ORDER: ${provider}`
    );
  }
}
const GROQ_MAX_REQUESTS_PER_RUN = Number(process.env.GROQ_MAX_REQUESTS_PER_RUN || 30);
const GROQ_MIN_REMAINING_REQUESTS = Number(process.env.GROQ_MIN_REMAINING_REQUESTS || 2);
const GROQ_MIN_REMAINING_TOKENS = Number(process.env.GROQ_MIN_REMAINING_TOKENS || 1500);
const GROQ_MAX_WAIT_MS = Number(process.env.GROQ_MAX_WAIT_MS || 90 * 1000);
const MAX_CANDIDATES_PER_CATEGORY = Number(
  process.env.MAX_CANDIDATES_PER_CATEGORY || 18
);

/*
 * Classification capacity must fit inside the configured Groq request
 * budget even when every GRI category has candidates.
 *
 * Reserve 20% of the request budget for retries / ungrounded solo checks.
 */
const CLASSIFICATION_REQUEST_RESERVE = Math.max(
  2,
  Math.ceil(GROQ_MAX_REQUESTS_PER_RUN * 0.2)
);

const CLASSIFICATION_REQUEST_BUDGET = Math.max(
  1,
  GROQ_MAX_REQUESTS_PER_RUN -
    CLASSIFICATION_REQUEST_RESERVE
);

function safeCandidatesPerCategory() {
  return Math.max(
    1,
    Math.min(
      MAX_CANDIDATES_PER_CATEGORY,
      Math.floor(
        (
          CLASSIFICATION_REQUEST_BUDGET *
          BATCH_SIZE
        ) / ALLOWED_CATEGORIES.length
      )
    )
  );
}

let groqRequestsThisRun = 0;

/*
 * Provider circuit breakers are per-process/per-ingestion-run.
 *
 * A provider that has demonstrated a terminal quota/billing/model failure
 * is not called repeatedly for every remaining batch. This prevents a
 * degraded upstream provider from turning one outage into dozens of wasted
 * requests while still making the ingestion run fail closed.
 */
const classifierHealth = {
  groqCircuitOpen: false,
  groqCircuitReason: null,

  geminiCircuitOpen: false,
  geminiCircuitReason: null,

  mistralCircuitOpen: false,
  mistralCircuitReason: null,

  cerebrasCircuitOpen: false,
  cerebrasCircuitReason: null,

  providerStats: {
    groq: { attempted: 0, succeeded: 0, failed: 0 },
    gemini: { attempted: 0, succeeded: 0, failed: 0 },
    mistral: { attempted: 0, succeeded: 0, failed: 0 },
    cerebras: { attempted: 0, succeeded: 0, failed: 0 },
  },

  batchesAttempted: 0,
  batchesCompleted: 0,
  batchesFailed: 0,

  articlesAttempted: 0,
  articlesClassified: 0,

  degraded: false,
};

function openClassifierCircuit(provider, reason) {
  const message = String(
    reason?.message || reason || 'unknown provider failure'
  );

  const fields = {
    groq: ['groqCircuitOpen', 'groqCircuitReason'],
    gemini: ['geminiCircuitOpen', 'geminiCircuitReason'],
    mistral: ['mistralCircuitOpen', 'mistralCircuitReason'],
    cerebras: ['cerebrasCircuitOpen', 'cerebrasCircuitReason'],
  }[provider];

  if (!fields) return;

  classifierHealth[fields[0]] = true;
  classifierHealth[fields[1]] = message;
}

function classifierCircuitOpen(provider) {
  return Boolean(
    classifierHealth[`${provider}CircuitOpen`]
  );
}

function classifierApiKey(provider) {
  switch (provider) {
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'gemini':
      return process.env.GEMINI_API_KEY;
    case 'mistral':
      return process.env.MISTRAL_API_KEY;
    case 'cerebras':
      return process.env.CEREBRAS_API_KEY;
    default:
      return null;
  }
}

function classifierModel(provider) {
  switch (provider) {
    case 'groq':
      return GROQ_MODEL;
    case 'gemini':
      return GEMINI_MODEL;
    case 'mistral':
      return MISTRAL_MODEL;
    case 'cerebras':
      return CEREBRAS_MODEL;
    default:
      return 'unknown';
  }
}

function classifierProviderTelemetry(
  provider,
  field
) {
  const stats =
    classifierHealth.providerStats[provider];

  if (!stats || !(field in stats)) return;

  stats[field]++;
}

function hasHealthyClassifierProvider() {
  return CLASSIFIER_PROVIDER_ORDER.some(
    (provider) =>
      Boolean(classifierApiKey(provider)) &&
      !classifierCircuitOpen(provider)
  );
}

function classifierUnavailableError(message) {
  const error = new Error(message);
  error.isClassifierUnavailable = true;
  return error;
}

function isFallbackEligibleClassifierFailure(error) {
  const status = Number(
    error?.status ??
      error?.response?.status
  );

  const code = String(
    error?.code || ''
  );

  const message = String(
    error?.message ||
      error?.error?.message ||
      ''
  );

  if (
    error?.isQuotaExhausted ||
    error?.isBudgetExhausted ||
    error?.isModelMissing ||
    error?.isMalformedResponse
  ) {
    return true;
  }

  if (
    [401, 402, 403, 404, 408, 429].includes(status)
  ) {
    return true;
  }

  if (
    Number.isFinite(status) &&
    status >= 500 &&
    status <= 599
  ) {
    return true;
  }

  return (
    /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(code) ||
    /timeout|timed out|network|socket|fetch failed|connection reset/i.test(
      message
    )
  );
}
let groqRemainingRequests = Infinity;
let groqRemainingTokens = Infinity;
let groqResetRequestsMs = null;
let groqResetTokensMs = null;

const MAX_ARTICLE_AGE_MS = Number(process.env.MAX_ARTICLE_AGE_MS || 72 * 60 * 60 * 1000);
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE || 60);
const MIN_SEVERITY = Number(process.env.MIN_SEVERITY || 30);

// Immutable scoring provenance written with every newly classified event.
// Bump these whenever the classification contract or prompt semantics change.
const CLASSIFICATION_VERSION = 'event-severity-v1.0.5';
const CLASSIFICATION_PROMPT_VERSION = 'risk-desk-filter-v1.0.5';

function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

const ALLOWED_CATEGORIES = ['geopolitics', 'macro', 'rare_earth'];

const GEOPOLITICS_ANCHOR =
  /\b(war|warfare|armed conflict|armed clashes?|military|military attacks?|airstrikes?|missiles?|troops?|ceasefires?|nato|blockade|coup|junta|invasion|militias?|drone strikes?|drone attacks?|artillery|ground fighting|offensive|frontline|occupation|mobilization|nuclear weapons?|nuclear strike|nuclear facility|nuclear test|nuclear doctrine|hezbollah|houthi|irgc|idf|pla|battlefield|conscription|border clash|naval clash|cross-border fire|exchange(?:s|d)? fire|retaliat(?:e|es|ed|ion|ory)|territorial dispute|west bank|gaza|taiwan strait|south china sea|red sea shipping|strait of hormuz|sanctions?|embargo)\b/i;

const MACRO_ANCHOR =
  /\b(federal reserve|the fed|fed\b|central banks?|bank of england|boe\b|ecb\b|boj\b|rbi\b|pboc\b|imf\b|world bank|inflation|cpi\b|pce\b|interest rates?|rate cuts?|rate hikes?|monetary policy|sovereign debt|sovereign default|bond markets?|bond yields?|treasur(?:y|ies)|yield curve|recession|stagflation|economic downturn|economic slowdown|economic contraction|gdp\b|unemployment|payrolls?|house prices?|home prices?|property prices?|shop prices?|retail prices?|consumer prices?|price rises?|cost of living|financial hit|economic impact|economic cost|household costs?|household finances?|currency devaluation|devaluation|fiscal deficit|trade deficit|stimulus|liquidity|credit crunch|bank failure|opec\b|brent\b|wti\b|oil prices?|wholesale gas|gas stor(?:age|es)|lng\b|energy shock|energy crisis|tariffs?)\b/i;

const RARE_EARTH_ANCHOR =
  /\b(rare[- ]earths?|ree\b|rare[- ]earth elements?|critical minerals?|strategic minerals?|neodymium|praseodymium|dysprosium|terbium|ndfeb|permanent magnets?|gallium|germanium|antimony|tungsten|graphite|lithium|cobalt|nickel|lynas|mp materials|iluka)\b/i;

// Exclusion-only detector. Crypto is not an active Geomacro intelligence domain.
const CRYPTO_ANCHOR =
  /\b(bitcoin|btc\b|ethereum|ether\b|eth\b|cryptocurrenc(?:y|ies)|crypto\b|blockchain|stablecoins?|usdc\b|usdt\b|tether|depeg|defi\b|decentralized finance|digital assets?|tokeni[sz](?:e|ed|ation)|solana|xrp\b|ripple|binance|coinbase|kraken|mica\b|cbdc\b|tornado cash|crypto mixers?|on[- ]chain|onchain|web3)\b/i;

const ALLOW = {
  geopolitics: GEOPOLITICS_ANCHOR,
  macro: MACRO_ANCHOR,
  rare_earth: RARE_EARTH_ANCHOR,
};

const DENY =
  /\b(newsletter|op-?ed|opinion column|letter to the editor|celebrity|oscar|grammy|premier league|nba|nfl|hollywood|cosplay|canoe|lifestyle|recipe|horoscope|what to watch|obituary|country diary|bauhaus|households could save|switching to fixed|dupe brands|weight-loss|wedding|wed in)\b/i;

const CATEGORY_DENY = {
  rare_earth:
    /\b(anthropic|openai|semiconductor|tsmc|asml|chips act|datacent(?:er|re)|ai model|lawsuit against|blacklisting of)\b/i,

  geopolitics:
    /(?:\b(football|cricket|tennis|film festival|bauhaus|culture wars?|war on woke|war on dei|war on diversity|war on christmas|price war|bidding war)\b|^(?![\s\S]*\b(attack|attacked|airstrike|airstrikes|strike|strikes|missile|missiles|drone attack|drone strike|killed|wounded|casualties|combat|battle|invasion|blockade|sanction|sanctions|embargo|deployment|deploys|deployed|military operation|security incident|hostage|evacuation|coup|nuclear|ceasefire|territorial dispute)\b)[\s\S]*\b(shore leave|liberty call|crew rest|crew recreation|rest and recreation|routine port visit|routine port call|sailors? (?:on holiday|on vacation|visiting|touring|staying)|resort(?:s)? (?:prepares? to host|hosting) (?:navy |military )?(?:crew|sailors?)|hotel(?:s)? hosting (?:navy |military )?(?:crew|sailors?))\b)/i,

  macro:
    /\b(nft\b|memecoin|crypto winter|households could save|bank holiday getaway)\b/i,

};


/*
 * Fixed category ownership.
 *
 * A fetched article can NEVER be moved from one GRI domain to another.
 *
 * fetch bucket -> LLM agrees with exact bucket -> mandatory domain anchor
 * -> deterministic conflict check -> confidence/severity -> insert
 *
 * Cross-domain ambiguity fails closed instead of choosing a category.
 */
function categoryConflict(blob, category) {
  const hasRareEarth = RARE_EARTH_ANCHOR.test(blob);
  const hasCrypto = CRYPTO_ANCHOR.test(blob);

  switch (category) {
    case 'geopolitics':
      // Critical-mineral evidence belongs to rare_earth.
      // Crypto-native material is excluded from the intelligence taxonomy.
      if (hasRareEarth) return 'rare_earth';
      if (hasCrypto) return 'excluded_crypto';
      return null;

    case 'macro':
      // Crypto-native market/regulatory material must never leak into macro.
      if (hasRareEarth) return 'rare_earth';
      if (hasCrypto) return 'excluded_crypto';
      return null;

    case 'rare_earth':
      // Explicit mineral evidence owns this domain; crypto-native material
      // remains outside the active Geomacro taxonomy.
      if (hasCrypto) return 'excluded_crypto';
      return null;

    default:
      return 'invalid';
  }
}

const GUARDIAN_SECTIONS = {
  geopolitics: 'world|politics',
  macro: 'business|world|money',
  rare_earth: 'business|environment|world',
};

const GUARDIAN_QUERY_BUDGET_PER_CATEGORY = (() => {
  const parsed = Number(
    process.env.GUARDIAN_QUERY_BUDGET_PER_CATEGORY ||
      10
  );

  return (
    Number.isFinite(parsed) &&
    parsed > 0
  )
    ? Math.floor(parsed)
    : 10;
})();

const GUARDIAN_QUERY_ROTATION_HOURS = (() => {
  const parsed = Number(
    process.env.GUARDIAN_QUERY_ROTATION_HOURS ||
      2
  );

  return (
    Number.isFinite(parsed) &&
    parsed > 0
  )
    ? Math.floor(parsed)
    : 2;
})();

/*
 * Freeze the rotation clock once per ingestion process.
 *
 * Scheduled reruns within the same rotation window therefore select the
 * same Guardian query chunk instead of skipping coverage due to retries.
 */
const GUARDIAN_ROTATION_RUN_MS =
  Date.now();

function guardianQueryPlan(queries) {
  const allQueries =
    Array.isArray(queries)
      ? queries
      : [];

  if (!allQueries.length) {
    return {
      queries: [],
      totalQueries: 0,
      budget: 0,
      totalChunks: 0,
      chunkIndex: 0,
      startIndex: 0,
      endIndex: 0,
    };
  }

  const budget = Math.min(
    GUARDIAN_QUERY_BUDGET_PER_CATEGORY,
    allQueries.length
  );

  const totalChunks =
    Math.ceil(
      allQueries.length / budget
    );

  const guardianRotationSlot =
    Math.floor(
      GUARDIAN_ROTATION_RUN_MS /
        (
          GUARDIAN_QUERY_ROTATION_HOURS *
          60 *
          60 *
          1000
        )
    );

  const chunkIndex =
    guardianRotationSlot %
    totalChunks;

  const startIndex =
    chunkIndex * budget;

  const endIndex =
    Math.min(
      startIndex + budget,
      allQueries.length
    );

  return {
    queries:
      allQueries.slice(
        startIndex,
        endIndex
      ),
    totalQueries:
      allQueries.length,
    budget,
    totalChunks,
    chunkIndex,
    startIndex,
    endIndex,
  };
}

const RELIEFWEB_DISCOVERY_QUERIES = Object.freeze({
  geopolitics:
    'conflict war attack ceasefire displacement sanctions military humanitarian crisis',
});

const GDELT_DISCOVERY_QUERIES = Object.freeze({
  geopolitics:
    '(war OR military OR missile OR sanctions OR ceasefire OR coup OR blockade)',
  macro:
    '("interest rate" OR inflation OR recession OR "sovereign debt" OR tariff OR "bond yield")',
  rare_earth:
    '("rare earth" OR "critical minerals" OR lithium OR cobalt OR nickel OR gallium OR germanium)',
});

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

function markSeen(article, existingUrls, existingTitles, seenInCurrentRun) {
  const title = article.title || '';
  seenInCurrentRun.add(normalizeTitle(title));
  if (article.url) existingUrls.add(article.url);
  if (title) existingTitles.add(normalizeTitle(title));
}

function emptyAssessment(article) {
  return {
    relevant: false,
    category: 'none',
    severity: 0,
    confidence: 0,
    narrative: article.title,
    summary: article.description || article.title,
    ungrounded: true,
  };
}

function passesGates(article, assessment, fallbackCategory) {
  const title = stripHtml(article.title);
  const description = stripHtml(article.description);
  const blob = `${title} ${description}`;

  if (!ALLOWED_CATEGORIES.includes(fallbackCategory)) {
    return {
      ok: false,
      reason: `invalid fetch bucket "${fallbackCategory}"`,
    };
  }

  const assessedCategory =
    typeof assessment.category === 'string'
      ? assessment.category.trim().toLowerCase()
      : 'none';

  // The classifier must explicitly choose one canonical category.
  // Missing, malformed and "none" results fail closed.
  if (!ALLOWED_CATEGORIES.includes(assessedCategory)) {
    return {
      ok: false,
      reason: `bad category "${assessment.category}"`,
    };
  }

  // Permanent category ownership:
  // the model is NEVER allowed to reroute an event between GRI domains.
  if (assessedCategory !== fallbackCategory) {
    return {
      ok: false,
      reason: `category mismatch ${fallbackCategory}->${assessedCategory}`,
    };
  }

  const category = fallbackCategory;

  if (!assessment.relevant) {
    return {
      ok: false,
      reason: 'llm relevant=false',
    };
  }

  if (!isFresh(article.publishedAt)) {
    return {
      ok: false,
      reason: `stale ${article.publishedAt}`,
    };
  }

  if (DENY.test(blob)) {
    return {
      ok: false,
      reason: 'global deny',
    };
  }

  if (CATEGORY_DENY[category]?.test(blob)) {
    return {
      ok: false,
      reason: `${category} deny`,
    };
  }

  // Every GRI domain requires its own deterministic semantic anchor.
  // Generic regulator/market/supply-chain words cannot qualify by themselves.
  if (!ALLOW[category]?.test(blob)) {
    return {
      ok: false,
      reason: `${category} anchor miss`,
    };
  }

  // Reject deterministic cross-domain contamination.
  const conflict = categoryConflict(blob, category);

  if (conflict) {
    return {
      ok: false,
      reason: `cross-category conflict ${category}<->${conflict}`,
    };
  }

  if (Number(assessment.confidence) < MIN_CONFIDENCE) {
    return {
      ok: false,
      reason: `low confidence ${assessment.confidence}`,
    };
  }

  if (Number(assessment.severity) < MIN_SEVERITY) {
    return {
      ok: false,
      reason: `low severity ${assessment.severity}`,
    };
  }

  return {
    ok: true,
    category,
    title,
    description,
  };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseDurationToMs(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) * 1000;

  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!match) return null;

  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const secs = Number(match[3] || 0);
  const ms = ((hours * 3600) + (mins * 60) + secs) * 1000;
  return ms > 0 ? ms : null;
}

function readGroqQuota(response) {
  if (!response?.headers?.get) return;

  const remainingRequests = Number(response.headers.get('x-ratelimit-remaining-requests'));
  const remainingTokens = Number(response.headers.get('x-ratelimit-remaining-tokens'));
  const resetRequests = parseDurationToMs(response.headers.get('x-ratelimit-reset-requests'));
  const resetTokens = parseDurationToMs(response.headers.get('x-ratelimit-reset-tokens'));

  if (Number.isFinite(remainingRequests)) groqRemainingRequests = remainingRequests;
  if (Number.isFinite(remainingTokens)) groqRemainingTokens = remainingTokens;
  if (resetRequests != null) groqResetRequestsMs = resetRequests;
  if (resetTokens != null) groqResetTokensMs = resetTokens;
}

async function waitForGroqHeadroom(label) {
  const needWaitForRequests =
    Number.isFinite(groqRemainingRequests) &&
    groqRemainingRequests <= GROQ_MIN_REMAINING_REQUESTS;
  const needWaitForTokens =
    Number.isFinite(groqRemainingTokens) &&
    groqRemainingTokens <= GROQ_MIN_REMAINING_TOKENS;

  if (!needWaitForRequests && !needWaitForTokens) return;

  const resetMs = Math.max(
    needWaitForRequests ? (groqResetRequestsMs || 5000) : 0,
    needWaitForTokens ? (groqResetTokensMs || 5000) : 0
  );
  const waitMs = Math.min(resetMs + 1500, GROQ_MAX_WAIT_MS);

  if (resetMs > GROQ_MAX_WAIT_MS) {
    const quotaErr = new Error(
      `Groq quota too low for ${label} (req=${groqRemainingRequests}, tokens=${groqRemainingTokens}, reset=${Math.round(resetMs / 1000)}s)`
    );
    quotaErr.isQuotaExhausted = true;
    throw quotaErr;
  }

  console.log(
    `  ⚠️ Groq headroom low (req=${groqRemainingRequests}, tokens=${groqRemainingTokens}). Waiting ${Math.round(waitMs / 1000)}s for reset before ${label}.`
  );
  await delay(waitMs);
  groqRemainingRequests = Infinity;
  groqRemainingTokens = Infinity;
}

async function callGroqWithBackoff(fn, label) {
  if (groqRequestsThisRun >= GROQ_MAX_REQUESTS_PER_RUN) {
    const budgetErr = new Error(
      `Groq per-run budget exhausted (${GROQ_MAX_REQUESTS_PER_RUN} requests) — leaving quota for other services on this key.`
    );
    budgetErr.isBudgetExhausted = true;
    throw budgetErr;
  }

  await waitForGroqHeadroom(label);

  let attempt = 0;
  while (true) {
    try {
      groqRequestsThisRun++;
      const { data, response } = await fn();
      readGroqQuota(response);
      return data;
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const message = String(error?.message ?? error?.error?.message ?? '');
      const isModelMissing =
        status === 404 || /model_not_found|does not exist or you do not have access/i.test(message);
      if (isModelMissing) {
        const modelErr = new Error(`Groq model missing: ${message}`);
        modelErr.isModelMissing = true;
        throw modelErr;
      }
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
        error?.headers?.['retry-after'] ??
        error?.response?.headers?.get?.('retry-after');
      const headerReset =
        parseDurationToMs(error?.headers?.get?.('x-ratelimit-reset-tokens')) ||
        parseDurationToMs(error?.response?.headers?.get?.('x-ratelimit-reset-tokens'));
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;

      const backoff =
        headerReset ||
        (retryAfterMs && Number.isFinite(retryAfterMs) ? retryAfterMs : null) ||
        Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
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
      model: CEREBRAS_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
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


async function callOpenAICompatibleClassifier(
  provider,
  apiKey,
  model,
  prompt
) {
  const endpoint =
    provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://api.mistral.ai/v1/chat/completions';

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 900,
    response_format: {
      type: 'json_object',
    },
  };

  if (provider === 'gemini') {
    body.reasoning_effort = 'low';
  }

  if (provider === 'mistral') {
    body.temperature = 0.2;
  }

  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

  const rawBody =
    await response.text();

  if (!response.ok) {
    const error = new Error(
      `${provider} HTTP ${response.status}: ` +
        rawBody.slice(0, 500)
    );

    error.status = response.status;

    if (response.status === 429) {
      error.isQuotaExhausted = true;
    }

    if (response.status === 402) {
      error.isBudgetExhausted = true;
    }

    if (response.status === 404) {
      error.isModelMissing = true;
    }

    throw error;
  }

  let data;

  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `${provider} returned a non-JSON API envelope.`
    );
  }

  const content =
    data?.choices?.[0]?.message?.content;

  if (
    typeof content === 'string' &&
    content.trim()
  ) {
    return content;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        return (
          part?.text ||
          part?.content ||
          ''
        );
      })
      .join('')
      .trim();

    if (joined) {
      return joined;
    }
  }

  throw new Error(
    `${provider} returned no usable completion content.`
  );
}


function isGeminiModelFallbackFailure(error) {
  const status = Number(
    error?.status ??
      error?.response?.status
  );

  return Boolean(
    error?.isQuotaExhausted ||
    error?.isModelMissing ||
    [408, 429, 500, 502, 503, 504].includes(status)
  );
}

async function callGeminiWithModelFallback(
  apiKey,
  prompt
) {
  let lastError = null;

  for (const model of GEMINI_MODEL_ORDER) {
    try {
      const rawContent =
        await callOpenAICompatibleClassifier(
          'gemini',
          apiKey,
          model,
          prompt
        );

      return {
        rawContent,
        model,
      };
    } catch (error) {
      lastError = error;

      if (!isGeminiModelFallbackFailure(error)) {
        throw error;
      }

      console.log(
        `  ↪ Gemini model ${model} unavailable; trying next Gemini model.`
      );
    }
  }

  throw (
    lastError ||
    new Error(
      'No configured Gemini model is currently available.'
    )
  );
}

async function callClassifierProviderRaw(
  provider,
  prompt,
  groqPayload,
  articleCount
) {
  if (provider === 'groq') {
    const chatCompletion =
      await callGroqWithQuotaWait(
        async () => {
          const request =
            groq.chat.completions.create(
              groqPayload
            );

          if (
            typeof request.withResponse ===
            'function'
          ) {
            return await request.withResponse();
          }

          const data = await request;

          return {
            data,
            response: null,
          };
        },
        `batch-classify (${articleCount} articles)`
      );

    return (
      chatCompletion?.choices?.[0]
        ?.message?.content
    );
  }

  if (provider === 'gemini') {
    return callOpenAICompatibleClassifier(
      'gemini',
      process.env.GEMINI_API_KEY,
      GEMINI_MODEL,
      prompt
    );
  }

  if (provider === 'mistral') {
    return callOpenAICompatibleClassifier(
      'mistral',
      process.env.MISTRAL_API_KEY,
      MISTRAL_MODEL,
      prompt
    );
  }

  if (provider === 'cerebras') {
    return callCerebras(
      process.env.CEREBRAS_API_KEY,
      prompt
    );
  }

  throw new Error(
    `Unsupported classifier provider: ${provider}`
  );
}

function buildClassifyPrompt(articles, category) {
  const articlesBlock = articles
    .map(
      (a, i) =>
        `[${i}] Title: "${a.title}"\nDescription: "${(a.description || '').slice(0, 240)}"`
    )
    .join('\n\n');

  return `You are a strict risk-desk admission classifier.

FETCH BUCKET: "${category}"

Your job is NOT to move articles between categories.

For an article to be accepted:
1. relevant must be true.
2. category must equal the fetch bucket "${category}" exactly.
3. The article must materially belong to that GRI domain.
4. Cross-domain or ambiguous stories should be rejected with:
   relevant=false, category=none.

Allowed output categories:
geopolitics, macro, rare_earth, crypto, none

DOMAIN OWNERSHIP

GEOPOLITICS:
Only material interstate conflict, military/security escalation, armed conflict,
territorial confrontation, sanctions/embargoes, nuclear risk, blockade or
cross-border geopolitical coercion.

Domestic campaigning, mayoral politics, party messaging, culture wars,
metaphorical wars, sport and lifestyle are NOT geopolitics.
Routine military lifestyle/logistics are also NOT geopolitical risk by themselves.
Examples include shore leave, crew recreation, tourism, resort/hotel hosting,
routine port visits or human-interest stories about service personnel.
Military vocabulary alone is insufficient. Such an article is relevant only when
it reports a material conflict/security development such as an attack, operational
deployment change, escalation, sanctions, blockade, state coercion, nuclear risk,
territorial confrontation or another concrete strategic consequence.

MACRO:
Only material macroeconomic, monetary-policy, sovereign-credit, inflation,
interest-rate, central-bank, recession, currency, bond, systemic banking,
energy-price or broad economic risk.

Crypto-native events are NOT macro.
If Bitcoin, Ethereum, stablecoins, USDC, USDT, DeFi, crypto exchanges,
blockchain or other explicit crypto-native evidence is central to the article,
return none for the macro bucket.

RARE_EARTH:
Only material rare-earth / critical-mineral / strategic-mineral risk.

It requires an explicit mineral-domain anchor such as rare earths, REE,
critical minerals, strategic minerals, neodymium, praseodymium, dysprosium,
terbium, NdFeB/permanent magnets, gallium, germanium, antimony, tungsten,
graphite, lithium, cobalt, nickel, Lynas, MP Materials or Iluka.

Generic mining, refining, export controls, sanctions, defence supply chains,
AI, semiconductors and datacentres WITHOUT an explicit mineral-domain anchor
are NOT rare_earth.

EXCLUDED CRYPTO-NATIVE MATERIAL:
Crypto is not an active Geomacro intelligence category.

If Bitcoin, Ethereum, cryptocurrency, blockchain, stablecoins, USDC, USDT,
DeFi, crypto exchanges, token markets, CBDCs or other explicitly crypto-native
material is central to the article, return relevant=false, category=none.

Do not reassign crypto-native material into geopolitics, macro or rare_earth.
Geomacro rejects cross-domain ambiguity instead of allowing category drift.

GENERAL REJECTION RULES

Reject:
- opinion
- letters
- newsletters
- lifestyle
- culture
- sport
- historical commentary without new material risk
- generic political commentary
- unrelated domestic stories
- cross-category ambiguity

Severity and confidence must describe the supplied article only.
Do not invent missing facts.

You MUST return exactly ${articles.length} results with index 0 through ${articles.length - 1}.

Return JSON only:
{"results":[{"index":0,"relevant":true,"category":"${category}","severity":65,"confidence":75,"narrative":"...","summary":"..."}]}

Articles:
${articlesBlock}`;
}

function parseAssessments(rawContent, articles) {
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
        `  ⚠️ Batch classify: no grounded result for article [${i}] "${a.title}" — will retry solo.`
      );
      return emptyAssessment(a);
    }
    return {
      relevant: !!r.relevant,
      category: typeof r.category === 'string' ? r.category.trim().toLowerCase() : 'none',
      severity: Number.isFinite(r.severity) ? r.severity : 0,
      confidence: Number.isFinite(r.confidence) ? r.confidence : 50,
      narrative: stripHtml(r.narrative || a.title),
      summary: stripHtml(r.summary || a.description || a.title),
      ungrounded: false,
    };
  });
}

function parseGroqRetryMs(error) {
  const message = String(
    error?.message || ''
  );

  /*
   * Groq quota errors currently expose human-readable reset durations,
   * for example:
   *   "Please try again in 9m23.328s"
   *   "Please try again in 42.5s"
   *
   * Parse only bounded durations. Unknown formats fail closed.
   */
  const match = message.match(
    /please try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i
  );

  if (!match) {
    return null;
  }

  const minutes =
    Number(match[1] || 0);

  const seconds =
    Number(match[2] || 0);

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return null;
  }

  return (
    minutes * 60 * 1000 +
    seconds * 1000
  );
}

async function callGroqWithQuotaWait(
  fn,
  label
) {
  try {
    return await callGroqWithBackoff(
      fn,
      label
    );
  } catch (error) {
    if (!error?.isQuotaExhausted) {
      throw error;
    }

    const retryMs =
      parseGroqRetryMs(error);

    if (
      !retryMs ||
      retryMs <= 0 ||
      retryMs > GROQ_MAX_WAIT_MS
    ) {
      throw error;
    }

    const boundedWait =
      Math.ceil(retryMs) + 1500;

    console.log(
      `  ⏳ Groq quota reset is within the allowed wait window. ` +
      `Waiting ${Math.ceil(boundedWait / 1000)}s before one retry for ${label}.`
    );

    await delay(boundedWait);

    /*
     * Exactly one post-reset retry.
     * If quota is still unavailable, propagate the error and let the
     * provider circuit/fail-closed contract take over.
     */
    return await callGroqWithBackoff(
      fn,
      `${label} post-reset retry`
    );
  }
}

async function checkArticlesBatchRelevance(
  articles,
  category
) {
  const prompt =
    buildClassifyPrompt(
      articles,
      category
    );

  const groqPayload = {
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: GROQ_MODEL,
    temperature: 0.2,
    max_tokens: 900,
    response_format: {
      type: 'json_object',
    },
  };

  if (
    GROQ_MODEL.includes('gpt-oss') ||
    GROQ_MODEL.includes('o1') ||
    GROQ_MODEL.includes('o3')
  ) {
    groqPayload.reasoning_effort = 'low';
  }

  const classificationInputHash =
    sha256Text(prompt);

  let providerWasAttempted = false;

  for (
    const provider of
      CLASSIFIER_PROVIDER_ORDER
  ) {
    const apiKey =
      classifierApiKey(provider);

    if (
      !apiKey ||
      classifierCircuitOpen(provider)
    ) {
      continue;
    }

    providerWasAttempted = true;

    const model =
      classifierModel(provider);

    if (
      provider !==
      CLASSIFIER_PROVIDER_ORDER[0]
    ) {
      console.log(
        `  ↪ Using ${provider} fallback ${model}.`
      );
    }

    /*
     * One controlled retry is allowed only for malformed model output.
     * Transport/quota/auth/model failures move immediately to the next
     * configured provider after opening that provider's circuit.
     */
    for (
      let outputAttempt = 0;
      outputAttempt < 2;
      outputAttempt++
    ) {
      classifierProviderTelemetry(
        provider,
        'attempted'
      );

      try {
        const providerResult =
          provider === 'gemini'
            ? await callGeminiWithModelFallback(
                process.env.GEMINI_API_KEY,
                prompt
              )
            : {
                rawContent:
                  await callClassifierProviderRaw(
                    provider,
                    prompt,
                    groqPayload,
                    articles.length
                  ),
                model,
              };

        const rawContent =
          providerResult?.rawContent;

        const actualModel =
          providerResult?.model || model;

        let parsed;

        try {
          parsed =
            parseAssessments(
              rawContent,
              articles
            );
        } catch (parseError) {
          const malformed =
            new Error(
              `${provider} returned malformed classification JSON: ` +
                parseError.message
            );

          malformed.isMalformedResponse =
            true;

          throw malformed;
        }

        classifierProviderTelemetry(
          provider,
          'succeeded'
        );

        return parsed.map(
          (assessment) => ({
            ...assessment,
            classificationProvider:
              provider,
            classificationModel:
              actualModel,
            classificationVersion:
              CLASSIFICATION_VERSION,
            classificationPromptVersion:
              CLASSIFICATION_PROMPT_VERSION,
            classificationInputHash,
          })
        );
      } catch (error) {
        classifierProviderTelemetry(
          provider,
          'failed'
        );

        if (
          error?.isMalformedResponse &&
          outputAttempt === 0
        ) {
          console.log(
            `  ↻ ${provider} malformed-output retry.`
          );

          continue;
        }

        if (
          isFallbackEligibleClassifierFailure(
            error
          )
        ) {
          openClassifierCircuit(
            provider,
            error
          );

          console.log(
            `  ⚠️ ${provider} circuit opened for this run: ${error.message}`
          );

          break;
        }

        throw error;
      }
    }
  }

  classifierHealth.degraded = true;

  throw classifierUnavailableError(
    providerWasAttempted
      ? 'No healthy classification provider remains for this ingestion run.'
      : 'No configured classification provider has an API key.'
  );
}


async function assessWithRetry(articles, category) {
  /*
   * One call to this function is one logical classification batch.
   * Provider retries/fallbacks and solo grounding retries are internal
   * implementation details and must not double-count the logical batch.
   */
  classifierHealth.batchesAttempted++;
  classifierHealth.articlesAttempted += articles.length;

  try {
    const assessments =
      await checkArticlesBatchRelevance(
        articles,
        category
      );

    for (
      let i = 0;
      i < articles.length;
      i++
    ) {
      if (!assessments[i]?.ungrounded) {
        continue;
      }

      console.log(
        `  ↻ Solo retry: "${articles[i].title}"`
      );

      const solo =
        await checkArticlesBatchRelevance(
          [articles[i]],
          category
        );

      assessments[i] = solo[0];
    }

    classifierHealth.batchesCompleted++;
    classifierHealth.articlesClassified +=
      assessments.length;

    return assessments;
  } catch (error) {
    classifierHealth.batchesFailed++;
    classifierHealth.degraded = true;
    throw error;
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

function normalizePublisherName(domain) {
  const normalized = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');

  if (!normalized) return 'unknown';

  const parts = normalized.split('.').filter(Boolean);

  const commonSecondLevelSuffixes = new Set([
    'co.uk',
    'org.uk',
    'ac.uk',
    'com.au',
    'net.au',
    'org.au',
    'co.nz',
    'co.jp',
    'co.in',
    'com.br',
    'com.mx',
    'com.sg',
  ]);

  if (
    parts.length >= 3 &&
    commonSecondLevelSuffixes.has(
      parts.slice(-2).join('.')
    )
  ) {
    return parts[parts.length - 3]
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2]
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  return normalized;
}

function gdeltTimestamp(date) {
  const iso = date.toISOString();

  return (
    iso.slice(0, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    iso.slice(17, 19)
  );
}

function normalizeGdeltSeenDate(value) {
  const raw = String(value || '').trim();

  if (!raw) return null;

  const compact = raw.match(
    /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/
  );

  if (compact) {
    const [, y, m, d, hh, mm, ss] = compact;

    const iso =
      `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;

    return Number.isFinite(Date.parse(iso))
      ? iso
      : null;
  }

  const parsed = Date.parse(raw);

  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : null;
}

async function fetchGdacsArticles() {
  const endpoint =
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';

  const response = await fetch(endpoint, {
    headers: {
      'user-agent':
        'Geomacro/1.0 (+https://geomacro.live)',
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `GDACS HTTP ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  const features = Array.isArray(data.features)
    ? data.features
    : [];

  return features
    .map((feature) => {
      const properties =
        feature?.properties || {};

      const alertLevel =
        String(
          properties.alertlevel || ''
        )
          .trim()
          .toLowerCase();

      const isCurrent =
        String(
          properties.iscurrent || ''
        ).toLowerCase() === 'true' ||
        properties.iscurrent === true;

      const reportUrl =
        String(
          properties.url?.report || ''
        ).trim();

      const eventName =
        String(
          properties.name ||
          properties.description ||
          properties.eventname ||
          ''
        ).trim();

      const country =
        String(
          properties.country || ''
        ).trim();

      const eventType =
        String(
          properties.eventtype || ''
        ).trim();

      const title = stripHtml(
        [
          eventName,
          country
            ? `in ${country}`
            : '',
          alertLevel
            ? `(${alertLevel.toUpperCase()} GDACS alert)`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      );

      const publishedAt =
        properties.datemodified ||
        properties.todate ||
        properties.fromdate ||
        new Date().toISOString();

      return {
        title,
        description: stripHtml(
          properties.description ||
          properties.htmldescription ||
          ''
        ),
        url: reportUrl,
        publishedAt,
        source: 'GDACS',
        sourceDomain: 'gdacs.org',
        discoveryProvider: 'gdacs',

        gdacsAlertLevel: alertLevel,
        gdacsEventType: eventType,
        gdacsIsCurrent: isCurrent,
      };
    })
    .filter(
      (article) =>
        article.title &&
        article.url &&
        article.gdacsIsCurrent &&
        ['orange', 'red'].includes(
          article.gdacsAlertLevel
        ) &&
        isFresh(article.publishedAt)
    )
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt || 0) -
        Date.parse(a.publishedAt || 0)
    )
    .slice(0, GDACS_MAX_CANDIDATES);
}

async function fetchReliefWebArticles(query) {
  const endpoint =
    `https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(
      RELIEFWEB_APP_NAME
    )}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      limit: 25,
      preset: 'latest',
      query: {
        value: query,
        fields: ['title'],
        operator: 'OR',
      },
      fields: {
        include: [
          'title',
          'url',
          'origin',
          'date.created',
          'source.name',
          'source.shortname',
          'source.homepage',
          'primary_country.name',
        ],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `ReliefWeb HTTP ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  return (data.data || [])
    .map((item) => {
      const fields = item.fields || {};
      const sources = Array.isArray(fields.source)
        ? fields.source
        : [];

      const primarySource = sources[0] || {};

      /*
       * ReliefWeb is discovery infrastructure.
       * Prefer the information partner's original report URL.
       * If origin is absent, use that partner's homepage.
       * Never count reliefweb.int itself as the evidence publisher.
       */
      const originalUrl =
        String(fields.origin || '').trim() ||
        String(primarySource.homepage || '').trim();

      const sourceDomain =
        extractDomain(originalUrl);

      const sourceName =
        String(
          primarySource.shortname ||
          primarySource.name ||
          ''
        ).trim() ||
        normalizePublisherName(sourceDomain);

      return {
        title: stripHtml(fields.title || ''),
        description: '',
        url: originalUrl,
        publishedAt:
          fields.date?.created ||
          new Date().toISOString(),
        source: sourceName,
        sourceDomain,
        discoveryProvider: 'reliefweb',
      };
    })
    .filter(
      (article) =>
        article.title &&
        article.url &&
        article.sourceDomain &&
        article.sourceDomain !== 'reliefweb.int'
    );
}

async function waitForGdeltRateLimit() {
  const elapsed = Date.now() - gdeltLastRequestAt;
  const waitMs = GDELT_MIN_INTERVAL_MS - elapsed;

  if (waitMs > 0) {
    await delay(waitMs);
  }
}

async function fetchGdeltArticles(query) {
  providerTelemetry('gdelt', 'calls');

  await waitForGdeltRateLimit();

  const start = new Date(Date.now() - MAX_ARTICLE_AGE_MS);
  const end = new Date();

  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: '25',
    format: 'json',
    sort: 'HybridRel',
    startdatetime: gdeltTimestamp(start),
    enddatetime: gdeltTimestamp(end),
  });

  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

  let response = null;

  for (
    let attempt = 0;
    attempt <= NEWS_MAX_RETRIES;
    attempt++
  ) {
    await waitForGdeltRateLimit();

    response = await fetch(url);
    gdeltLastRequestAt = Date.now();

    if (response.status !== 429) {
      break;
    }

    providerTelemetry('gdelt', 'rateLimited');

    if (attempt >= NEWS_MAX_RETRIES) {
      throw new Error(
        `GDELT rate limit hit after ${attempt + 1} attempt(s)`
      );
    }

    /*
     * GDELT may throttle substantially longer than its nominal minimum
     * request interval. Respect Retry-After when supplied; otherwise use
     * exponential cooldown so repeated 429s do not hammer the endpoint.
     */
    const retryAfterHeader =
      response.headers?.get?.('retry-after');

    const retryAfterMs =
      retryAfterHeader &&
      Number.isFinite(
        Number(retryAfterHeader)
      )
        ? Number(retryAfterHeader) * 1000
        : null;

    const exponentialCooldown =
      Math.min(
        Math.max(
          GDELT_MIN_INTERVAL_MS * 2,
          12000
        ) *
          2 ** attempt,
        60000
      );

    const cooldown =
      retryAfterMs &&
      retryAfterMs > 0
        ? retryAfterMs
        : exponentialCooldown;

    await delay(cooldown);
  }

  if (!response?.ok) {
    throw new Error(
      `GDELT HTTP ${response?.status} ${response?.statusText}`
    );
  }

  const data = await response.json();

  return (data.articles || [])
    .map((article) => {
      const articleUrl = String(article.url || '').trim();
      const sourceDomain =
        extractDomain(articleUrl) ||
        String(article.domain || '').trim().toLowerCase();

      /*
       * GDELT is discovery infrastructure, not the evidence publisher.
       * Preserve the original article URL/domain as source provenance so
       * downstream GRI source caps measure independent publishers rather
       * than counting GDELT itself as a source.
       */
      return {
        title: stripHtml(article.title || ''),
        description: '',
        url: articleUrl,
        publishedAt:
          normalizeGdeltSeenDate(article.seendate) ||
          normalizeGdeltSeenDate(
            article.socialimage_lastupdate
          ) ||
          new Date().toISOString(),
        source: normalizePublisherName(sourceDomain),
        sourceDomain,
        discoveryProvider: 'gdelt',
      };
    })
    .filter(
      (article) =>
        article.title &&
        article.url &&
        article.sourceDomain
    );
}

async function fetchArticlesFromApis(query, categoryName) {
  const fromDate = new Date(Date.now() - MAX_ARTICLE_AGE_MS).toISOString().slice(0, 10);
  const articles = [];

  // Guardian is one source, not the sole primary source.
  providerTelemetry('guardian', 'calls');

  try {
    const sectionFilter = GUARDIAN_SECTIONS[categoryName];
    const sectionParam = sectionFilter ? `&section=${encodeURIComponent(sectionFilter)}` : '';
    const guardianUrl =
      `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}` +
      `&type=article${sectionParam}` +
      `&order-by=newest&from-date=${fromDate}` +
      `&show-fields=trailText&page-size=10` +
      `&api-key=${process.env.GUARDIAN_API_KEY}`;

    const response = await fetchWithBackoff(
      () => fetch(guardianUrl),
      `Guardian ("${query}")`
    );

    const data = await response.json();

    const guardianResponse =
      data?.response;

    if (
      guardianResponse?.status !== 'ok' ||
      !Array.isArray(
        guardianResponse?.results
      )
    ) {
      const payloadPreview =
        JSON.stringify(data).slice(0, 300);

      const error = new Error(
        `Guardian API invalid response for "${query}": ${payloadPreview}`
      );

      error.status =
        Number(response?.status) || null;

      throw error;
    }

    const guardianResults =
      guardianResponse.results;

    if (!guardianResults.length) {
      console.log(
        `   🔍 Guardian valid empty response for "${query}": ` +
          `${JSON.stringify(data).slice(0, 300)}`
      );
    }

    if (guardianResults.length) {
      articles.push(
        ...guardianResults.map((a) => ({
          title: stripHtml(a.webTitle),
          description: stripHtml(a.fields?.trailText || ''),
          url: a.webUrl,
          publishedAt: a.webPublicationDate || new Date().toISOString(),
          source: 'guardian',
          sourceDomain: extractDomain(a.webUrl),
          discoveryProvider: 'guardian',
        }))
      );
    }

    providerTelemetry('guardian', 'success');
    providerTelemetry(
      'guardian',
      'candidates',
      guardianResults.length
    );
  } catch (e) {
    providerTelemetry('guardian', 'failed');

    if (
      Number(e?.status) === 429 ||
      /429|rate limit/i.test(String(e?.message || ''))
    ) {
      providerTelemetry('guardian', 'rateLimited');
    }

    console.log(`   Guardian failed for query "${query}" (${e.message}).`);
  }

  // Remove exact duplicate URLs while preserving genuinely distinct publishers.
  const uniqueArticles = new Map();

  for (const article of articles) {
    const normalizedUrl = article.url
      ?.trim()
      .replace(/#.*$/, '')
      .replace(/\/$/, '');

    const normalizedTitle = article.title
      ?.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const key =
      normalizedUrl ||
      `${article.sourceDomain || 'unknown-source'}|${normalizedTitle || 'untitled'}`;

    if (!uniqueArticles.has(key)) {
      uniqueArticles.set(key, article);
    }
  }

  return [...uniqueArticles.values()];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


function deterministicReclassificationCategory(article) {
  const title = stripHtml(article.title);
  const description = stripHtml(article.description);
  const blob = `${title} ${description}`;

  // Existing-event reassessment is category-preserving.
  //
  // The immutable parent event owns its original GRI domain. A newer
  // classifier may accept or reject that event under the newer contract,
  // but it must never silently migrate the same event_id into another
  // category. This keeps classification provenance and immutable story
  // assignments category-consistent across contract versions.
  const priorCategory = String(
    article.sourceEvent?.category || article.category || ''
  )
    .trim()
    .toLowerCase();

  if (!ALLOWED_CATEGORIES.includes(priorCategory)) {
    return {
      category: null,
      reason: `invalid prior category "${priorCategory || 'missing'}"`,
      candidates: [],
    };
  }

  if (DENY.test(blob)) {
    return {
      category: null,
      reason: 'global deny',
      candidates: [],
    };
  }

  if (CATEGORY_DENY[priorCategory]?.test(blob)) {
    return {
      category: null,
      reason: `${priorCategory} deny`,
      candidates: [],
    };
  }

  if (!ALLOW[priorCategory]?.test(blob)) {
    return {
      category: null,
      reason: `${priorCategory} anchor miss`,
      candidates: [],
    };
  }

  const conflict = categoryConflict(blob, priorCategory);

  if (conflict) {
    return {
      category: null,
      reason: `cross-category conflict ${priorCategory}<->${conflict}`,
      candidates: [],
    };
  }

  return {
    category: priorCategory,
    reason: null,
    candidates: [priorCategory],
  };
}


async function fetchExistingCurrentAssessments() {
  const eventIds = new Set();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('gri_event_assessments')
      .select('event_id')
      .eq('classification_version', CLASSIFICATION_VERSION)
      .eq('classification_prompt_version', CLASSIFICATION_PROMPT_VERSION)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `failed to load existing GRI reassessments: ${error.message}`
      );
    }

    const rows = data ?? [];

    for (const row of rows) {
      if (row.event_id) eventIds.add(row.event_id);
    }

    if (rows.length < pageSize) break;
  }

  return eventIds;
}


async function fetchEventsForReclassification() {
  const cutoff = new Date(Date.now() - MAX_ARTICLE_AGE_MS).toISOString();
  const out = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select(
        [
          'id',
          'source_url',
          'source_title',
          'source_name',
          'source_domain',
          'description',
          'summary',
          'category',
          'severity',
          'confidence',
          'published_at',
          'created_at',
          'classification_version',
          'classification_prompt_version',
        ].join(',')
      )
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `failed to load events for GRI reassessment: ${error.message}`
      );
    }

    const rows = data ?? [];
    out.push(...rows);

    if (rows.length < pageSize) break;
  }

  return out;
}


async function insertImmutableReassessment(event, assessment, category) {
  const row = {
    event_id: event.id,

    category,
    severity: assessment.severity,
    confidence: assessment.confidence,
    narrative: stripHtml(assessment.narrative || event.source_title),
    summary: stripHtml(
      assessment.summary ||
        event.description ||
        event.summary ||
        event.source_title
    ),

    classification_provider: assessment.classificationProvider,
    classification_model: assessment.classificationModel,
    classification_version: assessment.classificationVersion,
    classification_prompt_version:
      assessment.classificationPromptVersion,
    classification_scored_at: new Date().toISOString(),
    classification_input_hash: assessment.classificationInputHash,

    prior_category: event.category,
    prior_classification_version:
      event.classification_version || 'legacy-unversioned',
    prior_classification_prompt_version:
      event.classification_prompt_version || null,

    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('gri_event_assessments')
    .insert([row]);

  if (!error) {
    return { inserted: true, duplicate: false };
  }

  if (
    String(error.code || '') === '23505' ||
    /duplicate key|unique constraint/i.test(String(error.message || ''))
  ) {
    return { inserted: false, duplicate: true };
  }

  throw new Error(
    `GRI reassessment insert failed for ${event.id}: ${error.message}`
  );
}


async function reclassifyExistingEvents() {
  console.log('');
  console.log('============================================================');
  console.log('GRI immutable existing-event reassessment');
  console.log(`Classifier: ${CLASSIFICATION_VERSION}`);
  console.log(`Prompt:     ${CLASSIFICATION_PROMPT_VERSION}`);
  console.log('Original public.events rows will NOT be modified.');
  console.log('============================================================');
  console.log('');

  const existingCurrentAssessments =
    await fetchExistingCurrentAssessments();

  const events = await fetchEventsForReclassification();

  const candidatesByCategory = new Map(
    ALLOWED_CATEGORIES.map((category) => [category, []])
  );

  let alreadyCanonical = 0;
  let alreadyReassessed = 0;
  let deterministicRejected = 0;

  for (const event of events) {
    const directCanonical =
      event.classification_version === CLASSIFICATION_VERSION &&
      event.classification_prompt_version ===
        CLASSIFICATION_PROMPT_VERSION;

    if (directCanonical) {
      alreadyCanonical++;
      continue;
    }

    if (existingCurrentAssessments.has(event.id)) {
      alreadyReassessed++;
      continue;
    }

    const article = {
      title: stripHtml(event.source_title),

      // Reclassification must never consume a previous model's narrative
      // or summary as if it were source evidence. Historical `summary`
      // can contain classifier interpretation, so successor assessment
      // starts from publisher-grounded title evidence only.
      //
      // Raw publisher descriptions can be added later through explicit
      // source refetch/provenance rather than inheriting old model output.
      description: '',

      url: event.source_url,
      publishedAt: event.published_at,
      source: event.source_name || 'unknown',
      sourceDomain: event.source_domain || extractDomain(event.source_url),
      sourceEvent: event,
    };

    if (!isFresh(article.publishedAt)) {
      deterministicRejected++;
      console.log(
        `  Reassessment skip (stale): "${article.title}"`
      );
      continue;
    }

    const route = deterministicReclassificationCategory(article);

    if (!route.category) {
      deterministicRejected++;
      console.log(
        `  Reassessment skip (${route.reason}): "${article.title}"`
      );
      continue;
    }

    candidatesByCategory.get(route.category).push(article);
  }

  console.log(
    `Loaded ${events.length} recent event(s): ` +
      `${alreadyCanonical} already canonical, ` +
      `${alreadyReassessed} already reassessed, ` +
      `${deterministicRejected} deterministically rejected.`
  );

  let inserted = 0;
  let llmRejected = 0;
  let duplicates = 0;
  let classificationFailures = 0;

  for (const category of ALLOWED_CATEGORIES) {
    const articles = candidatesByCategory.get(category) ?? [];

    if (articles.length === 0) {
      console.log(`Reassessment ${category}: 0 candidate(s).`);
      continue;
    }

    console.log(
      `Reassessment ${category}: ${articles.length} deterministic candidate(s).`
    );

    const batches = chunk(articles, BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      let assessments;

      try {
        assessments = await assessWithRetry(batch, category);
      } catch (error) {
        classificationFailures++;
        console.error(
          `  ❌ Reassessment classification failed for ${category}: ${error.message}`
        );
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const article = batch[i];
        const assessment = assessments[i];

        const gated = passesGates(
          article,
          assessment,
          category
        );

        if (!gated.ok) {
          llmRejected++;
          console.log(
            `  Reassessment rejected (${gated.reason}): "${article.title}"`
          );
          continue;
        }

        const result = await insertImmutableReassessment(
          article.sourceEvent,
          assessment,
          gated.category
        );

        if (result.duplicate) {
          duplicates++;
          console.log(
            `  Reassessment already exists: "${article.title}"`
          );
          continue;
        }

        inserted++;

        console.log(
          `  ✅ Reassessed [${gated.category}] "${article.title}" ` +
            `(prior=${article.sourceEvent.category}, ` +
            `severity=${assessment.severity}, ` +
            `confidence=${assessment.confidence})`
        );
      }

      if (batchIndex < batches.length - 1) {
        await delay(BATCH_DELAY_MS);
      }
    }
  }

  console.log('');
  console.log(
    `GRI reassessment done. Inserted=${inserted}, ` +
      `LLM/gate rejected=${llmRejected}, duplicates=${duplicates}, ` +
      `classification failures=${classificationFailures}.`
  );

  if (classificationFailures > 0) {
    throw new Error(
      `GRI reassessment incomplete: ${classificationFailures} classification batch(es) failed.`
    );
  }
}


async function ingestNews() {
  const dryRun =
    process.argv.includes('--dry-run');

  const reclassifyExisting =
    process.argv.includes('--reclassify-existing');

  if (dryRun && reclassifyExisting) {
    throw new Error(
      '--dry-run and --reclassify-existing cannot be combined because reclassification has its own immutable write path.'
    );
  }

  if (reclassifyExisting) {
    return reclassifyExistingEvents();
  }

  console.log('Run node scripts/ingest-news.js');

  if (dryRun) {
    console.log(
      '🧪 DRY RUN: classification and gates will run, but no event rows will be inserted.'
    );
  }
  console.log(
    `Classifier chain=${CLASSIFIER_PROVIDER_ORDER.join(' -> ')} | ` +
      `Groq=${GROQ_MODEL} | Gemini=${GEMINI_MODEL_ORDER.join(' -> ')} | ` +
      `Mistral=${MISTRAL_MODEL} | Cerebras=${CEREBRAS_MODEL} | ` +
      `batch=${BATCH_SIZE} | maxReq=${GROQ_MAX_REQUESTS_PER_RUN} | ` +
      `safeCandidatesPerCategory=${safeCandidatesPerCategory()} | ` +
      `requestReserve=${CLASSIFICATION_REQUEST_RESERVE} | ` +
      `minSeverity=${MIN_SEVERITY}`
  );

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
  const seenInCurrentRun = new Set();

  console.log(
    `${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`
  );

  let totalInserted = 0;
  let totalRejectedByGate = 0;
  let stopRun = false;

  for (const category of CATEGORIES) {
    if (stopRun) {
      console.log(
        'Skipping remaining categories because no healthy classification path remains.'
      );
      break;
    }

    console.log(`\nProcessing category: ${category.name}`);
    let categoryInserted = 0;

    // Candidate-level dedupe is scoped to this fetch bucket only.
    // Global seen state is reserved for successfully admitted events.
    // Therefore a rejection in one category cannot suppress a later
    // correct-category evaluation.
    const seenCandidatesThisCategory = new Set();

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

    const guardianPlan =
      guardianQueryPlan(
        category.queries
      );

    console.log(
      `  Guardian query budget: ` +
        `${guardianPlan.queries.length}/${guardianPlan.totalQueries} ` +
        `queries this run ` +
        `(chunk ${guardianPlan.chunkIndex + 1}/${guardianPlan.totalChunks}, ` +
        `max ${GUARDIAN_QUERY_BUDGET_PER_CATEGORY}/category).`
    );

    for (
      const [queryIndex, query] of
        guardianPlan.queries.entries()
    ) {
      const fetched =
        await fetchArticlesFromApis(
          query,
          category.name
        );

      for (const article of fetched) {
        const normTitle =
          normalizeTitle(
            article.title
          );

        if (
          !article.title ||
          !isFresh(article.publishedAt)
        ) {
          continue;
        }

        if (
          DENY.test(
            `${article.title} ${article.description}`
          )
        ) {
          continue;
        }

        if (
          existingUrls.has(article.url) ||
          existingTitles.has(normTitle) ||
          seenInCurrentRun.has(normTitle) ||
          seenCandidatesThisCategory.has(normTitle)
        ) {
          continue;
        }

        seenCandidatesThisCategory.add(
          normTitle
        );

        candidateArticles.push(
          article
        );
      }

      if (
        queryIndex <
        guardianPlan.queries.length - 1
      ) {
        await delay(
          QUERY_DELAY_MS
        );
      }
    }

    /*
     * Bounded GDACS disaster-intelligence pass.
     *
     * Only current Orange/Red alerts are admitted. GDACS is an
     * authoritative disaster-alert source, not a general news publisher.
     * The canonical classifier still decides whether an alert belongs in
     * the current GRI category contract.
     */
    if (
      category.name === 'geopolitics' &&
      GDACS_ENABLED
    ) {
      try {
        providerTelemetry('gdacs', 'calls');

        const gdacsArticles =
          await fetchGdacsArticles();

        providerTelemetry('gdacs', 'success');
        providerTelemetry(
          'gdacs',
          'candidates',
          gdacsArticles.length
        );

        let gdacsAcceptedCandidates = 0;

        for (const article of gdacsArticles) {
          const normTitle =
            normalizeTitle(article.title);

          if (
            existingUrls.has(article.url) ||
            existingTitles.has(normTitle) ||
            seenInCurrentRun.has(normTitle) ||
            seenCandidatesThisCategory.has(normTitle)
          ) {
            continue;
          }

          seenCandidatesThisCategory.add(
            normTitle
          );

          candidateArticles.push(article);
          gdacsAcceptedCandidates++;
        }

        console.log(
          `  GDACS discovery: ${gdacsArticles.length} high-severity current event(s), ` +
            `${gdacsAcceptedCandidates} new candidate(s) admitted.`
        );
      } catch (e) {
        providerTelemetry('gdacs', 'failed');

        if (
          Number(e?.status) === 429 ||
          /429|rate limit/i.test(String(e?.message || ''))
        ) {
          providerTelemetry('gdacs', 'rateLimited');
        }

        console.log(
          `  GDACS discovery failed (${e.message}).`
        );
      }
    }

    /*
     * Bounded ReliefWeb discovery pass.
     *
     * ReliefWeb is used only for humanitarian/conflict corroboration.
     * Original information-partner provenance remains the downstream
     * source identity.
     */
    const reliefWebQuery =
      RELIEFWEB_DISCOVERY_QUERIES[category.name];

    if (
      reliefWebQuery &&
      RELIEFWEB_ENABLED
    ) {
      try {
        providerTelemetry('reliefweb', 'calls');

        const reliefWebArticles =
          await fetchReliefWebArticles(
            reliefWebQuery
          );

        providerTelemetry('reliefweb', 'success');
        providerTelemetry(
          'reliefweb',
          'candidates',
          reliefWebArticles.length
        );

        let reliefWebAcceptedCandidates = 0;

        for (const article of reliefWebArticles) {
          const normTitle =
            normalizeTitle(article.title);

          if (
            !article.title ||
            !isFresh(article.publishedAt)
          ) {
            continue;
          }

          if (
            DENY.test(
              `${article.title} ${article.description}`
            )
          ) {
            continue;
          }

          if (
            existingUrls.has(article.url) ||
            existingTitles.has(normTitle) ||
            seenInCurrentRun.has(normTitle) ||
            seenCandidatesThisCategory.has(normTitle)
          ) {
            continue;
          }

          seenCandidatesThisCategory.add(normTitle);
          candidateArticles.push(article);
          reliefWebAcceptedCandidates++;
        }

        console.log(
          `  ReliefWeb discovery: ${reliefWebArticles.length} fetched, ` +
            `${reliefWebAcceptedCandidates} new candidate(s) admitted for ${category.name}.`
        );
      } catch (e) {
        providerTelemetry('reliefweb', 'failed');

        if (
          Number(e?.status) === 429 ||
          /429|rate limit/i.test(String(e?.message || ''))
        ) {
          providerTelemetry('reliefweb', 'rateLimited');
        }

        console.log(
          `  ReliefWeb discovery failed for ${category.name} (${e.message}).`
        );
      }
    }

    if (
      reliefWebQuery &&
      !RELIEFWEB_ENABLED
    ) {
      console.log(
        '  ReliefWeb discovery skipped: approved RELIEFWEB_APP_NAME not configured/enabled.'
      );
    }

    /*
     * Bounded GDELT discovery pass.
     *
     * GDELT is intentionally NOT called for every Guardian query. The DOC
     * API enforces a low request cadence, so each GRI category gets exactly
     * one compact discovery query per ingestion run.
     *
     * GDELT is discovery infrastructure only. Original publisher URL/domain
     * remains the evidence source used by downstream GRI source caps.
     */
    const gdeltQuery =
      GDELT_DISCOVERY_QUERIES[category.name];

    if (gdeltQuery) {
      try {
        const gdeltArticles =
          await fetchGdeltArticles(gdeltQuery);

        providerTelemetry('gdelt', 'success');
        providerTelemetry(
          'gdelt',
          'candidates',
          gdeltArticles.length
        );

        let gdeltAcceptedCandidates = 0;

        for (const article of gdeltArticles) {
          const normTitle =
            normalizeTitle(article.title);

          if (
            !article.title ||
            !isFresh(article.publishedAt)
          ) {
            continue;
          }

          if (
            DENY.test(
              `${article.title} ${article.description}`
            )
          ) {
            continue;
          }

          if (
            existingUrls.has(article.url) ||
            existingTitles.has(normTitle) ||
            seenInCurrentRun.has(normTitle) ||
            seenCandidatesThisCategory.has(normTitle)
          ) {
            continue;
          }

          seenCandidatesThisCategory.add(normTitle);
          candidateArticles.push(article);
          gdeltAcceptedCandidates++;
        }

        console.log(
          `  GDELT discovery: ${gdeltArticles.length} fetched, ` +
            `${gdeltAcceptedCandidates} new candidate(s) admitted for ${category.name}.`
        );
      } catch (e) {
        providerTelemetry('gdelt', 'failed');

        console.log(
          `  GDELT discovery failed for ${category.name} (${e.message}).`
        );
      }
    }

    candidateArticles.sort(
      (a, b) =>
        Date.parse(b.publishedAt || 0) -
        Date.parse(a.publishedAt || 0)
    );

    if (
      candidateArticles.length >
      safeCandidatesPerCategory()
    ) {
      const guardianCandidates =
        candidateArticles.filter(
          (article) =>
            article.discoveryProvider === 'guardian'
        );

      const gdeltCandidates =
        candidateArticles.filter(
          (article) =>
            article.discoveryProvider === 'gdelt'
        );

      const otherCandidates =
        candidateArticles.filter(
          (article) =>
            !['guardian', 'gdelt'].includes(
              article.discoveryProvider
            )
        );

      /*
       * Reserve up to one third of classification capacity for
       * independently discovered publishers without allowing GDELT
       * to crowd out the canonical Guardian lane.
       */
      const gdeltLimit = Math.min(
        gdeltCandidates.length,
        Math.max(
          1,
          Math.floor(
            safeCandidatesPerCategory() / 3
          )
        )
      );

      const remainingLimit =
        safeCandidatesPerCategory() - gdeltLimit;

      const primaryCandidates = [
        ...guardianCandidates,
        ...otherCandidates,
      ]
        .sort(
          (a, b) =>
            Date.parse(b.publishedAt || 0) -
            Date.parse(a.publishedAt || 0)
        )
        .slice(0, remainingLimit);

      candidateArticles = [
        ...primaryCandidates,
        ...gdeltCandidates.slice(0, gdeltLimit),
      ].sort(
        (a, b) =>
          Date.parse(b.publishedAt || 0) -
          Date.parse(a.publishedAt || 0)
      );

      console.log(
        `  Balanced candidate cap: ` +
          `${primaryCandidates.length} primary + ` +
          `${Math.min(gdeltCandidates.length, gdeltLimit)} GDELT-discovered ` +
          `= ${candidateArticles.length}/${safeCandidatesPerCategory()}.`
      );
    }

    const providerCounts =
      candidateArticles.reduce(
        (acc, article) => {
          const provider =
            article.discoveryProvider || 'unknown';

          acc[provider] =
            (acc[provider] || 0) + 1;

          return acc;
        },
        {}
      );

    console.log(
      `  ${candidateArticles.length} new unique candidate article(s) to classify. ` +
        `Providers=${JSON.stringify(providerCounts)}`
    );

    const batches = chunk(candidateArticles, BATCH_SIZE);
    for (const [batchIndex, batch] of batches.entries()) {
      let assessments;
      try {
        assessments = await assessWithRetry(batch, category.name);
      } catch (batchErr) {
        const noHealthyClassifier =
          !hasHealthyClassifierProvider();

        if (
          batchErr.isBudgetExhausted ||
          batchErr.isQuotaExhausted ||
          batchErr.isClassifierUnavailable ||
          noHealthyClassifier
        ) {
          console.error(
            `  🛑 ${batchErr.message} — stopping classification for this run. Remaining articles will be picked up next run.`
          );

          classifierHealth.degraded = true;
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

        const eventRow = {
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
          classification_provider: assessment.classificationProvider,
          classification_model: assessment.classificationModel,
          classification_version: assessment.classificationVersion,
          classification_prompt_version: assessment.classificationPromptVersion,
          classification_scored_at: new Date().toISOString(),
          classification_input_hash: assessment.classificationInputHash,
          published_at: article.publishedAt,
          market_created: false,
          created_at: new Date().toISOString(),
        };

        if (dryRun) {
          markSeen(
            article,
            existingUrls,
            existingTitles,
            seenInCurrentRun
          );

          console.log(
            `  🧪 WOULD INSERT [${gated.category}] ` +
              `"${gated.title}" ` +
              `(severity=${assessment.severity}, ` +
              `confidence=${assessment.confidence}, ` +
              `publisher=${article.sourceDomain || article.source}, ` +
              `discovery=${article.discoveryProvider || 'unknown'})`
          );

          categoryInserted++;
          totalInserted++;
          continue;
        }

        let { error: insertError } = await supabase.from('events').insert([eventRow]);

        // Safe rollout path: code may deploy before migration 004 reaches the
        // live Supabase schema. If PostgREST reports a missing audit/source
        // column, retry the exact event without the new optional provenance
        // fields rather than dropping ingestion. Migration 004 later marks
        // such rows legacy-unversioned instead of inventing metadata.
        if (insertError && /column|schema cache|classification_|source_domain/i.test(String(insertError.message || ''))) {
          const legacyCompatibleRow = { ...eventRow };
          for (const key of [
            'source_domain',
            'classification_provider',
            'classification_model',
            'classification_version',
            'classification_prompt_version',
            'classification_scored_at',
            'classification_input_hash',
          ]) {
            delete legacyCompatibleRow[key];
          }
          console.warn('  ⚠️ GRI audit columns not available yet — retrying legacy-compatible event insert.');
          ({ error: insertError } = await supabase.from('events').insert([legacyCompatibleRow]));
        }

        if (!insertError) {
          markSeen(article, existingUrls, existingTitles, seenInCurrentRun);

          console.log(
            `  ✅ Inserted [${gated.category}]: "${gated.title}" (severity ${assessment.severity}, delta ${delta})`
          );
          categoryInserted++;
          totalInserted++;
        } else {
          console.error(`  ❌ Database insertion failed:`, insertError.message);
        }
      }

      if (batchIndex < batches.length - 1) {
        await delay(BATCH_DELAY_MS);
      }
    }

    console.log(
      dryRun
        ? `Would insert ${categoryInserted} event(s) for ${category.name}.`
        : `Inserted ${categoryInserted} event(s) for ${category.name}.`
    );
  }

  console.log(
    dryRun
      ? `\nDone. Total unique would-insert: ${totalInserted} event(s).`
      : `\nDone. Total unique inserted: ${totalInserted} event(s).`
  );
  console.log(
    `Rejected by gate: ${totalRejectedByGate}. ` +
      `Groq requests this run: ${groqRequestsThisRun}.`
  );

  console.log('');
  console.log(
    '=== PROVIDER HEALTH ==='
  );
  console.log(
    JSON.stringify(
      providerHealth,
      null,
      2
    )
  );

  console.log('');
  console.log(
    '=== CLASSIFIER HEALTH ==='
  );
  console.log(
    JSON.stringify(
      classifierHealth,
      null,
      2
    )
  );

  const classifierCompletionRatio =
    classifierHealth.articlesAttempted > 0
      ? classifierHealth.articlesClassified /
        classifierHealth.articlesAttempted
      : 1;

  if (
    classifierHealth.degraded ||
    classifierCompletionRatio < 1
  ) {
    console.error(
      `❌ CLASSIFIER_DEGRADED: classified ` +
        `${classifierHealth.articlesClassified}/` +
        `${classifierHealth.articlesAttempted} attempted article(s).`
    );

    process.exitCode = 1;
  }
}

ingestNews().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
