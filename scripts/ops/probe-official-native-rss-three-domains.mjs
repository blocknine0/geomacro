#!/usr/bin/env node
// Hourly fixed-URL, read-only, Supabase/B2-free source-native coverage probe.
// This is not an editorial, corroboration, score or commerce publisher.
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fetchOfficialNativeArticles } from "../lib/official-native-rss.mjs";

const CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const OUTPUT = "artifacts/official-native-rss/three-domains.json";

export async function probeOfficialThreeDomains({
  fetchArticles = fetchOfficialNativeArticles, now = new Date(),
} = {}) {
  const results = [];
  for (const category of CATEGORIES) {
    try {
      const diagnostics = {};
      const articles = await fetchArticles(category, { now, diagnostics });
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
        recent_original_count: articles.length,
        // Numeric, whitelist-only publisher-feed diagnostics. No source text/URL.
        feed_items_seen: diagnostics.item_count ?? null,
        source_native_pubdate_items: diagnostics.item_native_pubdate_count ?? null,
        native_date_current_items: diagnostics.item_native_date_in_window_count ?? null,
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
        latest_original_at: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        current_native_source_state: articles.length > 0 ? "ORIGINAL_FEED_EVENT_PRESENT_PRIVATE" : "NO_RECENT_ORIGINAL_EVENT",
        public_scored_verified: false,
        commerce_eligible: false,
      });
    } catch {
      // Fixed-shape errors only; no URLs, raw headlines, source body or secrets.
      results.push({
        category, fetch_ok: false, recent_original_count: 0,
        feed_items_seen: null, source_native_pubdate_items: null,
        native_date_current_items: null, trusted_original_host_items: null,
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
        latest_original_at: null, current_native_source_state: "SOURCE_UNAVAILABLE",
        public_scored_verified: false, commerce_eligible: false,
      });
    }
  }
  return {
    schema: "geomacro.official-native-source-audit.v1",
    checked_at: now.toISOString(),
    status: results.every((row) => row.fetch_ok) ? "SOURCE_POLL_COMPLETE" : "SOURCE_POLL_DEGRADED",
    all_three_feeds_reached: results.every((row) => row.fetch_ok),
    current_private_original_event_domains: results.filter((row) => row.recent_original_count > 0).length,
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
