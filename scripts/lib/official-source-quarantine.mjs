/**
 * #1827: blocked legacy URL observations are preserved as explicit unknowns,
 * not repeatedly fetched, silently discarded, remapped or marked healthy.
 * Independent replacement institutions are polled by the normal mesh.
 *
 * Production evidence: main source workflow #38119569303, 2026-10-11 06:54Z.
 * EITI returned HTTP 403; NRCan Simply Science and USGS mineral RSS
 * transport unavailable. These URLs are NOT the active source set.
 */
export const QUARANTINED_OFFICIAL_SOURCE_ROUTES=Object.freeze({
  eiti_implementing_country_official_api_review:Object.freeze({
    original_status:"PUBLISHER_DENIED",last_observed_http_status:403,
    reason:"PUBLISHER_AUTHORIZATION_REQUIRED",
  }),
  nrcan_simply_science_official_rss_review:Object.freeze({
    original_status:"TRANSPORT_UNAVAILABLE",last_observed_http_status:null,
    reason:"PUBLISHER_TRANSPORT_UNAVAILABLE",
  }),
  usgs_minerals_original_news_rss_review:Object.freeze({
    original_status:"TRANSPORT_UNAVAILABLE",last_observed_http_status:null,
    reason:"PUBLISHER_CHALLENGE_OR_TRANSPORT_UNAVAILABLE",
  }),
});
export const isQuarantinedOfficialRoute=(id)=>
  Object.hasOwn(QUARANTINED_OFFICIAL_SOURCE_ROUTES,id);

/**
 * Returns intentionally incomplete status, no raw content or implied
 * current HTTP response. Historical 403 can NEVER be relabelled as current.
 */
export function quarantinedOfficialSourceReceipt(source) {
  const historical=QUARANTINED_OFFICIAL_SOURCE_ROUTES[source?.id];
  if(!historical)throw Error("UNKNOWN_QUARANTINE_ID");
  return {
    source_id:source.id,domain:source.domain,kind:source.kind,
    publisher_reachable:false,format_valid:false,
    source_native_release_items:null,source_native_24h_release_items:null,
    eurostat_native_dataset_data_updates_24h:null,
    eurostat_other_catalogue_changes_24h:null,
    topical_private_release_links_24h:null,
    original_publisher_topical_6h:null,original_publisher_topical_90m:null,
    original_publisher_topical_30m:null,
    original_page_precise_date_checks:0,original_page_precise_date_24h:0,
    official_locale_fallback_attempted:false,
    official_locale_fallback_used:false,
    // This run made NO request; never report a previous 403 as new HTTP.
    primary_http_status:null,fallback_http_status:null,
    same_event_independent_corroboration_verified:false,
    source_native_release_is_scored_event:false,
    country_coverage_verified:false,commercial_rights_verified:false,
    current_scored_intelligence_verified:false,commercial_eligible:false,
    reason:"QUARANTINED_NOT_POLLED",
    quarantine_historical_failure:historical.original_status,
    quarantine_last_observed_http_status:historical.last_observed_http_status,
    quarantined:true,
  };
}
