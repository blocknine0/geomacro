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

export function trustedFedericoTimestampFetchUrlForSource(
  sourceId: string,
  value: string,
) {
  if (!isTrustedFedericoTimestampUrlForSource(sourceId, value)) return null;

  const url = new URL(value);
  url.hash = "";
  url.search = "";

  // SCMP RSS may emit a /plus/news/... paywall wrapper even when the same
  // publisher article has a canonical /news/... route. Timestamp hydration
  // may fetch only that same-host canonical route; the stored evidence URL and
  // source identity remain unchanged.
  if (
    sourceId === "scmp_china_rss" &&
    /^\/plus\/news\//.test(url.pathname)
  ) {
    url.pathname = url.pathname.replace(/^\/plus(?=\/news\/)/, "");
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

function normalizeTimestampCandidate(raw: string, sourceUrl: string) {
  const value = raw.trim();
  if (!value || !hasExplicitTimeOfDay(value)) return null;

  // Xinhua's English pages emit their visible publication timestamp as a local
  // China wall clock. Convert that source-specific form explicitly instead of
  // relying on the runner locale.
  if (
    /^(?:\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value) &&
    isTrustedFedericoTimestampUrl(sourceUrl)
  ) {
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

  // Xinhua's rendered article header visibly carries a timestamp such as
  // "2026-10-01 19:21:31" even when generic metadata contains only the date.
  // Search only the bounded leading document region so body/archive dates do
  // not become publication evidence.
  const leadingHtml = html.slice(0, 120_000);
  for (const match of leadingHtml.matchAll(/\b(20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\b/g)) {
    if (match[1]) candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const accepted = validateTimestamp(candidate, sourceUrl, asOf);
    if (accepted) return accepted;
  }

  return null;
}
