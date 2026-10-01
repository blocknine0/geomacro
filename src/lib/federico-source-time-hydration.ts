const TRUSTED_TIMESTAMP_HOSTS = new Set([
  "english.news.cn",
  "www.xinhuanet.com",
  "xinhuanet.com",
]);

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

function normalizeTimestampCandidate(raw: string, sourceUrl: string) {
  const value = raw.trim();
  if (!value) return null;

  // Xinhua's English pages can emit a local wall-clock timestamp without a
  // timezone. Treat that source-specific form as China Standard Time instead
  // of relying on the runner's locale.
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

  for (const candidate of candidates) {
    const accepted = validateTimestamp(candidate, sourceUrl, asOf);
    if (accepted) return accepted;
  }

  return null;
}
