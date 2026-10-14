#!/usr/bin/env bun
/** Existing canonical read-only original-source engine; quota-safe bounded
 * country-category acceptance. This is NOT a country-wide feed poller.
 * Does NOT read or write B2/Supabase/D1 or authorize x402/signing.
 * Output only country ISO3, category and safe aggregate statuses.
 */
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195";
import {COVERAGE_DOMAINS_195,buildCanonical195x3CoverageMatrix,
  type CoverageObservation195} from "../../src/lib/canonical-195-country-coverage-matrix";
import {discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages} from "../../src/lib/on-demand-global-discovery.server";

const from=Number(process.env.GEOMACRO_COUNTRY_BATCH_START??"0");
const count=Number(process.env.GEOMACRO_COUNTRY_BATCH_COUNT??"1");
if(!Number.isSafeInteger(from)||from<0||from>=195||
   !Number.isSafeInteger(count)||count<1||count>2||from+count>195)
 throw Error("COUNTRY_195_SAFE_BATCH_RANGE_INVALID");
const observations:CoverageObservation195[]=[];
let totalProviderRequests=0,totalPageRequests=0;
for(const country of COUNTRIES_195.slice(from,from+count)){
 for(const category of COVERAGE_DOMAINS_195){
  // An absent original event is not independent evidence of NO_CURRENT_EVIDENCE:
  // the global index can be blocked, and provider selection is bounded.
  const search={country_iso3:country.iso3,categories:[category],
    topics:[],max_age_seconds:86_400};
  try{
   const fetched=await discoverOnDemandForPrivateQualification(search,{now:new Date()});
   if(fetched.discovery.network_attempts>12)throw Error("OVER_BUDGET");
   totalProviderRequests+=fetched.discovery.network_attempts;
   const issuers=fetched.discovery.source_probes.filter(p=>
     p.reachable===true && p.family!=="gdelt_doc_discovery" &&
     p.family!=="reliefweb_discovery" &&
     !p.family.startsWith("world_bank_official_"));
   const candidates=fetched.private_original_review_candidates.filter(p=>
     p.domain===category);
   const verified=await verifyOnDemandOriginalArticlePages(candidates,{
     now:new Date(),maxAgeSeconds:86_400,
   });
   totalPageRequests+=verified.attempted;
   if(verified.attempted>4)throw Error("ARTICLE_BUDGET_EXCEEDED");
   const proofs=verified.verified_candidates.filter(x=>x.domain===category);
   // HTTP 200 from a global feed alone is NOT country-specific original
   // coverage. An actual country-relevant first-party original is required.
   const countryRelevantOrigin=issuers.length>0 && candidates.length>0;
   const observed:CoverageObservation195={
     iso3:country.iso3,category,live_source_reachable:countryRelevantOrigin,
     original_evidence_verified:proofs.length>0,
     current_evidence_available:proofs.length>0 ? true : undefined,
     rights_qualified:false,signed_delivery_verified:false,
     blocked_reason:proofs.length>0?"ITEM_RIGHTS_REVIEW_PENDING":
       candidates.length?"ORIGINAL_PUBLICATION_UNVERIFIED":
       issuers.length?"NO_COUNTRY_RELEVANT_ORIGINAL":"PROVIDER_UNAVAILABLE",
   };
   observations.push(observed);
  }catch{
   observations.push({iso3:country.iso3,category,
     live_source_reachable:false,original_evidence_verified:false,
     rights_qualified:false,signed_delivery_verified:false,
     blocked_reason:"PROVIDER_UNAVAILABLE"});
  }
 }
}
const matrix=buildCanonical195x3CoverageMatrix(observations);
const selectedCountries=new Set(COUNTRIES_195.slice(from,from+count).map(c=>c.iso3));
const cells=matrix.cells.filter(x=>selectedCountries.has(x.country_iso3));
console.log(JSON.stringify({
 schema:"geomacro.195-country-safe-readonly-batch.v1",
 country_registry_version:matrix.country_registry_version,
 batch_start:from,batch_count:count,category_count:3,
 observed_cells:cells.length,total_country_baseline:195,
 country_relevant_live_original_candidates:cells.filter(x=>x.LIVE_SOURCE_REACHABLE===true).length,
 HTTP_reachability_without_country_original_is_not_coverage:true,
 original_page_verified:cells.filter(x=>x.ORIGINAL_EVIDENCE_VERIFIED===true).length,
 // No fresh-event licence or independent reviewer receipt was checked.
 commercial_rights_verified:0,signed_delivery_verified:0,
 provider_requests:totalProviderRequests,original_page_requests:totalPageRequests,
 source_urls_logged:false,source_titles_logged:false,raw_data_persisted:false,
 supabase_requests:0,b2_requests:0,real_money_payments:0,
 cells:cells.map(x=>({
   iso3:x.country_iso3,category:x.category,
   ROUTING_VERIFIED:x.ROUTING_VERIFIED,
   LIVE_SOURCE_REACHABLE:x.LIVE_SOURCE_REACHABLE,
   ORIGINAL_EVIDENCE_VERIFIED:x.ORIGINAL_EVIDENCE_VERIFIED,
   CURRENT_EVIDENCE_AVAILABLE:x.CURRENT_EVIDENCE_AVAILABLE,
   RIGHTS_QUALIFIED:x.RIGHTS_QUALIFIED,
   SIGNED_DELIVERY_VERIFIED:x.SIGNED_DELIVERY_VERIFIED,
   NO_CURRENT_EVIDENCE:x.NO_CURRENT_EVIDENCE,
   BLOCKED:x.BLOCKED,
 })),
}));
