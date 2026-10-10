#!/usr/bin/env node
// Hourly fixed-URL, read-only, Supabase/B2-free source-native coverage probe.
// This is not an editorial, corroboration, score or commerce publisher.
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fetchOfficialNativeArticles } from "../lib/official-native-rss.mjs";

const CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const OUTPUT = "artifacts/official-native-rss/three-domains.json";

/**
 * These are THREE sampled domains with up to THREE fixed publisher feeds EACH,
 * not a global-news census. A feed returns zero when its ORIGINAL publisher
 * has no current topical article; that is never evidence of zero global risk.
 * Even a feed with 0 eligible items cannot prove that a domain had no news.
 * Report distinct evidence-gate failures without exposing article/source text.
 */
export function classifyNativeFeedGap({ articlesCount, diagnostics }) {
  if (articlesCount > 0) return "ORIGINAL_NATIVE_EVENTS_PRIVATE_ONLY";
  const primaryItems = Number(diagnostics.item_count ?? 0);
  const alternateItems = Number(diagnostics.alternate_feed_items_seen ?? 0);
  const thirdItems = Number(diagnostics.third_items_seen ?? 0);
  const recentNative = Number(diagnostics.item_native_date_in_window_count ?? 0) +
    Number(diagnostics.alternate_native_current_items ?? 0) +
    Number(diagnostics.third_original_current_count ?? 0);
  const updatedOnly = Number(diagnostics.alternate_atom_updated_only_items ?? 0);
  const nativeDates = Number(diagnostics.item_native_pubdate_count ?? 0) +
    Number(diagnostics.alternate_native_date_items ?? diagnostics.alternate_original_pubdate_items ?? 0) +
    Number(diagnostics.third_native_pubdate_seen ?? 0);
  const topicMatches = Number(diagnostics.domain_topic_title_count ?? 0) +
    Number(diagnostics.alternate_topic_match_items ?? 0) +
    Number(diagnostics.third_topic_match_count ?? 0);

  if (recentNative > 0) return "RECENT_NATIVE_EVENT_REJECTED_BY_TOPIC_OR_PROVENANCE";
  if (updatedOnly > 0 &&
      Number(diagnostics.alternate_native_date_items ?? diagnostics.alternate_original_pubdate_items ?? 0) === 0 &&
      Number(diagnostics.alternate_article_page_admitted ?? 0) === 0) {
    return "PUBLISHER_ARTICLE_DATE_UNVERIFIED";
  }
  if (primaryItems + alternateItems + thirdItems === 0) return "SAMPLED_FEED_NO_ITEMS";
  if (nativeDates === 0) return "SAMPLED_FEED_MISSING_NATIVE_PUBLISH_DATES";
  if (topicMatches === 0) return "SAMPLED_FEED_NO_RELEVANT_TOPIC_MATCH";
  return "SAMPLED_FEED_HAS_ONLY_STALE_OR_INELIGIBLE_EVENTS";
}

export async function probeOfficialThreeDomains({
  fetchArticles = fetchOfficialNativeArticles, now = new Date(),
} = {}) {
  const results = [];
  for (const category of CATEGORIES) {
    try {
      const diagnostics = {};
      // Explicitly exercise all governed first-party families in the hourly
      // read-only probe, matching the private scoring cold fallback. A third
      // feed is never requested if primary+secondary already have qualified
      // publication-time evidence. No B2, Supabase, classifier or payment.
      const articles = await fetchArticles(category, {
        now, diagnostics,
        // Same 6-hour cutoff as actual restricted private scoring. Do not
        // count old 24-hour publisher originals as score-ready signals.
        maxAgeMs:6*60*60*1000,
        includeSecondPublisher: true,
        includeThirdPublisher: true,
        // Match the exact primary Fed/USGS original-date admission path used
        // by protected private scoring; still observation-only and bounded.
        includeOriginalPageDateFallback: true,
      });
      // A resolved fetch can still conceal an attempted publisher transport
      // failure. In particular a failed minerals third feed previously let the
      // three-domain source poll claim COMPLETE. This is distinct from whether
      // any qualifying article exists and must never imply source rights.
      const publisherTransportOk =
        diagnostics.primary_feed_ok === true &&
        (diagnostics.alternate_feed_attempted !== true ||
          diagnostics.alternate_feed_ok === true) &&
        (diagnostics.third_feed_attempted !== true ||
          diagnostics.third_feed_ok === true);
      const dates = articles.map((row) => Date.parse(row.publishedAt));
      if (!Array.isArray(articles) ||
          articles.some((row) => row.discoveryProvider !== "official_native_rss" ||
            row.nativePublishedAtVerified !== true || row.privateOnly !== true ||
            row.rightsVerified !== false || row.commercialEligible !== false ||
            !Number.isFinite(Date.parse(row.publishedAt)))) {
        throw new Error("OFFICIAL_NATIVE_RSS_INELIGIBLE_CANDIDATE");
      }
      results.push({
        category,
        fetch_ok: true,
        publisher_transport_ok: publisherTransportOk,
        recent_original_count: articles.length,
        // Numeric, whitelist-only publisher-feed diagnostics. No source text/URL.
        feed_items_seen: diagnostics.item_count ?? null,
        source_native_pubdate_items: diagnostics.item_native_pubdate_count ?? null,
        native_date_current_items: diagnostics.item_native_date_in_window_count ?? null,
        private_primary_original_page_checks:
          diagnostics.original_page_precise_date_checks ?? 0,
        private_primary_original_page_admitted:
          diagnostics.original_page_precise_date_admitted ?? 0,
        trusted_original_host_items: diagnostics.exact_publisher_host_count ?? null,
        topic_title_match_items: diagnostics.domain_topic_title_count ?? null,
        original_primary_feed_ok: diagnostics.primary_feed_ok ?? null,
        alternate_feed_attempted: diagnostics.alternate_feed_attempted ?? false,
        alternate_feed_ok: diagnostics.alternate_feed_ok ?? null,
        alternate_items_seen: diagnostics.alternate_feed_items_seen ?? null,
        alternate_original_pubdate_items: diagnostics.alternate_native_date_items ?? null,
        alternate_current_native_date_items: diagnostics.alternate_native_current_items ?? null,
        alternate_trusted_host_items: diagnostics.alternate_host_match_items ?? null,
        alternate_topic_title_items: diagnostics.alternate_topic_match_items ?? null,
        alternate_private_candidates: diagnostics.alternate_admitted_private_count ?? null,
        alternate_atom_published_tag_items: diagnostics.alternate_atom_published_tag_items ?? null,
        alternate_atom_updated_only_items: diagnostics.alternate_atom_updated_only_items ?? null,
        alternate_atom_dc_date_tag_items: diagnostics.alternate_atom_dc_date_tag_items ?? null,
        alternate_atom_dcterms_issued_tag_items: diagnostics.alternate_atom_dcterms_issued_tag_items ?? null,
        alternate_atom_link_href_items: diagnostics.alternate_atom_link_href_items ?? null,
        alternate_statcan_exact_root_relative_items: diagnostics.alternate_statcan_exact_root_relative_items ?? null,
        alternate_other_relative_href_rejected_items: diagnostics.alternate_other_relative_href_rejected_items ?? null,
        alternate_macro_href_www150_items: diagnostics.alternate_macro_href_www150_items ?? null,
        alternate_macro_href_www_items: diagnostics.alternate_macro_href_www_items ?? null,
        alternate_macro_href_www_daily_path_items: diagnostics.alternate_macro_href_www_daily_path_items ?? null,
        alternate_macro_href_www_other_path_items: diagnostics.alternate_macro_href_www_other_path_items ?? null,
        alternate_macro_href_apex_items: diagnostics.alternate_macro_href_apex_items ?? null,
        alternate_macro_href_other_statcan_items: diagnostics.alternate_macro_href_other_statcan_items ?? null,
        alternate_macro_href_other_origin_items: diagnostics.alternate_macro_href_other_origin_items ?? null,
        alternate_macro_href_not_absolute_items: diagnostics.alternate_macro_href_not_absolute_items ?? null,
        alternate_macro_href_non_https_items: diagnostics.alternate_macro_href_non_https_items ?? null,
        alternate_macro_href_missing_items: diagnostics.alternate_macro_href_missing_items ?? null,
        alternate_article_page_probes: diagnostics.alternate_article_page_probes ?? null,
        alternate_article_page_precise: diagnostics.alternate_article_page_precise ?? null,
        alternate_article_page_admitted: diagnostics.alternate_article_page_admitted ?? null,
        alternate_article_page_probe_outcomes:
          Array.isArray(diagnostics.alternate_article_page_probe_outcomes) &&
          diagnostics.alternate_article_page_probe_outcomes.length <= 2
            ? diagnostics.alternate_article_page_probe_outcomes : null,
        third_feed_attempted: diagnostics.third_feed_attempted ?? false,
        third_feed_ok: diagnostics.third_feed_ok ?? null,
        third_feed_failure_code: diagnostics.third_feed_failure_code ?? null,
        third_items_seen: diagnostics.third_items_seen ?? null,
        third_native_pubdate_items: diagnostics.third_native_pubdate_seen ?? null,
        third_current_native_date_items: diagnostics.third_original_current_count ?? null,
        third_trusted_host_items: diagnostics.third_exact_host_count ?? null,
        third_topic_title_items: diagnostics.third_topic_match_count ?? null,
        third_private_candidates: diagnostics.third_private_eligible_count ?? null,
        latest_original_at: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        current_native_source_state: articles.length > 0 ? "ORIGINAL_FEED_EVENT_PRESENT_PRIVATE" : "NO_ELIGIBLE_PRIVATE_CANDIDATE",
        bounded_feed_gap_reason: classifyNativeFeedGap({ articlesCount: articles.length, diagnostics }),
        source_scope: "THREE_DOMAINS_UP_TO_THREE_FIXED_OFFICIAL_PUBLISHERS_EACH",
        global_news_absence_proven: false,
        public_scored_verified: false,
        commerce_eligible: false,
      });
    } catch {
      // Fixed-shape errors only; no URLs, raw headlines, source body or secrets.
      results.push({
        category, fetch_ok: false, publisher_transport_ok: false, recent_original_count: 0,
        feed_items_seen: null, source_native_pubdate_items: null,
        native_date_current_items: null, trusted_original_host_items: null,
        private_primary_original_page_checks: null,
        private_primary_original_page_admitted: null,
        topic_title_match_items: null,
        original_primary_feed_ok: false, alternate_feed_attempted: false,
        alternate_feed_ok: null, alternate_items_seen: null,
        alternate_original_pubdate_items: null, alternate_current_native_date_items: null,
        alternate_trusted_host_items: null, alternate_topic_title_items: null,
        alternate_private_candidates: null,
        alternate_atom_published_tag_items: null,
        alternate_atom_updated_only_items: null,
        alternate_atom_dc_date_tag_items: null,
        alternate_atom_dcterms_issued_tag_items: null,
        alternate_atom_link_href_items: null,
        alternate_statcan_exact_root_relative_items: null,
        alternate_other_relative_href_rejected_items: null,
        alternate_macro_href_www150_items: null,
        alternate_macro_href_www_items: null,
        alternate_macro_href_www_daily_path_items: null,
        alternate_macro_href_www_other_path_items: null,
        alternate_macro_href_apex_items: null,
        alternate_macro_href_other_statcan_items: null,
        alternate_macro_href_other_origin_items: null,
        alternate_macro_href_not_absolute_items: null,
        alternate_macro_href_non_https_items: null,
        alternate_macro_href_missing_items: null,
        alternate_article_page_probes: null,
        alternate_article_page_precise: null,
        alternate_article_page_admitted: null,
        alternate_article_page_probe_outcomes: null,
        third_feed_attempted: false, third_feed_ok: null, third_feed_failure_code: null,
        third_items_seen: null, third_native_pubdate_items: null,
        third_current_native_date_items: null,
        third_trusted_host_items: null, third_topic_title_items: null,
        third_private_candidates: null,
        latest_original_at: null, current_native_source_state: "SOURCE_UNAVAILABLE",
        bounded_feed_gap_reason: "ALL_CONFIGURED_FEEDS_UNAVAILABLE",
        source_scope: "THREE_DOMAINS_UP_TO_THREE_FIXED_OFFICIAL_PUBLISHERS_EACH",
        global_news_absence_proven: false,
        public_scored_verified: false, commerce_eligible: false,
      });
    }
  }
  return {
    schema: "geomacro.official-native-source-audit.v1",
    checked_at: now.toISOString(),
    // Complete means every attempted official publisher transport succeeded.
    // A missing, blocked or malformed publisher response is DEGRADED even if
    // another independent publisher yielded valid *private* articles.
    status: results.every((row) => row.fetch_ok && row.publisher_transport_ok)
      ? "SOURCE_POLL_COMPLETE" : "SOURCE_POLL_DEGRADED",
    all_three_feeds_reached: results.every((row) => row.fetch_ok && row.publisher_transport_ok),
    all_three_categories_checked: results.every((row) => row.fetch_ok),
    publisher_transport_failure_domains: results.filter((row) => !row.publisher_transport_ok).length,
    current_private_original_event_domains: results.filter((row) => row.recent_original_count > 0).length,
    measured_source_scope: "THREE_DOMAINS_UP_TO_THREE_FIXED_OFFICIAL_PUBLISHERS_EACH",
    implies_no_global_news: false,
    proves_public_scored_intelligence: false,
    public_published: false,
    funds_touched: false,
    supabase_reads: 0, supabase_writes: 0, b2_requests: 0,
    categories: results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const proof = await probeOfficialThreeDomains();
  mkdirSync("artifacts/official-native-rss", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(proof, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(proof));
  if (!proof.all_three_feeds_reached) process.exitCode = 3;
}
