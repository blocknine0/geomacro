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
      const articles = await fetchArticles(category, { now });
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
        latest_original_at: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        current_native_source_state: articles.length > 0 ? "ORIGINAL_FEED_EVENT_PRESENT_PRIVATE" : "NO_RECENT_ORIGINAL_EVENT",
        public_scored_verified: false,
        commerce_eligible: false,
      });
    } catch {
      // Fixed-shape errors only; no URLs, raw headlines, source body or secrets.
      results.push({
        category, fetch_ok: false, recent_original_count: 0,
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
