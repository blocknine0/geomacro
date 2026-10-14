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
import {buildAgentQueryPlan} from "../../src/lib/agent-query-plan";
import {bindPrivateFedMinutesToExactCustomerQuery}
  from "../../src/lib/on-demand-private-query-bound-draft.server";

const now=new Date();
// This is a READ-ONLY HISTORICAL research acceptance. October 13's Board
// minutes become older than 24 hours on October 14 at 18:00Z; do not
// fabricate a fresh event or silently switch the product's default window.
// A fixed seven-day lookback is strictly within the canonical 31-day cap.
const HISTORICAL_WINDOW_SECONDS=7*86_400;
const customerRequest={
  question:"When did the Federal Reserve Board publish its August and September 2026 discount-rate meeting minutes?",
  subjects:[{type:"country" as const,country_iso3:"USA"}],
  topics:["macro_risk" as const],
  fulfillment_mode:"live_on_demand" as const,
  max_age_seconds:HISTORICAL_WINDOW_SECONDS,
};
const plan=buildAgentQueryPlan(customerRequest);
const search={country_iso3:"USA",categories:["macro" as const],
  topics:["macro_risk"],max_age_seconds:HISTORICAL_WINDOW_SECONDS};
const proof=await discoverOnDemandForPrivateQualification(search,{
  now,disableDiscoveryIndex:true,
});
const fed=proof.private_original_review_candidates.filter(x=>
  x.publisher_family==="us_federal_reserve_original_publisher");
const pages=await verifyOnDemandOriginalArticlePages(fed,{
  now,maxAgeSeconds:HISTORICAL_WINDOW_SECONDS,
});
const qualified=qualifyRetrievedOnDemandEvidence({
 search,discovery:proof.discovery,originals:fed,pageProof:pages,
 verifiedCountryName:proof.private_verified_country_name,macroChanges:[],now,
});
const finding=buildPrivateVerifiedFedMinutesFinding(qualified,pages,{
  observedAt:now,queryPlanHash:plan.query_plan_hash,
});
// Query-binding is independent from publisher discovery. Reject a finding
// for any different Board event, even if its issuer and rights look similar.
const bound=finding?bindPrivateFedMinutesToExactCustomerQuery({
  receivedRequest:customerRequest,canonicalPlan:plan,finding,
}):null;
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
  exact_customer_question_sha256_bound:bound?.ok===true,
  canonical_private_query_draft_verified:bound?.ok===true &&
    /^[a-f0-9]{64}$/u.test(bound.canonical_private_sha256) &&
    !bound.canonical_private_json.includes(customerRequest.question) &&
    !bound.canonical_private_json.includes(
      "https://www.federalreserve.gov/newsevents/pressreleases/"),
  query_binding_rejection:bound&&!bound.ok?bound.reason:null,
  explicit_historical_window_seconds:HISTORICAL_WINDOW_SECONDS,
  actually_historical_not_current:finding?.source_freshness?.classification===
    "HISTORICAL_ORIGINAL",
  // Aggregate-only exact original release age, no raw source URL/title/hash.
  verified_original_release_age_seconds:finding?.source_freshness?.original_age_seconds??null,
  original_freshness_classification:finding?.source_freshness?.classification??null,
  source_query_evidence_fingerprint_bound:Boolean(finding?.query_binding.discovery_query_fingerprint_sha256),
  exact_customer_question_verified:false,
  independent_same_event_review_verified:false,
  derived_only_answer_contains_required_attribution:Boolean(finding),
  rights_basis_review:"BOARD_OWNED_PUBLIC_DOMAIN_ATTRIBUTION_THIRD_PARTY_EXCLUSIONS",
  item_specific_commercial_admission_verified:false,
  independent_review_accepted:false,
  commercial_answer_qualified:false,
  query_bound_private_draft_not_for_delivery:true,
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
