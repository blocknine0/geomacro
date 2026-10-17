/**
 * Private, sanitized hourly source-health diagnostics for the three free Finds
 * categories. Never serialize publisher IDs, URLs, titles, article bodies,
 * upstream payloads, rights assertions, or customer data into Actions artifacts.
 * A reachable feed is NOT a verified event or commercial rights certificate.
 */
export const DERIVED_SOURCE_HEALTH_SCHEMA = "geomacro.hourly-free-source-health.v1";
export const DERIVED_SOURCE_CATEGORIES = Object.freeze(["geopolitics","macro","rare_earth"]);
const failures = Object.freeze(["http_4xx","http_5xx","mime","body","timeout","redirect","network"]);
export function summarizeDerivedSourceHealth(category, feedCount, healthyFeedCount, lanes) {
  if (!DERIVED_SOURCE_CATEGORIES.includes(category) ||
      !Number.isSafeInteger(feedCount) || feedCount < 1 || feedCount > 100 ||
      !Number.isSafeInteger(healthyFeedCount) || healthyFeedCount < 0 ||
      healthyFeedCount > feedCount || !Array.isArray(lanes)) {
    throw Error("DERIVED_SOURCE_HEALTH_INVALID");
  }
  const byClass = Object.fromEntries([...failures,"unknown"].map(reason=>[reason,0]));
  const seen = new Set(), degradedLaneIndexes = [];
  let diagnosedHealthy=0;
  for (const row of lanes) {
    if (!row || !Number.isSafeInteger(row.index) || row.index < 0 ||
        row.index >= feedCount || seen.has(row.index)) throw Error("DERIVED_SOURCE_HEALTH_LANE_INVALID");
    seen.add(row.index);
    if (row.transport_ok === true) diagnosedHealthy++;
    else {
      degradedLaneIndexes.push(row.index);
      const reason=failures.includes(row.failure_class) ? row.failure_class : "unknown";
      byClass[reason]++;
    }
  }
  // Explicitly distinguish a missing diagnostic from a healthy source.
  const diagnosticsComplete=seen.size===feedCount && diagnosedHealthy===healthyFeedCount;
  return Object.freeze({
    schema:DERIVED_SOURCE_HEALTH_SCHEMA,
    category,
    sources_configured:feedCount,
    sources_reachable:healthyFeedCount,
    sources_unavailable:feedCount-healthyFeedCount,
    status:healthyFeedCount===0?"ALL_SOURCES_UNAVAILABLE":
      healthyFeedCount===feedCount&&diagnosticsComplete?"ALL_CONFIGURED_FEEDS_REACHABLE":
      "PARTIAL_SOURCE_DEGRADATION",
    diagnostics_complete:diagnosticsComplete,
    failure_classes:byClass,
    // Indices refer only to the versioned repository's fixed source order.
    // They enable private repair without leaking any upstream URL or content.
    degraded_lane_indexes:degradedLaneIndexes.sort((a,b)=>a-b),
    commercial_rights_verified:false,
    current_news_guaranteed:false,
    supabase_dependency:false,
    raw_upstream_stored:false,
  });
}
