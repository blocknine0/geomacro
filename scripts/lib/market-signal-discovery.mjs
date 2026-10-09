// OPEN SIGNAL DISCOVERY ONLY — never a source-native publication clock,
// corroborated event, commercial right, scored GRO, or payable intelligence.
// Similar to the observation/verification separation documented by ACLED,
// Dataminr and GDELT. No publisher article text/URL is ever exported.
export const MARKET_SIGNAL_SCHEMA = "geomacro.global-open-signal-discovery.v1";
export const DISCOVERY_CATEGORIES = Object.freeze(["geopolitics", "macro", "rare_earth"]);
export const DISCOVERY_QUERIES = Object.freeze({
  geopolitics: '("armed conflict" OR "ceasefire" OR "military escalation" OR sanctions OR coup)',
  macro: '("central bank" OR inflation OR "interest rate" OR "foreign exchange" OR "currency depreciation")',
  rare_earth: '("critical minerals" OR "rare earth" OR lithium OR cobalt OR gallium OR germanium)',
});
export const DISCOVERY_POLL_MINUTES = 30;
export const DISCOVERY_OBSERVATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const DISCOVERY_MAX_ARTICLES = 75;
const DOCUMENT_MAX_BYTES = 512 * 1024;
const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const DOMAIN = /^[a-z0-9](?:[a-z0-9.-]{1,240})\.[a-z]{2,24}$/u;

// GDELT seendate records when GDELT saw an article, NEVER when the original
// publisher released it. Do not map it to published_at in customer responses.
export function gdeltSeenAt(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  let time = NaN;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(raw);
  if (match) {
    const constructed = match[1] + "-" + match[2] + "-" + match[3] +
      "T" + match[4] + ":" + match[5] + ":" + match[6] + "Z";
    time = Date.parse(constructed);
    if (Number.isFinite(time) && new Date(time).toISOString() !== constructed.replace("Z", ".000Z")) return null;
  } else if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(raw)) {
    time = Date.parse(raw);
  }
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function originalOutletHost(item) {
  try {
    const uri = new URL(String(item?.url ?? ""));
    if (uri.protocol !== "https:" || uri.username || uri.password ||
        uri.href.length > 2048 || uri.port) return null;
    const hostname = uri.hostname.toLowerCase().replace(/^www\./u, "");
    const given = String(item?.domain ?? "").toLowerCase().replace(/^www\./u, "");
    if (!DOMAIN.test(hostname) || !DOMAIN.test(given) || hostname !== given ||
        hostname.endsWith(".gdeltproject.org")) return null;
    return hostname;
  } catch {
    return null;
  }
}

export function summarizeOpenDiscovery(category, payload, {
  now = new Date(),
} = {}) {
  if (!DISCOVERY_CATEGORIES.includes(category) ||
      !payload || typeof payload !== "object" ||
      !Array.isArray(payload.articles)) {
    throw new Error("MARKET_DISCOVERY_PAYLOAD_INVALID");
  }
  const clock = now.getTime();
  if (!Number.isFinite(clock)) throw new Error("MARKET_DISCOVERY_CLOCK_INVALID");
  const articles = payload.articles.slice(0, DISCOVERY_MAX_ARTICLES);
  const hosts = new Set();
  let freshObserved = 0, latest = -Infinity, rejectedFuture = 0, oldOrUndated = 0;
  for (const article of articles) {
    const observedAt = gdeltSeenAt(article?.seendate);
    const ms = Date.parse(observedAt ?? "");
    if (!Number.isFinite(ms) || clock - ms > DISCOVERY_OBSERVATION_MAX_AGE_MS) {
      oldOrUndated++;
      continue;
    }
    if (ms > clock) {
      rejectedFuture++;
      continue;
    }
    const host = originalOutletHost(article);
    if (!host) continue;
    freshObserved++;
    hosts.add(host);
    latest = Math.max(latest, ms);
  }
  // Two distinct outlet hosts are *not* two independent confirmations of the
  // same event. This is coverage breadth only and can never certify a story.
  const state = hosts.size >= 2 ? "MULTI_OUTLET_DISCOVERY_ONLY" :
    hosts.size === 1 ? "SINGLE_OUTLET_DISCOVERY_ONLY" :
      "NO_RECENT_OPEN_DISCOVERY";
  return Object.freeze({
    category, source_transport_ok: true, state,
    gdelt_articles_sampled: articles.length,
    freshly_indexed_articles: freshObserved,
    distinct_outlet_domains: hosts.size,
    future_index_timestamps_rejected: rejectedFuture,
    old_or_missing_index_timestamps: oldOrUndated,
    latest_index_seen_at: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
    // Deliberately never mistake first-seen coverage for original news or a
    // canonical verified story, paid API scope, event country or severity.
    observed_not_original_published: true,
    original_article_publication_verified: false,
    same_event_independently_corroborated: false,
    commercial_rights_verified: false,
    publicly_scored: false,
    chargeable: false,
  });
}

export function unavailableOpenDiscovery(category) {
  if (!DISCOVERY_CATEGORIES.includes(category)) throw new Error("MARKET_DISCOVERY_CATEGORY_INVALID");
  return {
    category, source_transport_ok: false, state: "SOURCE_UNAVAILABLE",
    gdelt_articles_sampled: 0, freshly_indexed_articles: 0,
    distinct_outlet_domains: 0, future_index_timestamps_rejected: 0,
    old_or_missing_index_timestamps: 0, latest_index_seen_at: null,
    observed_not_original_published: true,
    original_article_publication_verified: false,
    same_event_independently_corroborated: false,
    commercial_rights_verified: false,
    publicly_scored: false,
    chargeable: false,
  };
}

async function boundedBody(response) {
  const size = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(size) && size > DOCUMENT_MAX_BYTES || !response.body) {
    throw new Error("MARKET_DISCOVERY_RESPONSE_SIZE_INVALID");
  }
  const reader = response.body.getReader();
  const buffers = []; let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > DOCUMENT_MAX_BYTES) throw new Error("MARKET_DISCOVERY_RESPONSE_TOO_LARGE");
      buffers.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(buffers.map((x) => Buffer.from(x))),
  );
}

export async function pollOpenDiscovery(category, { now = new Date(), fetchImpl = fetch } = {}) {
  if (!DISCOVERY_CATEGORIES.includes(category)) throw new Error("MARKET_DISCOVERY_CATEGORY_INVALID");
  const endpoint = new URL(API);
  endpoint.searchParams.set("query", DISCOVERY_QUERIES[category]);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("maxrecords", String(DISCOVERY_MAX_ARTICLES));
  endpoint.searchParams.set("timespan", "2h");
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");
  try {
    const response = await fetchImpl(endpoint.href, {
      redirect: "error",
      headers: { accept: "application/json", "user-agent": "Geomacro-Private-Global-Signal-Discovery/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !/^(?:application\/json|text\/json)(?:;|$)/iu.test(
      response.headers.get("content-type") ?? "")) throw new Error("MARKET_DISCOVERY_SOURCE_UNAVAILABLE");
    const raw = await boundedBody(response);
    return summarizeOpenDiscovery(category, JSON.parse(raw), { now });
  } catch {
    // No raw response or upstream URLs are echoed to Actions logs.
    return unavailableOpenDiscovery(category);
  }
}

export async function probeOpenDiscoveryMesh({ now = new Date(), fetchCategory = pollOpenDiscovery } = {}) {
  const categories = [];
  for (const category of DISCOVERY_CATEGORIES) {
    try { categories.push(await fetchCategory(category, { now })); }
    catch { categories.push(unavailableOpenDiscovery(category)); }
  }
  return {
    schema: MARKET_SIGNAL_SCHEMA,
    checked_at: now.toISOString(),
    source: "gdelt_doc_v2_open_discovery_only",
    poll_minutes: DISCOVERY_POLL_MINUTES,
    source_heartbeat_max_age_minutes: 120,
    source_reachability: categories.every((row) => row.source_transport_ok)
      ? "ALL_POLL_OK" : "DEGRADED",
    // Never report source heartbeat as verified event freshness or a current
    // commercial score. Even 75 articles may represent no same-event evidence.
    source_heartbeat_is_event_freshness: false,
    three_category_current_scored_ready: false,
    chargeable: false,
    supabase_reads: 0, supabase_writes: 0, b2_requests: 0,
    categories,
  };
}
