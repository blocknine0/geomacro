/**
 * Shared privacy/scope contract for source-neutral derived-news readback.
 *
 * An "osint_feed_observed_unverified" card may carry one monitored-feed
 * hostname as provenance. That domain-only label is NOT an article URL or
 * permission to redistribute the source. URLs, paths and upstream content
 * remain forbidden in public prose and in all other provenance records.
 */
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PROSE_URL_OR_DOMAIN_PATH = /(?:https?:\/\/|www\.|[a-z0-9_-]{4,}\.(?:com|org|gov|net)\/)/iu;
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
  for (const field of ["title", "what_changed", "why_it_matters"]) {
    if (typeof signal[field] !== "string" || PROSE_URL_OR_DOMAIN_PATH.test(signal[field])) return false;
  }
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
