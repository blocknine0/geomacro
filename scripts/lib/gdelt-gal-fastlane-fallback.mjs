import fetch from 'node-fetch';
import { gunzipSync } from 'node:zlib';

const GAL_BASE = 'https://storage.googleapis.com/data.gdeltproject.org/gdeltv3/gal';
const MAX_PROBE_REQUESTS = 60;
const MAX_PARALLEL_PROBES = 6;
const DEFAULT_LOOKBACK_MINUTES = 300;
const DEFAULT_TIMEOUT_MS = 8_000;
const HEARTBEAT_MINUTES = 15;
const HEARTBEAT_OFFSETS = Object.freeze([1, 2, 3, 4, 5]);
const MIN_TOPIC_SCORE = 3;

const STRONG_TOPIC_PATTERNS = Object.freeze({
  geopolitics: [
    /\bwar\b/i, /\bconflict\b/i, /\bmilitary\b/i, /\bmissile/i, /\bdrone/i,
    /\battack/i, /\bstrike/i, /\binvasion/i, /\bceasefire/i, /\bsanction/i,
    /\bcoup\b/i, /\bblockade\b/i, /\bprotest/i, /\bborder/i, /\bgeopolit/i,
    /\bnato\b/i, /\bexport control/i, /\btrade war\b/i, /\bembargo/i,
  ],
  macro: [
    /\binflation\b/i, /\bcpi\b/i, /\bppi\b/i, /\bgdp\b/i,
    /\bgross domestic product\b/i, /\binterest rates?\b/i, /\brate cuts?\b/i,
    /\brate hikes?\b/i, /\bcentral banks?\b/i, /\bmonetary policy\b/i,
    /\bfederal reserve\b/i, /\becb\b/i, /\bbank of england\b/i,
    /\bbank of japan\b/i, /\brbi\b/i, /\bunemployment\b/i, /\bpayroll/i,
    /\bjobs report\b/i, /\bpmi\b/i, /\brecession\b/i, /\bsovereign debt\b/i,
    /\bbond yields?\b/i, /\btrade balance\b/i, /\bcurrent account\b/i,
    /\bforeign exchange\b/i, /\bforex\b/i, /\bcapital controls?\b/i,
    /\bbanking crisis\b/i, /\bsovereign default\b/i, /\btariffs?\b/i,
    /\bfiscal (?:policy|deficit|spending|balance|rules?|reform|risk|pressure)\b/i,
    /\bbudget (?:deficit|surplus|spending|plan|bill|cuts?|gap)\b/i,
    /\bcurrency (?:crisis|devaluation|intervention|reserve|weakness|strength)\b/i,
  ],
  rare_earth: [
    /\brare[- ]earth/i, /\bcritical minerals?\b/i, /\bneodymium\b/i,
    /\bpraseodymium\b/i, /\bdysprosium\b/i, /\bterbium\b/i, /\byttrium\b/i,
    /\blanthanum\b/i, /\bcerium\b/i, /\bsamarium\b/i, /\beuropium\b/i,
    /\bgadolinium\b/i, /\bndpr\b/i, /\bndfeb\b/i, /\bpermanent magnets?\b/i,
    /\brare[- ]earth oxides?\b/i, /\brare[- ]earth metals?\b/i,
    /\bmineral processing\b/i, /\bmineral refining\b/i, /\bseparation plants?\b/i,
    /\bstrategic minerals?\b/i, /\bgallium\b/i, /\bgermanium\b/i,
  ],
});

const BROAD_RARE_EARTH_PATTERNS = Object.freeze([
  /\blithium\b/i, /\bcobalt\b/i, /\bnickel\b/i, /\bgraphite\b/i,
]);

const MINERAL_CONTEXT_PATTERNS = Object.freeze([
  /\bmine\b/i, /\bmining\b/i, /\bminerals?\b/i, /\bore\b/i, /\brefin/i,
  /\bprocessing\b/i, /\bsmelt/i, /\bsupply chain\b/i, /\bexport/i,
  /\bimport/i, /\bproduction\b/i, /\bproducer\b/i, /\breserves?\b/i,
  /\bprices?\b/i, /\bdemand\b/i, /\bshortage\b/i, /\bproject\b/i,
]);

function utcMinuteStamp(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    '00',
  ].join('');
}

function stampToIso(stamp) {
  const date = new Date(Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
    Number(stamp.slice(8, 10)),
    Number(stamp.slice(10, 12)),
    0,
  ));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function floorToHeartbeat(date) {
  const floored = new Date(date);
  floored.setUTCSeconds(0, 0);
  floored.setUTCMinutes(Math.floor(floored.getUTCMinutes() / HEARTBEAT_MINUTES) * HEARTBEAT_MINUTES);
  return floored;
}

export function candidateStamps(now = new Date(), lookbackMinutes = DEFAULT_LOOKBACK_MINUTES) {
  const nowMs = now.getTime();
  const boundedLookback = Math.max(15, Math.min(DEFAULT_LOOKBACK_MINUTES, Number(lookbackMinutes) || DEFAULT_LOOKBACK_MINUTES));
  const oldestMs = nowMs - boundedLookback * 60_000;
  const out = [];
  const seen = new Set();

  const add = (date) => {
    const ms = date.getTime();
    if (ms >= nowMs || ms < oldestMs || out.length >= MAX_PROBE_REQUESTS) return;
    const stamp = utcMinuteStamp(date);
    if (!seen.has(stamp)) {
      seen.add(stamp);
      out.push(stamp);
    }
  };

  // Cover the immediate edge first, then every minute in the known GDELT post-heartbeat cluster.
  for (let minuteAgo = 1; minuteAgo <= 6; minuteAgo += 1) {
    add(new Date(nowMs - minuteAgo * 60_000));
  }

  for (
    let heartbeat = floorToHeartbeat(now);
    heartbeat.getTime() >= oldestMs && out.length < MAX_PROBE_REQUESTS;
    heartbeat = new Date(heartbeat.getTime() - HEARTBEAT_MINUTES * 60_000)
  ) {
    for (const offset of HEARTBEAT_OFFSETS) {
      add(new Date(heartbeat.getTime() + offset * 60_000));
    }
  }

  return out;
}

function normalizeUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || ['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src'].includes(lower)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname !== '/' && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(raw) {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function publisherName(domain) {
  const parts = String(domain || '').split('.').filter(Boolean);
  return parts.length >= 2 ? parts.at(-2).replace(/[-_]+/g, ' ') : String(domain || 'unknown');
}

function countMatches(text, patterns) {
  let count = 0;
  for (const pattern of patterns) if (pattern.test(text)) count += 1;
  return count;
}

export function scoreTopicEvidence(row, categoryName) {
  const title = String(row?.title || '').trim();
  const description = String(row?.desc || '').trim();
  const strong = STRONG_TOPIC_PATTERNS[categoryName] || [];
  let score = countMatches(title, strong) * 4 + countMatches(description, strong) * 2;

  if (categoryName === 'rare_earth') {
    const broadTitle = countMatches(title, BROAD_RARE_EARTH_PATTERNS);
    const broadDescription = countMatches(description, BROAD_RARE_EARTH_PATTERNS);
    const contextText = `${title} ${description}`;
    const context = countMatches(contextText, MINERAL_CONTEXT_PATTERNS);
    if (broadTitle > 0 && context > 0) score += broadTitle * 3 + Math.min(2, context);
    if (broadDescription > 0 && context > 1) score += broadDescription + 1;
  }

  return score;
}

function realPublishedAt(row, sourceStamp) {
  const candidates = [row?.date, row?.seendate, row?.seenDate, row?.publishedAt, row?.published_at];
  for (const candidate of candidates) {
    const parsed = Date.parse(String(candidate || ''));
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  // Fall back only to the real upstream GAL file minute, never wall-clock now.
  return stampToIso(sourceStamp);
}

async function fetchGalFile(stamp, timeoutMs) {
  const sourceUrl = `${GAL_BASE}/${stamp}.gal.json.gz`;
  const response = await fetch(sourceUrl, {
    headers: { 'user-agent': 'Geomacro-Current-Scoring-Fastlane/1.1' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GDELT_GAL_HTTP_${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  return { stamp, sourceUrl, text: gunzipSync(compressed).toString('utf8') };
}

function collectRelevantArticles(file, categoryName, now, freshnessMs, seen) {
  const found = [];
  for (const line of file.text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!row?.url || !row?.title) continue;
    const topicScore = scoreTopicEvidence(row, categoryName);
    if (topicScore < MIN_TOPIC_SCORE) continue;
    const url = normalizeUrl(row.url);
    if (!url || seen.has(url)) continue;
    const publishedAt = realPublishedAt(row, file.stamp);
    const publishedMs = Date.parse(String(publishedAt || ''));
    if (!Number.isFinite(publishedMs) || now.getTime() - publishedMs > freshnessMs || publishedMs - now.getTime() > 5 * 60_000) continue;
    const sourceDomain = domainFromUrl(url) || String(row.domain || '').trim().toLowerCase();
    if (!sourceDomain) continue;
    seen.add(url);
    found.push({
      title: String(row.title).trim(),
      description: String(row.desc || '').trim(),
      url,
      publishedAt,
      source: String(row.outletName || '').trim() || publisherName(sourceDomain),
      sourceDomain,
      discoveryProvider: 'gdelt_gal',
      gdeltGalSourceStamp: file.stamp,
      topicScore,
    });
  }
  return found;
}

export async function fetchGdeltGalFastlaneArticles({
  categoryName,
  maxArticleAgeMs,
  maxCandidates = 2,
  now = new Date(),
  lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!STRONG_TOPIC_PATTERNS[categoryName]) throw new Error(`GDELT_GAL_CATEGORY_UNSUPPORTED:${categoryName}`);
  const boundedMax = Math.max(1, Math.min(5, Number(maxCandidates) || 2));
  const freshnessMs = Math.max(60_000, Number(maxArticleAgeMs) || 6 * 60 * 60 * 1000);
  const effectiveLookbackMinutes = Math.min(
    DEFAULT_LOOKBACK_MINUTES,
    Math.max(15, Math.ceil(freshnessMs / 60_000), Number(lookbackMinutes) || DEFAULT_LOOKBACK_MINUTES),
  );
  const stamps = candidateStamps(now, effectiveLookbackMinutes);
  const seen = new Set();
  const candidates = [];

  for (let start = 0; start < stamps.length; start += MAX_PARALLEL_PROBES) {
    const batch = stamps.slice(start, start + MAX_PARALLEL_PROBES);
    const settled = await Promise.allSettled(batch.map((stamp) => fetchGalFile(stamp, timeoutMs)));
    const files = settled
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value)
      .sort((a, b) => b.stamp.localeCompare(a.stamp));

    for (const file of files) {
      candidates.push(...collectRelevantArticles(file, categoryName, now, freshnessMs, seen));
    }

    if (candidates.length >= Math.max(boundedMax * 3, 6)) break;
  }

  candidates.sort((a, b) => {
    if (b.topicScore !== a.topicScore) return b.topicScore - a.topicScore;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });

  return candidates.slice(0, boundedMax).map(({ topicScore: _topicScore, ...article }) => article);
}
