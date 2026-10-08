const TRUSTED_TIMESTAMP_HOSTS_BY_SOURCE = new Map<string, ReadonlySet<string>>([
  [
    "xinhua_english_china_rss",
    new Set([
      "english.news.cn",
      "www.xinhuanet.com",
      "xinhuanet.com",
    ]),
  ],
  [
    "scmp_china_rss",
    new Set([
      "www.scmp.com",
      "scmp.com",
    ]),
  ],
  [
    "bbc_world_rss",
    new Set([
      "www.bbc.co.uk",
      "bbc.co.uk",
      "www.bbc.com",
      "bbc.com",
    ]),
  ],
  [
    "aljazeera_rss",
    new Set([
      "www.aljazeera.com",
      "aljazeera.com",
    ]),
  ],
  [
    "forexlive_rss",
    new Set([
      "investinglive.com",
      "www.investinglive.com",
    ]),
  ],
]);

const TRUSTED_TIMESTAMP_HOSTS = new Set(
  [...TRUSTED_TIMESTAMP_HOSTS_BY_SOURCE.values()].flatMap((hosts) => [...hosts]),
);

const PUBLISHED_META_KEYS = new Set([
  "article:published_time",
  "datepublished",
  "date_published",
  "pubdate",
  "publishdate",
  "publish_date",
  "release_date",
  "og:release_date",
]);

export const FEDERICO_SOURCE_TIME_MAX_AGE_HOURS = 24;
export const FEDERICO_SOURCE_TIME_MAX_FUTURE_SKEW_MINUTES = 10;

export function isTrustedFedericoTimestampUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && TRUSTED_TIMESTAMP_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isTrustedFedericoTimestampUrlForSource(
  sourceId: string,
  value: string,
) {
  try {
    const url = new URL(value);
    const hosts = TRUSTED_TIMESTAMP_HOSTS_BY_SOURCE.get(sourceId);
    return Boolean(
      hosts &&
      url.protocol === "https:" &&
      hosts.has(url.hostname.toLowerCase()),
    );
  } catch {
    return false;
  }
}

const SCMP_CANONICAL_ARTICLE_SECTIONS = new Set([
  "news",
  "economy",
  "opinion",
  "business",
  "tech",
  "lifestyle",
  "sport",
  "week-asia",
]);

export function trustedFedericoTimestampFetchUrlForSource(
  sourceId: string,
  value: string,
) {
  if (!isTrustedFedericoTimestampUrlForSource(sourceId, value)) return null;

  const url = new URL(value);
  url.hash = "";
  url.search = "";

  // SCMP RSS can emit /plus/<section>/... wrappers that do not expose the
  // publisher-native timestamp even though the same publisher serves the
  // canonical article at /<section>/.... Timestamp hydration may fetch only
  // that same-host canonical article route. The stored source URL, source ID,
  // provenance and signed evidence binding remain unchanged.
  if (sourceId === "scmp_china_rss" && url.pathname.startsWith("/plus/")) {
    const section = url.pathname.split("/").filter(Boolean)[1] ?? "";
    if (SCMP_CANONICAL_ARTICLE_SECTIONS.has(section)) {
      url.pathname = url.pathname.replace(/^\/plus(?=\/)/, "");
    }
  }

  return url.toString();
}

function parseMetaAttributes(tag: string) {
  const attrs = new Map<string, string>();
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const match of tag.matchAll(pattern)) {
    const name = String(match[1] ?? "").toLowerCase();
    const value = String(match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (name && value) attrs.set(name, value);
  }

  return attrs;
}

function hasExplicitTimeOfDay(value: string) {
  return /(?:T|\s)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?/.test(value);
}

function isBbcTimestampUrl(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return (
      hostname === "www.bbc.co.uk" ||
      hostname === "bbc.co.uk" ||
      hostname === "www.bbc.com" ||
      hostname === "bbc.com"
    );
  } catch {
    return false;
  }
}

function decodeMinimalXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function canonicalBbcArticlePath(value: string) {
  try {
    const url = new URL(value);
    if (!isBbcTimestampUrl(url.toString())) return null;
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

export function extractTrustedBbcRssPublishedAt(
  rssXml: string,
  articleUrl: string,
  asOf: Date = new Date(),
) {
  const targetPath = canonicalBbcArticlePath(articleUrl);
  if (!targetPath) return null;

  // This parser is intentionally narrow: only BBC item/link/pubDate triples
  // can contribute. No feed fetch time, item order, or seen time is accepted
  // as publication evidence.
  for (const match of rssXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = match[1] ?? "";
    const linkMatch = item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const pubDateMatch = item.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i);
    if (!linkMatch?.[1] || !pubDateMatch?.[1]) continue;

    const link = decodeMinimalXmlText(linkMatch[1]);
    if (canonicalBbcArticlePath(link) !== targetPath) continue;

    const pubDate = decodeMinimalXmlText(pubDateMatch[1]);
    return validateTimestamp(pubDate, articleUrl, asOf);
  }

  return null;
}

function isXinhuaTimestampUrl(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return (
      hostname === "english.news.cn" ||
      hostname === "www.xinhuanet.com" ||
      hostname === "xinhuanet.com"
    );
  } catch {
    return false;
  }
}

function normalizeTimestampCandidate(raw: string, sourceUrl: string) {
  const value = raw.trim();
  if (!value || !hasExplicitTimeOfDay(value)) return null;

  const timezoneLess =
    /^(?:\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value);

  // Only Xinhua's English article pages are allowed to interpret a precise
  // timezone-less publisher wall clock as China Standard Time. Other trusted
  // publishers must supply an explicit offset/zone; we never infer one.
  if (timezoneLess) {
    if (!isXinhuaTimestampUrl(sourceUrl)) return null;
    return `${value.replace(" ", "T")}+08:00`;
  }

  return value;
}

function validateTimestamp(
  raw: string,
  sourceUrl: string,
  asOf: Date,
) {
  const normalized = normalizeTimestampCandidate(raw, sourceUrl);
  if (!normalized) return null;

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;

  const futureLimit =
    asOf.getTime() +
    FEDERICO_SOURCE_TIME_MAX_FUTURE_SKEW_MINUTES * 60_000;
  const oldestAllowed =
    asOf.getTime() -
    FEDERICO_SOURCE_TIME_MAX_AGE_HOURS * 3_600_000;

  if (timestamp > futureLimit || timestamp < oldestAllowed) return null;

  return new Date(timestamp).toISOString();
}

export function extractTrustedPublishedAt(
  html: string,
  sourceUrl: string,
  asOf: Date = new Date(),
) {
  if (!isTrustedFedericoTimestampUrl(sourceUrl)) return null;

  const candidates: string[] = [];

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseMetaAttributes(match[0]);
    const key = String(
      attrs.get("property") ??
      attrs.get("name") ??
      attrs.get("itemprop") ??
      "",
    ).toLowerCase();
    const content = attrs.get("content") ?? "";

    if (PUBLISHED_META_KEYS.has(key) && content) {
      candidates.push(content);
    }
  }

  for (const match of html.matchAll(/"datePublished"\s*:\s*"([^"]+)"/gi)) {
    if (match[1]) candidates.push(match[1]);
  }

  // Xinhua's rendered article header visibly carries a timezone-less local
  // publication timestamp. This fallback is Xinhua-only; adding other trusted
  // hosts must never make an arbitrary body timestamp publication evidence.
  if (isXinhuaTimestampUrl(sourceUrl)) {
    const leadingHtml = html.slice(0, 120_000);
    for (const match of leadingHtml.matchAll(/\b(20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\b/g)) {
      if (match[1]) candidates.push(match[1]);
    }
  }

  for (const candidate of candidates) {
    const accepted = validateTimestamp(candidate, sourceUrl, asOf);
    if (accepted) return accepted;
  }

  return null;
}
