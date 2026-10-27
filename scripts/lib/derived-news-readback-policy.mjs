/**
 * Shared privacy/scope contract for source-neutral derived-news readback.
 *
 * An "osint_feed_observed_unverified" card may carry one monitored-feed
 * hostname as provenance. That domain-only label is NOT an article URL or
 * permission to redistribute the source. The upstream reader separately pins
 * source URLs; this boundary validates only the public provenance shape. URLs, paths and upstream content
 * remain forbidden in public prose and in all other provenance records.
 */
export const DERIVED_NEWS_TOPIC_POLICY_REVISION = 3;

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PROSE_URL_OR_DOMAIN_PATH = /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+[a-z]{2,63}\/)/iu;
const AGGREGATOR_SUFFIX = " (aggregator; original publisher not verified)";

export function isSafeMonitoredFeedCredit(value) {
  if (typeof value !== "string" || value.length > 230 ||
      !value.startsWith("Monitored feed: ")) return false;
  let host = value.slice("Monitored feed: ".length);
  const aggregator = host.endsWith(AGGREGATOR_SUFFIX);
  if (aggregator) {
    host = host.slice(0, -AGGREGATOR_SUFFIX.length);
    if (host !== "news.google.com") return false;
  }
  if (!host || host.length > 120 || host !== host.toLowerCase() ||
      host.startsWith(".") || host.endsWith(".") || host.includes("..")) return false;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some(label => label.length > 63 || !DOMAIN_LABEL.test(label)) ||
      !/^[a-z]{2,63}$/u.test(labels.at(-1))) return false;
  return true;
}

export function isSafeDerivedNewsReadbackSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) return false;
  for (const field of ["title", "what_changed", "why_it_matters", "topic", "development_type"]) {
    if (typeof signal[field] !== "string" || /[<>]/u.test(signal[field]) ||
        PROSE_URL_OR_DOMAIN_PATH.test(signal[field])) return false;
  }
  if (signal.geography !== null &&
      (typeof signal.geography !== "string" || /[<>]/u.test(signal.geography) ||
       PROSE_URL_OR_DOMAIN_PATH.test(signal.geography))) return false;
  if (!Array.isArray(signal.sources_credited) || signal.sources_credited.length > 2 ||
      signal.sources_credited.some(value =>
        typeof value !== "string" || value.length > 230 || /[<>]/u.test(value))) return false;

  if (signal.status === "osint_feed_observed_unverified") {
    return signal.development_type === "unverified OSINT feed observation" &&
      signal.date_precision === "exact" && signal.geography === null &&
      signal.sources_credited.length === 1 &&
      isSafeMonitoredFeedCredit(signal.sources_credited[0]);
  }

  // Only the explicit unverified-OSINT shape may contain a monitored-feed
  // provenance label. Official credits are source names/licence text, not URLs.
  return signal.sources_credited.every(value =>
    !value.startsWith("Monitored feed: ") && !PROSE_URL_OR_DOMAIN_PATH.test(value));
}

/**
 * Wait for the deployed D1 Worker to attest the exact derived-news policy
 * revision before any collector source read or journal write. This protects
 * against the repository push/deployment race. The revision is changed only
 * when the Worker validator/topic allowlist changes incompatibly.
 */
export async function requireDerivedNewsWorkerPolicy({
  fetchImpl = fetch, url, expectedRevision = DERIVED_NEWS_TOPIC_POLICY_REVISION,
} = {}) {
  let target;
  try { target = new URL(url); }
  catch { throw Error("DERIVED_NEWS_WORKER_POLICY_CONFIGURATION_INVALID"); }
  if (target.protocol !== "https:" ||
      target.hostname !== "geomacro-control-plane.daspallab202391.workers.dev" ||
      target.pathname !== "/health" || target.username || target.password ||
      target.port || target.search || target.hash ||
      !Number.isInteger(expectedRevision) || expectedRevision < 1)
    throw Error("DERIVED_NEWS_WORKER_POLICY_CONFIGURATION_INVALID");
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw Error("DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE");
  }
  if (!response || response.status !== 200 || response.redirected ||
      Number(response.headers?.get("content-length") ?? 0) > 16_384)
    throw Error("DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE");
  let text;
  try { text = await response.text(); }
  catch { throw Error("DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE"); }
  if (text.length > 16_384) throw Error("DERIVED_NEWS_WORKER_POLICY_RESPONSE_OVERSIZE");
  let doc;
  try { doc = JSON.parse(text); }
  catch { throw Error("DERIVED_NEWS_WORKER_POLICY_RESPONSE_INVALID"); }
  if (doc?.ok !== true || doc.store !== "d1" ||
      !Number.isSafeInteger(doc.schema_version) || doc.schema_version < 3 ||
      doc.derived_news_topic_policy_revision !== expectedRevision ||
      !/^[a-f0-9]{40}$/u.test(String(doc.deployed_source_sha ?? "")))
    throw Error("DERIVED_NEWS_WORKER_TOPIC_POLICY_NOT_CURRENT");
  return Object.freeze({
    schema: "geomacro.derived-news-worker-policy-preflight.v1",
    worker_policy_revision: doc.derived_news_topic_policy_revision,
    d1_schema_version: doc.schema_version,
    deployed_source_sha_present: true,
    raw_health_body_logged: false,
    source_reads_started: false,
    payments: 0,
  });
}
