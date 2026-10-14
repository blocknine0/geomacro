#!/usr/bin/env bun
/**
 * Genuine, read-only first-party Canada original-source acceptance.
 * Never write source URLs, page text, item titles, source IDs or exact answer
 * bytes to logs, artifacts, public D1, B2, Supabase, or customer responses.
 * A valid day-only original is NOT an exact UTC publication instant.
 */
import {discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages} from "../../src/lib/on-demand-global-discovery.server";
import {qualifyRetrievedOnDemandEvidence} from "../../src/lib/on-demand-evidence-qualification.server";

const now=new Date();
const search={country_iso3:"CAN",categories:["rare_earth" as const],
  topics:["critical_minerals"],max_age_seconds:31*86400};
const d=await discoverOnDemandForPrivateQualification(search,
  {now,disableDiscoveryIndex:true});
const c=d.private_original_review_candidates.filter(x=>
  x.publisher_family==="canada_nrcan_original_publisher");
const proof=await verifyOnDemandOriginalArticlePages(c,{now,maxAgeSeconds:31*86400});
const q=qualifyRetrievedOnDemandEvidence({
  search,discovery:d.discovery,originals:c,pageProof:proof,
  verifiedCountryName:d.private_verified_country_name,
  macroChanges:[],now,
});
const candidateCount=c.length;
const dayCount=proof.day_only_originals?.length??0;
const exactCount=proof.verified_candidates.filter(x=>
  x.publisher_family==="canada_nrcan_original_publisher").length;
const relevantCount=q.originals.filter(x=>
  x.source_family==="canada_nrcan_original_publisher").length;
const probe=d.discovery.source_probes.find(x=>x.family==="canada_nrcan_original_publisher");
const status=exactCount>0?"EXACT_ORIGINAL_PAGE_TIME_VERIFIED_NOT_COMMERCIAL":
  dayCount>0?"DAY_PRECISION_ONLY_NOT_COMMERCIAL":
  candidateCount>0?"NO_VERIFIED_PUBLICATION_WINDOW":
  probe?.reachable?"NO_MATCHED_NRCAN_FEED_CANDIDATE":"NRCAN_TRANSPORT_UNAVAILABLE";
const out={
  schema:"geomacro.real-nrcan-private-original-readonly.v1",
  checked_at:now.toISOString(),country_iso3:"CAN",category:"rare_earth",
  independent_live_provider_attempt:true,
  official_feed_reachable:probe?.reachable===true,
  issuer_native_dated_candidates:c.filter(x=>x.source_native_feed_publication_date_verified).length,
  article_page_attempts:proof.attempted,source_candidates:candidateCount,
  exact_first_party_page_clocks:exactCount,calendar_day_only_originals:dayCount,
  current_or_historical_relevant_originals_in_31d:relevantCount,
  original_identity_from_D1:false,
  independent_same_event_fact_verification:false,
  article_commercial_rights_verified:false,
  qualified_for_signed_delivery:false,
  x402_payment_authorized:false,
  total_discovery_network_attempts:d.discovery.network_attempts,
  supabase_requests:d.discovery.supabase_requests,
  b2_requests:d.discovery.b2_requests,
  original_url_logged:false,source_title_logged:false,
  status,
};
console.log(JSON.stringify(out));
if(d.discovery.network_attempts>12||proof.attempted>4||
   out.supabase_requests!==0||out.b2_requests!==0||
   d.discovery.payable||d.discovery.signed_derived_intelligence_created||
   q.qualified_for_same_event_signing||q.commercial_delivery_eligible)
  process.exitCode=2;
