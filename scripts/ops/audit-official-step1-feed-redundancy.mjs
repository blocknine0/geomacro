#!/usr/bin/env node
/**
 * Step-1 issuer redundancy audit of a previously observed *private* source
 * transport receipt. Does not fetch or publish articles, approve licenses,
 * score risks, infer country coverage or touch cloud databases.
 *
 * Upstream 401/403/429 are denied, never retried here or relabelled healthy.
 * Successful distinct issuers are a category transport floor only; failed
 * peers remain explicitly visible and keep the source mesh degraded.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXPANDED_OFFICIAL_SOURCES } from "./probe-expanded-official-source-mesh.mjs";

const ORIGINAL_ISSUERS = Object.freeze({
  geopolitics: Object.freeze({
    un_news_security_original_rss_review: "united_nations",
    uk_fcdo_original_foreign_policy_atom_review: "uk_fcdo",
  }),
  macro: Object.freeze({
    statcan_prices_original_atom_review: "statistics_canada",
    fed_monetary_original_press_rss_review: "federal_reserve",
  }),
  rare_earth: Object.freeze({
    nrcan_government_news_original_atom_review: "natural_resources_canada",
    usgs_minerals_original_news_rss_review: "us_geological_survey",
    australia_industry_minister_original_rss_review: "australian_industry_department",
  }),
});
const DOMAINS = Object.freeze(["geopolitics", "macro", "rare_earth"]);
const integer = n => Number.isSafeInteger(n) && n >= 0;

/** Pure validation/aggregation function: safe for unit tests and runbooks. */
export function auditOfficialStep1Feeds(receipt) {
  if (!receipt || receipt.schema !== "geomacro.expanded-official-source-observation.v1" ||
      !Number.isFinite(Date.parse(receipt.observed_at)) ||
      !Array.isArray(receipt.sources) ||
      receipt.sources.length !== EXPANDED_OFFICIAL_SOURCES.length ||
      receipt.commercial_eligible !== false ||
      receipt.source_rights_verified !== false ||
      receipt.verified_country_count !== 0) {
    throw new Error("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
  }
  const expected = new Map(EXPANDED_OFFICIAL_SOURCES.map(s => [s.id, s]));
  const rows = new Map();
  for (const row of receipt.sources) {
    const source = expected.get(row?.source_id);
    if (!source || rows.has(row.source_id) || row.domain !== source.domain ||
        row.commercial_eligible !== false ||
        row.commercial_rights_verified !== false ||
        row.current_scored_intelligence_verified !== false ||
        row.country_coverage_verified !== false ||
        typeof row.format_valid !== "boolean" ||
        typeof row.publisher_reachable !== "boolean" ||
        (row.format_valid && (row.publisher_reachable !== true ||
          row.primary_http_status !== 200)) ||
        (row.primary_http_status !== null &&
          (!integer(row.primary_http_status) || row.primary_http_status > 599))) {
      throw new Error("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
    }
    rows.set(row.source_id, row);
  }
  if (rows.size !== expected.size) throw new Error("STEP1_SOURCE_RECEIPT_INCOMPLETE");

  const categories = DOMAINS.map(domain => {
    const sourceIds = Object.keys(ORIGINAL_ISSUERS[domain]);
    const available = [];
    const unavailable = [];
    for (const id of sourceIds) {
      const row = rows.get(id);
      const good = row?.format_valid === true &&
        row.publisher_reachable === true &&
        row.primary_http_status === 200 &&
        integer(row.source_native_release_items) &&
        integer(row.source_native_24h_release_items) &&
        row.source_native_24h_release_items <= row.source_native_release_items &&
        integer(row.original_publisher_topical_6h) &&
        integer(row.original_publisher_topical_90m) &&
        integer(row.original_publisher_topical_30m) &&
        row.original_publisher_topical_30m <= row.original_publisher_topical_90m &&
        row.original_publisher_topical_90m <= row.original_publisher_topical_6h;
      (good ? available : unavailable).push(id);
    }
    const independent = new Set(available.map(id => ORIGINAL_ISSUERS[domain][id]));
    return {
      category: domain,
      sampled_original_issuers: sourceIds.length,
      transport_healthy_independent_issuers: independent.size,
      transport_healthy_source_ids: available,
      transport_unavailable_source_ids: unavailable,
      two_independent_original_transport_floor_met: independent.size >= 2,
      // Must be checked against EACH ORIGINAL ARTICLE, not issuer country.
      per_article_country_relevance_verified: false,
      per_article_source_rights_verified: false,
      same_event_independent_corroboration_verified: false,
      current_signed_commercial_intelligence_verified: false,
    };
  });
  const failed = receipt.sources
    .filter(row => !row.format_valid)
    .map(row => ({
      source_id: row.source_id,
      category: row.domain,
      http_status: row.primary_http_status,
      reason: ["PUBLISHER_DENIED", "PUBLISHER_RATE_LIMITED",
        "TRANSPORT_UNAVAILABLE", "PUBLISHER_HTTP_NOT_OK",
        "SOURCE_CONTENT_TYPE_INVALID", "SOURCE_SHAPE_UNVERIFIED",
        "SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE", "SOURCE_BODY_READ_FAILURE",
        "SOURCE_ENCODING_INVALID"].includes(row.reason)
        ? row.reason : "UNCLASSIFIED_SOURCE_FAILURE",
      no_access_control_bypass: true,
    }));
  const categoryFloor = categories.every(x => x.two_independent_original_transport_floor_met);
  return {
    schema: "geomacro.official-step1-source-readiness.v1",
    upstream_observed_at: receipt.observed_at,
    source_inventory_count: rows.size,
    source_transport_healthy_count: rows.size - failed.length,
    source_transport_failed_count: failed.length,
    all_sources_working: failed.length === 0,
    per_category_two_independent_issuers_transport_healthy: categoryFloor,
    status: !categoryFloor ? "ORIGINAL_ISSUER_REDUNDANCY_INSUFFICIENT" :
      failed.length ? "ORIGINAL_ISSUER_REDUNDANCY_OBSERVED_WITH_SOURCE_FAILURES" :
      "ORIGINAL_ISSUER_REDUNDANCY_OBSERVED",
    country_article_relevance_and_rights_approved: false,
    fresh_same_event_corroboration_approved: false,
    step1_end_to_end_accepted: false,
    commercial_eligible: false,
    safe_source_failures: failed,
    categories,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const input = process.argv[2] ?? "artifacts/expanded-official-source/transport.json";
    const output = "artifacts/expanded-official-source/step1-issuer-readiness.json";
    const result = auditOfficialStep1Feeds(JSON.parse(readFileSync(input, "utf8")));
    mkdirSync("artifacts/expanded-official-source", { recursive: true });
    writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
    // No upstream article title, article URL, body or metadata payload logged.
    console.log(JSON.stringify({
      status: result.status,
      source_transport_failed_count: result.source_transport_failed_count,
      per_category_two_independent_issuers_transport_healthy:
        result.per_category_two_independent_issuers_transport_healthy,
      step1_end_to_end_accepted: false,
    }));
    if (!result.per_category_two_independent_issuers_transport_healthy)
      process.exitCode = 3;
  } catch {
    console.error("::error::OFFICIAL_STEP1_RECEIPT_INVALID");
    process.exitCode = 2;
  }
}
