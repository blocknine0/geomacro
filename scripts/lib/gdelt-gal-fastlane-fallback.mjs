import fetch from 'node-fetch';
import { gunzipSync } from 'node:zlib';

const GAL_BASE = 'https://storage.googleapis.com/data.gdeltproject.org/gdeltv3/gal';
const MAX_PROBE_MINUTES = 12;
const MAX_SOURCE_FILES = 3;
const DEFAULT_LOOKBACK_MINUTES = 35;
const DEFAULT_TIMEOUT_MS = 20_000;

const TOPIC_PATTERNS = Object.freeze({
  geopolitics: [
    /\bwar\b/i, /\bconflict\b/i, /\bmilitary\b/i, /\bmissile/i, /\bdrone/i,
    /\battack/i, /\bstrike/i, /\binvasion/i, /\bceasefire/i, /\bsanction/i,
    /\bcoup\b/i, /\bblockade\b/i, /\bprotest/i, /\bborder/i, /\bgeopolit/i,
    /\bnato\b/i, /\bexport control/i, /\btrade war\b/i, /\bembargo/i,
  ],
  macro: [
    /\binflation\b/i, /\bcpi\b/i, /\bppi\b/i, /\bgdp\b/i,
    /\bgross domestic product\b/i, /\binterest rate/i, /\brate cut/i,
    /\brate hike/i, /\bcentral bank/i, /\bmonetary policy/i,
    /\bfederal reserve\b/i, /\becb\b/i, /\bbank of england\b/i,
    /\bbank of japan\b/i, /\brbi\b/i, /\bunemployment\b/i, /\bpayroll/i,
    /\bjobs report\b/i, /\bpmi\b/i, /\brecession\b/i, /\bsovereign debt\b/i,
    /\bbond yield/i, /\bfiscal\b/i, /\bbudget\b/i, /\btrade balance\b/i,
    /\bcurrent account\b/i, /\bcurrency\b/i, /\bforeign exchange\b/i,
    /\bforex\b/i, /\bcapital control/i, /\bbanking crisis\b/i, /\bdefault\b/i,
    /\btariff/i,
  ],
  rare_earth: [
    /\brare earth/i, /\bcritical mineral/i, /\bneodymium\b/i,
    /\bpraseodymium\b/i, /\bdysprosium\b/i, /\bterbium\b/i, /\byttrium\b/i,
    /\blanthanum\b/i, /\bcerium\b/i, /\bsamarium\b/i, /\beuropium\b/i,
    /\bgadolinium\b/i, /\bndpr\b/i, /\bndfeb\b/i, /\bpermanent magnet/i,
    /\brare-earth oxide/i, /\brare earth oxide/i, /\brare-earth metal/i,
    /\brare earth metal/i, /\bmineral processing\b/i, /\bmineral refining\b/i,
    /\bseparation plant\b/i, /\bstrategic mineral/i, /\bgallium\b/i,
    /\bgermanium\b/i, /\blithium\b/i, /\bcobalt\b/i, /\bnickel\b/i,
  ],
});

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

function candidateStamps(now, lookbackMinutes) {
  const out = [];
  const boundedLookback = Math.max(1, Math.min(DEFAULT_LOOKBACK_MINUTES, Number(lookbackMinutes) || DEFAULT_LOOKBACK_MINUTES));
  for (let i = 1; i <= boundedLookback && out.length < MAX_PROBE_MINUTES; i += 1) {
    out.push(utcMinuteStamp(new Date(now.getTime() - i * 60_000)));
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

function rowMatchesCategory(row, categoryName) {
  const patterns = TOPIC_PATTERNS[categoryName] || [];
  const text = [row?.title, row?.desc, row?.domain, row?.outletName].filter(Boolean).join(' ');
  return patterns.some((pattern) => pattern.test(text));
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
    headers: { 'user-agent': 'Geomacro-Current-Scoring-Fastlane/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GDELT_GAL_HTTP_${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  return { stamp, sourceUrl, text: gunzipSync(compressed).toString('utf8') };
}

export async function fetchGdeltGalFastlaneArticles({
  categoryName,
  maxArticleAgeMs,
  maxCandidates = 2,
  now = new Date(),
  lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!TOPIC_PATTERNS[categoryName]) throw new Error(`GDELT_GAL_CATEGORY_UNSUPPORTED:${categoryName}`);
  const boundedMax = Math.max(1, Math.min(5, Number(maxCandidates) || 2));
  const stamps = candidateStamps(now, lookbackMinutes);
  const settled = await Promise.allSettled(stamps.map((stamp) => fetchGalFile(stamp, timeoutMs)));
  const files = settled
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)
    .sort((a, b) => b.stamp.localeCompare(a.stamp))
    .slice(0, MAX_SOURCE_FILES);

  const seen = new Set();
  const articles = [];
  const freshnessMs = Math.max(60_000, Number(maxArticleAgeMs) || 6 * 60 * 60 * 1000);

  for (const file of files) {
    for (const line of file.text.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (!row?.url || !row?.title || !rowMatchesCategory(row, categoryName)) continue;
      const url = normalizeUrl(row.url);
      if (!url || seen.has(url)) continue;
      const publishedAt = realPublishedAt(row, file.stamp);
      const publishedMs = Date.parse(String(publishedAt || ''));
      if (!Number.isFinite(publishedMs) || now.getTime() - publishedMs > freshnessMs || publishedMs - now.getTime() > 5 * 60_000) continue;
      const sourceDomain = domainFromUrl(url) || String(row.domain || '').trim().toLowerCase();
      if (!sourceDomain) continue;
      seen.add(url);
      articles.push({
        title: String(row.title).trim(),
        description: String(row.desc || '').trim(),
        url,
        publishedAt,
        source: String(row.outletName || '').trim() || publisherName(sourceDomain),
        sourceDomain,
        discoveryProvider: 'gdelt_gal',
        gdeltGalSourceStamp: file.stamp,
      });
      if (articles.length >= boundedMax) return articles;
    }
  }

  return articles;
}
