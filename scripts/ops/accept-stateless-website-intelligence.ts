#!/usr/bin/env bun
/**
 * Real-network, read-only acceptance BEFORE the founder publishes Lovable.
 * Explicitly does NOT store publisher feeds or derived Intelligence; logs
 * only category-wide counts and strict public-contract booleans.
 */
import { readStatelessWebsiteIntelligence } from "../../src/lib/stateless-public-intelligence.server";
import { STATELESS_LOOKBACK_MS, conservativeDayReleaseMs } from "../../src/lib/stateless-intelligence-model";

const domains = ["geopolitics", "macro", "rare_earth"] as const;
const results = await Promise.all(domains.map(category =>
  readStatelessWebsiteIntelligence(category, Date.now(), (lane_index, diagnostics) => {
    // Per-lane stage COUNTS only, with anonymous numeric indices.
    // No source identity, article fingerprint, URL/title/body or source host.
    console.log(JSON.stringify({ schema: "geomacro.stateless-original-stage-metrics.v1",
      category, lane_index, ...diagnostics }));
  })
    .then(result => ({ category, result, error: false }))
    .catch(() => ({ category, result: null, error: true }))
));
let healthy = true;
for (const { category, result, error } of results) {
  const signals = result?.signals ?? [];
  const cutoff = Date.parse(result?.website_release_cutoff ?? "");
  const checked = Date.parse(result?.checked_at ?? "");
  const correctDelay = Number.isFinite(cutoff) && Number.isFinite(checked) &&
    Math.abs((checked - cutoff) - 900_000) <= 2_000;
  const strictlyOriginalDates = signals.every(s => {
    const date = Date.parse(s.published_at);
    const originalTrusted = s.date_precision === "day"
      ? /^\d{4}-\d{2}-\d{2}$/u.test(s.published_at) &&
        s.category === "rare_earth" &&
        (conservativeDayReleaseMs(s.published_at) ?? Infinity) <= checked
      : s.date_precision === "exact" && date <= cutoff;
    return Number.isFinite(date) && originalTrusted &&
      date >= checked - STATELESS_LOOKBACK_MS;
  });
  const storiesSafe = signals.every(s =>
    s.category === category &&
    s.status === "official_release_observed_unscored" &&
    s.same_event_corrob_verified === false && s.severity === null &&
    s.title.startsWith("Geomacro finds ") &&
    s.what_changed.length >= 30 && s.why_it_matters.length >= 30 &&
    !/(?:https?:\/\/|www\.)/iu.test(JSON.stringify(s))
  );
  const unique = new Set(signals.map(s => s.id)).size === signals.length;
  const noStorage = result?.persistent_storage === false &&
    result?.publisher_title_redistributed === false &&
    result?.signed_risk_score_generated === false &&
    result?.independent_same_event_verification === false;
  const sourcesHealthy = !error && Number(result?.healthy_feed_count) >= 1;
  const hasRecent = signals.length >= 1;
  const pass = sourcesHealthy && hasRecent && correctDelay &&
    strictlyOriginalDates && storiesSafe && unique && noStorage;
  if (!pass) healthy = false;
  // Only category aggregates and booleans; no publisher inventory,
  // upstream title, link, domain, request path, source body or signal payload.
  console.log(JSON.stringify({
    schema: "geomacro.stateless-website-real-source-acceptance.v1",
    category, ok: pass,
    reachable_official_feed_count: result?.healthy_feed_count ?? 0,
    configured_feed_count: result?.feed_count ?? 0,
    original_candidates: result?.releases_examined ?? 0,
    eligible_distinct_findings_last_30d: signals.length,
    eligible_findings_last_7d: result?.last_7d_count ?? 0,
    eligible_findings_last_24h: result?.current_24h_count ?? 0,
    exactly_15m_cutoff: correctDelay,
    original_dates_verified: strictlyOriginalDates,
    derived_source_private_story_contract: storiesSafe,
    unique_event_ids: unique,
    no_storage_or_scoring: noStorage,
    any_source_transport_available: sourcesHealthy,
    has_genuine_recent_findings: hasRecent,
  }));
}
if (!healthy) {
  console.error("::error::PREPUBLISH_INTELLIGENCE_LIVE_SOURCE_ACCEPTANCE_INCOMPLETE; exact category proof above. Do not claim zero-news as success.");
  process.exitCode = 2;
}
