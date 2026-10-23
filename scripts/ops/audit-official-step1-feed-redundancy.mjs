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
import { isQuarantinedOfficialRoute } from "../lib/official-source-quarantine.mjs";

const ORIGINAL_ISSUERS = Object.freeze({
  geopolitics: Object.freeze({
    un_news_security_original_rss_review: "united_nations",
    uk_fcdo_original_foreign_policy_atom_review: "uk_fcdo",
    uk_mod_original_defence_atom_review: "uk_mod",
    uk_cabinet_security_original_atom_review: "uk_cabinet_office",
  }),
  macro: Object.freeze({
    statcan_prices_original_atom_review: "statistics_canada",
    fed_monetary_original_press_rss_review: "federal_reserve",
    ecb_press_original_rss_review: "ecb",
    uk_hmt_original_treasury_atom_review: "uk_hmt",
    uk_dbt_macro_trade_original_atom_review: "uk_department_business_trade",
  }),
  rare_earth: Object.freeze({
    nrcan_government_news_original_atom_review: "natural_resources_canada",
    usgs_minerals_original_news_rss_review: "us_geological_survey",
    australia_industry_minister_original_rss_review: "australian_industry_department",
    uk_dbt_critical_minerals_atom_pending_review: "uk_department_business_trade",
    uk_desnz_original_energy_minerals_atom_review: "uk_desnz",
    bc_minerals_original_rss_review: "british_columbia_mining_ministry",
  }),
});
const DOMAINS = Object.freeze(["geopolitics", "macro", "rare_earth"]);
const integer = n => Number.isSafeInteger(n) && n >= 0;
/** Strict same-publisher recovery only. Never accept an alternate from a
 * different organization, a 401/403/429 response, or a fabricated HTTP 200.
 * Recovery proves transport, not independent corroboration or usage rights. */
function verifiedPublisherTransport(row, source) {
  if (row?.primary_http_status === 200 &&
      row.official_same_publisher_fallback_attempted !== true &&
      row.official_same_publisher_fallback_used !== true)
    return true;
  if (source?.network_fallback_same_publisher !== true ||
      typeof source.alternate_url !== "string" ||
      new URL(source.url).hostname !== new URL(source.alternate_url).hostname)
    return false;
  const code=row?.primary_http_status;
  return row?.official_same_publisher_fallback_attempted===true &&
    row?.official_same_publisher_fallback_used===true &&
    row?.fallback_http_status===200 &&
    (code===null || code===404 || (integer(code) && code>=500 && code<=599)) &&
    row?.official_locale_fallback_attempted!==true;
}

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
        (row.quarantined===true && (
          !isQuarantinedOfficialRoute(row.source_id) ||
          row.reason!=="QUARANTINED_NOT_POLLED" ||
          row.primary_http_status!==null ||
          row.publisher_reachable!==false ||
          row.format_valid!==false)) ||
        (row.format_valid && (row.publisher_reachable !== true ||
          !verifiedPublisherTransport(row,source))) ||
        (!row.format_valid && row.publisher_reachable) ||
        (source.original_hosts && row.format_valid && (
          !integer(row.source_native_release_items) ||
          !integer(row.source_native_24h_release_items) ||
          row.source_native_24h_release_items > row.source_native_release_items ||
          !integer(row.original_publisher_topical_6h) ||
          !integer(row.original_publisher_topical_90m) ||
          !integer(row.original_publisher_topical_30m) ||
          row.original_publisher_topical_30m > row.original_publisher_topical_90m ||
          row.original_publisher_topical_90m > row.original_publisher_topical_6h)) ||
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
        verifiedPublisherTransport(row,expected.get(id)) &&
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
        "SOURCE_ENCODING_INVALID", "QUARANTINED_NOT_POLLED"].includes(row.reason)
        ? row.reason : "UNCLASSIFIED_SOURCE_FAILURE",
      no_access_control_bypass: true,
      quarantined: row.quarantined===true,
    }));
  const categoryFloor = categories.every(x => x.two_independent_original_transport_floor_met);
  const quarantine=failed.filter(x=>x.quarantined===true).length;
  const activeFailures=failed.length-quarantine;
  return {
    schema: "geomacro.official-step1-source-readiness.v1",
    upstream_observed_at: receipt.observed_at,
    source_inventory_count: rows.size,
    source_transport_healthy_count: rows.size - failed.length,
    source_transport_failed_count: failed.length,
    source_transport_live_failure_count: activeFailures,
    source_transport_quarantined_not_polled_count: quarantine,
    all_sources_working: failed.length === 0,
    per_category_two_independent_issuers_transport_healthy: categoryFloor,
    status: !categoryFloor ? "ORIGINAL_ISSUER_REDUNDANCY_INSUFFICIENT" :
      activeFailures ? "ORIGINAL_ISSUER_REDUNDANCY_OBSERVED_WITH_SOURCE_FAILURES" :
      quarantine ? "ORIGINAL_ISSUER_REDUNDANCY_OBSERVED_WITH_QUARANTINE" :
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
      source_transport_live_failure_count: result.source_transport_live_failure_count,
      source_transport_quarantined_not_polled_count:
        result.source_transport_quarantined_not_polled_count,
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
