import { fetchOriginalAlternate } from "./official-native-alternates.mjs";
import { fetchOfficialThirdPublisherArticles } from "./official-native-third-fallback.mjs";
import { fetchOriginalPublisherWithRecovery } from "./official-native-network-retry.mjs";
// Read-only original-publisher RSS evidence discovery. NO commercial admission,
// source-certification bypass, scoring, B2 writes or public/paid output.
// GDELT seendate/index timestamps are explicitly NOT publication evidence.
export const OFFICIAL_NATIVE_FEEDS = Object.freeze({
  geopolitics: Object.freeze({
    url: "https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml",
    host: "news.un.org",
    source_id: "un_news_peace_security_rss_pending_review",
    topics: /\b(?:security council|ceasefire|sanctions?|armed conflict|border conflict|military|missile|airstrikes?|invasion|displacement|peace talks|humanitarian crisis|war crimes|hostilities|geopolitical|peacekeeping)\b/iu,
  }),
  macro: Object.freeze({
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    host: "www.federalreserve.gov",
    source_id: "federal_reserve_monetary_rss_pending_review",
    topics: /\b(?:fomc|monetary|interest rates?|rate (?:cut|hike|increase|reduction)|federal funds|inflation|foreign exchange|currency|central bank|economic outlook|reserve balances)\b/iu,
  }),
  rare_earth: Object.freeze({
    url: "https://www.usgs.gov/news/minerals/feed",
    host: "www.usgs.gov",
    source_id: "usgs_mineral_news_rss_pending_review",
    topics: /\b(?:critical minerals?|rare earths?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|mineral (?:supply|production|reserve|trade|deposit|resource|assessment)|mineral commodity|strategic minerals?)\b/iu,
  }),
});
const MAX_RESPONSE_BYTES = 384 * 1024;
const MAX_ITEM_COUNT = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VALID_TYPES = /^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;

function unescapeXml(value) {
  return String(value ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/giu, (matched, dec, hex) => {
      const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
      if (named[matched.toLowerCase()]) return named[matched.toLowerCase()];
      const code = dec ? Number(dec) : Number.parseInt(hex, 16);
      return Number.isInteger(code) && code > 0 && code <= 0x10FFFF
        ? String.fromCodePoint(code) : "";
    })
    .replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}
function field(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "iu"));
  return match ? unescapeXml(match[1]) : "";
}

function safeOriginalUrl(raw, host) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password ||
        u.hostname.toLowerCase() !== host || u.href.length > 2048) return null;
    return u.href;
  } catch {
    return null;
  }
}

// Does not infer a timestamp from feed updated, retrieval or GDELT discovery.
// A SOURCE-NATIVE per-item <pubDate> is essential.
export function parseOfficialNativeRss(xml, category, now = new Date(), maxAgeMs = MAX_AGE_MS, diagnostics = null) {
  const config = OFFICIAL_NATIVE_FEEDS[category];
  if (!config || typeof xml !== "string" || xml.length > MAX_RESPONSE_BYTES ||
      !xml.includes("<rss") || /<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new Error("OFFICIAL_NATIVE_RSS_DOCUMENT_INVALID");
  }
  const asOfMs = now.getTime();
  if (!Number.isFinite(asOfMs) || !Number.isFinite(maxAgeMs) ||
      maxAgeMs < 60_000 || maxAgeMs > MAX_AGE_MS) {
    throw new Error("OFFICIAL_NATIVE_RSS_CLOCK_INVALID");
  }
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0, MAX_ITEM_COUNT);
  const dedupe = new Set();
  const rows = [];
  const stats = {
    item_count: items.length,
    item_native_pubdate_count: 0,
    item_native_date_in_window_count: 0,
    exact_publisher_host_count: 0,
    domain_topic_title_count: 0,
    admitted_private_count: 0,
  };
  for (const match of items) {
    const block = match[1];
    const title = field(block, "title");
    const url = safeOriginalUrl(field(block, "link"), config.host);
    const original = field(block, "pubDate");
    const at = Date.parse(original);
    if (Number.isFinite(at)) stats.item_native_pubdate_count += 1;
    // Publication dates later than the evaluation clock are not evidence of
    // a published event; even short future skew must fail closed.
    const current = Number.isFinite(at) && at <= asOfMs &&
      asOfMs - at <= maxAgeMs;
    if (current) stats.item_native_date_in_window_count += 1;
    if (url) stats.exact_publisher_host_count += 1;
    if (config.topics.test(title)) stats.domain_topic_title_count += 1;
    if (!url || title.length < 16 || title.length > 500 ||
        !config.topics.test(title) || !current ||
        dedupe.has(url)) continue;
    dedupe.add(url);
    stats.admitted_private_count += 1;
    rows.push({
      title, description: "", url, publishedAt: new Date(at).toISOString(),
      source: config.host, sourceDomain: config.host,
      discoveryProvider: "official_native_rss",
      nativePublishedAtVerified: true,
      nativeTimeEvidence: "publisher_rss_item_pubDate",
      privateOnly: true,
      rightsVerified: false,
      commercialEligible: false,
    });
  }
  if (diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)) {
    Object.assign(diagnostics, stats);
  }
  return rows.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

async function boundedRssFetch(url, fetchImpl) {
  const response = await fetchOriginalPublisherWithRecovery(url, {
    fetchImpl,
    headers: { accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "user-agent": "Geomacro-Official-Source-Private-Discovery/1.0" },
  });
  if (!response.ok || !VALID_TYPES.test(response.headers.get("content-type") ?? "")) {
    throw new Error("OFFICIAL_NATIVE_RSS_TRANSPORT_INVALID");
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error("OFFICIAL_NATIVE_RSS_TOO_LARGE");
  if (!response.body) throw new Error("OFFICIAL_NATIVE_RSS_BODY_MISSING");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("OFFICIAL_NATIVE_RSS_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
}

export async function fetchOfficialNativeArticles(category, {
  now = new Date(), fetchImpl = fetch, maxAgeMs = MAX_AGE_MS, diagnostics = null,
  includeSecondPublisher = false,
  includeThirdPublisher = false,
} = {}) {
  const config = OFFICIAL_NATIVE_FEEDS[category];
  if (!config) throw new Error("OFFICIAL_NATIVE_RSS_CATEGORY_INVALID");
  let primary = [];
  let primaryUnavailable = false;
  try {
    primary = parseOfficialNativeRss(await boundedRssFetch(config.url, fetchImpl),
      category, now, maxAgeMs, diagnostics);
  } catch {
    primaryUnavailable = true;
  }
  if (diagnostics && typeof diagnostics === "object") {
    diagnostics.primary_feed_ok = !primaryUnavailable;
    diagnostics.alternate_feed_attempted = false;
    diagnostics.alternate_feed_ok = null;
  }
  // The primary official USGS mineral RSS may be empty, and agency monetary
  // and UN specialist feeds are intermittent. A SECOND FIXED original
  // publisher feed can add genuine new events without date laundering.
  // Default stays source-budget minimal. Explicit private dual-family staging
  // probes the fixed alternate even with eligible primary items. This widens
  // discovery ONLY: shared articles or distinct hosts do not prove corroboration,
  // commercial rights, severity, or any public publication eligibility.
  if (primary.length > 0 && !includeSecondPublisher) return primary;
  if (diagnostics && typeof diagnostics === "object")
    diagnostics.alternate_feed_attempted = true;
  let alternate = [];
  let alternateUnavailable = false;
  try {
    alternate = await fetchOriginalAlternate(category,{
      now,fetchImpl,diagnostics,
    });
    if (diagnostics && typeof diagnostics === "object")
      diagnostics.alternate_feed_ok = true;
  } catch {
    alternateUnavailable = true;
    if (diagnostics && typeof diagnostics === "object")
      diagnostics.alternate_feed_ok = false;
  }
  const seen = new Set(primary.map(row => row.url));
  const combined = [...primary,...alternate.filter(row => !seen.has(row.url))]
    .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  if (diagnostics && typeof diagnostics === "object") {
    diagnostics.third_feed_attempted = false;
    diagnostics.third_feed_ok = null;
    diagnostics.third_feed_failure_code = null;
  }
  if (combined.length>0 || !includeThirdPublisher) {
    if (!combined.length && primaryUnavailable && alternateUnavailable)
      throw new Error("OFFICIAL_ORIGINAL_FEEDS_UNAVAILABLE");
    return combined;
  }
  // This third publisher is consulted ONLY when primary and alternate
  // yield zero qualifying original-publisher, in-window domain events.
  // Never fill quiet periods using stale feed clocks or GDELT seen dates.
  if (diagnostics && typeof diagnostics === "object")
    diagnostics.third_feed_attempted = true;
  try {
    const third=await fetchOfficialThirdPublisherArticles(category,{
      now,fetchImpl,maxAgeMs,diagnostics,
    });
    if (diagnostics && typeof diagnostics === "object")
      diagnostics.third_feed_ok = true;
    return third;
  } catch (error) {
    if (diagnostics && typeof diagnostics === "object") {
      diagnostics.third_feed_ok = false;
      const code = error instanceof Error ? error.message : "";
      // Explicit closed enum. Catch never prints arbitrary host, URL, HTML
      // or third-party error messages as operational diagnostics.
      const allowed = new Set([
        "OFFICIAL_THIRD_HTTP_FORBIDDEN",
        "OFFICIAL_THIRD_HTTP_NOT_FOUND",
        "OFFICIAL_THIRD_HTTP_RATE_LIMITED",
        "OFFICIAL_THIRD_HTTP_UPSTREAM_FAILURE",
        "OFFICIAL_THIRD_HTTP_NOT_OK",
        "OFFICIAL_THIRD_CONTENT_TYPE_INVALID",
        "OFFICIAL_THIRD_BODY_INVALID",
        "OFFICIAL_THIRD_TOO_LARGE",
        "OFFICIAL_THIRD_RSS_INVALID",
        "OFFICIAL_THIRD_CLOCK_INVALID",
        "ORIGINAL_FEED_NETWORK_UNAVAILABLE",
        "ORIGINAL_FEED_RECOVERY_EXHAUSTED",
      ]);
      diagnostics.third_feed_failure_code = allowed.has(code)
        ? code : "OFFICIAL_THIRD_UNEXPECTED_FAILURE";
    }
    if (primaryUnavailable && alternateUnavailable)
      throw new Error("OFFICIAL_ORIGINAL_FEEDS_UNAVAILABLE");
    return [];
  }
}
