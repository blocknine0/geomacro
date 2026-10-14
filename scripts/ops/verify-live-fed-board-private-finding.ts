#!/usr/bin/env bun
/**
 * Actual Federal Reserve original-source -> canonical engine -> structured
 * PRIVATE finding acceptance. No raw article text, URL, title, key or
 * customer-answer bytes in stdout, artifacts, public D1/B2 or x402.
 * No payment, persistent writes, Supabase or signing.
 */
import {discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages} from "../../src/lib/on-demand-global-discovery.server";
import {qualifyRetrievedOnDemandEvidence,buildPrivateVerifiedFedMinutesFinding}
  from "../../src/lib/on-demand-evidence-qualification.server";

const now=new Date();
const search={country_iso3:"USA",categories:["macro" as const],
  topics:["macro_risk"],max_age_seconds:86_400};
const proof=await discoverOnDemandForPrivateQualification(search,{
  now,disableDiscoveryIndex:true,
});
const fed=proof.private_original_review_candidates.filter(x=>
  x.publisher_family==="us_federal_reserve_original_publisher");
const pages=await verifyOnDemandOriginalArticlePages(fed,{
  now,maxAgeSeconds:86_400,
});
const qualified=qualifyRetrievedOnDemandEvidence({
 search,discovery:proof.discovery,originals:fed,pageProof:pages,
 verifiedCountryName:proof.private_verified_country_name,macroChanges:[],now,
});
const finding=buildPrivateVerifiedFedMinutesFinding(qualified,pages);
const originalPageVerified=pages.verified_candidates.filter(x=>
  x.publisher_family==="us_federal_reserve_original_publisher").length;
const archiveProbe=proof.discovery.source_probes.find(x=>
  x.family==="us_federal_reserve_annual_archive");
const status=finding
 ? "GENUINE_SOURCE_BOUND_STRUCTURED_DRAFT_REVIEW_PENDING":
   fed.length && originalPageVerified
     ? "ORIGINAL_PAGE_VERIFIED_NO_CONFIRMED_BOARD_MINUTES_BODY":
       fed.length?"FED_CANDIDATE_CLOCK_OR_ORIGINAL_PAGE_UNVERIFIED":
         "NO_MATCHING_FED_ORIGINAL_IN_CURRENT_WINDOW";
const summary={
  schema:"geomacro.real-fed-original-to-private-finding.v1",
  checked_at:now.toISOString(),category:"macro",country_iso3:"USA",
  verified_original_issuer:"federal_reserve_board",
  official_feed_reached:proof.discovery.source_probes.some(x=>
    x.family==="us_federal_reserve_original_publisher" && x.reachable===true),
  original_feed_candidates:fed.length,
  official_archive_attempted:Boolean(archiveProbe),
  official_archive_reachable:archiveProbe?.reachable===true,
  official_archive_matching_article_leads:archiveProbe?.observed_record_count??0,
  official_archive_transport_state:archiveProbe?.retrieval_state??"NOT_ATTEMPTED",
  publisher_page_attempts:pages.attempted,
  page_original_dates_verified:originalPageVerified,
  original_board_minute_release_body_verified:Boolean(finding),
  source_bound_structured_answer_candidates:finding?1:0,
  derived_only_answer_contains_required_attribution:Boolean(finding),
  rights_basis_review:"BOARD_OWNED_PUBLIC_DOMAIN_ATTRIBUTION_THIRD_PARTY_EXCLUSIONS",
  item_specific_commercial_admission_verified:false,
  independently_correlated_fx_impact:false,
  registered_signature_verified:false,immutable_customer_bytes_verified:false,
  x402_payment_authorized:false,original_url_logged:false,
  article_title_logged:false,source_payload_persisted:false,
  network_attempts:proof.discovery.network_attempts,
  supabase_calls:proof.discovery.supabase_requests,b2_calls:proof.discovery.b2_requests,
  status,
};
console.log(JSON.stringify(summary));
if(summary.network_attempts>12 || pages.attempted>4 ||
   summary.supabase_calls!==0 || summary.b2_calls!==0 ||
   proof.discovery.payable || qualified.commercial_delivery_eligible ||
   qualified.qualified_for_same_event_signing || qualified.raw_data_delivered)
 process.exitCode=2;
