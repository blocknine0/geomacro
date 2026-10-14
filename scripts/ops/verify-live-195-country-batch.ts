#!/usr/bin/env bun
/** One existing canonical on-demand discovery + page verifier PER COUNTRY.
 * All three domains share the single 12-GET / 4-first-party-page budget.
 * Bounded read-only verified-source acceptance, NEVER product readiness.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195";
import {COVERAGE_DOMAINS_195,buildCanonical195x3CoverageMatrix,
  type CoverageObservation195} from "../../src/lib/canonical-195-country-coverage-matrix";
import {discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages} from "../../src/lib/on-demand-global-discovery.server";
import {COUNTRY_BATCH_REVIEWED_TOPICS,summarizeCountryBatchCell,
  type CountryBatchCellEvidence} from "../../src/lib/country-195-batch-evidence";

const from=Number(process.env.GEOMACRO_COUNTRY_BATCH_START??"0");
const count=Number(process.env.GEOMACRO_COUNTRY_BATCH_COUNT??"1");
if(!Number.isSafeInteger(from)||from<0||from>=195||
   !Number.isSafeInteger(count)||count<1||count>2||from+count>195)
 throw Error("COUNTRY_195_SAFE_BATCH_RANGE_INVALID");

const observations:CoverageObservation195[]=[];
const review=new Map<string,CountryBatchCellEvidence>();
const probeStartedAt=new Date().toISOString();
let totalProviderRequests=0,totalPageRequests=0;
let completedCountries=0,discoveryCalls=0,verifiedPageCalls=0;
let structuralAnnualObservationCells=0;
for(const country of COUNTRIES_195.slice(from,from+count)){
 const observedAt=new Date();
 // Do not repeat one country lookup and issuer source fanout three times.
 // The existing multicategory engine selects one original institution per
 // domain plus a country-relevant independent fallback within its budget.
 const search={
   country_iso3:country.iso3,categories:[...COVERAGE_DOMAINS_195],
   topics:[...COUNTRY_BATCH_REVIEWED_TOPICS],max_age_seconds:86_400,
 };
 try {
  discoveryCalls++;
  const fetched=await discoverOnDemandForPrivateQualification(search,{now:observedAt});
  const actualNetwork=fetched.discovery.network_attempts;
  if(!Number.isSafeInteger(actualNetwork)||actualNetwork<0||actualNetwork>12)
   throw Error("COUNTRY_195_DISCOVERY_BUDGET_EXCEEDED");
  totalProviderRequests+=actualNetwork;
  if(totalProviderRequests>12*count)
   throw Error("COUNTRY_195_DISCOVERY_BUDGET_EXCEEDED");
  verifiedPageCalls++;
  const pages=await verifyOnDemandOriginalArticlePages(
    fetched.private_original_review_candidates,{now:observedAt,maxAgeSeconds:86_400});
  if(!Number.isSafeInteger(pages.attempted)||pages.attempted<0||pages.attempted>4)
   throw Error("COUNTRY_195_ARTICLE_BUDGET_EXCEEDED");
  totalPageRequests+=pages.attempted;
  if(totalPageRequests>4*count)
   throw Error("COUNTRY_195_ARTICLE_BUDGET_EXCEEDED");
  for(const category of COVERAGE_DOMAINS_195){
   const evidence=summarizeCountryBatchCell(
     country.iso3,category,fetched.discovery.source_probes,
     fetched.private_original_review_candidates,pages.verified_candidates,
   );
   observations.push(evidence.observation);
   review.set(country.iso3+":"+category,evidence);
  }
  if(fetched.private_macro_changes.length>0)
   structuralAnnualObservationCells++;
 }catch(error){
  // Budget excess is fatal rather than falsely reported as an ordinary
  // inaccessible publisher. Provider failures remain explicitly unverified.
  if(error instanceof Error &&
     /^COUNTRY_195_(?:DISCOVERY|ARTICLE)_BUDGET_EXCEEDED$/u.test(error.message))
   throw error;
  for(const category of COVERAGE_DOMAINS_195){
   observations.push({iso3:country.iso3,category,
     blocked_reason:"PROVIDER_UNAVAILABLE"});
  }
 }
 completedCountries++;
}
const matrix=buildCanonical195x3CoverageMatrix(observations);
const selectedCountries=new Set(COUNTRIES_195.slice(from,from+count).map(c=>c.iso3));
const cells=matrix.cells.filter(x=>selectedCountries.has(x.country_iso3));
if(cells.length!==count*3||observations.length!==count*3||
   totalProviderRequests>count*12||totalPageRequests>count*4)
 throw Error("COUNTRY_195_BATCH_INTEGRITY_FAILED");

const report={
 schema:"geomacro.195-country-safe-readonly-batch.v2",
 country_registry_version:matrix.country_registry_version,
 probe_started_at:probeStartedAt,probe_finished_at:new Date().toISOString(),
 batch_start:from,batch_count:count,category_count:3,observed_cells:cells.length,
 total_country_baseline:195,total_category_cells:585,
 countries_actually_tested:completedCountries,
 discovery_calls:discoveryCalls,original_page_verifier_calls:verifiedPageCalls,
 // The cursor denotes where the next EXPLICIT authorized batch can resume.
 // It does not claim those remaining countries have already been visited.
 next_country_batch_start:(from+count)%195,
 remaining_country_positions_after_this_batch:195-(from+count),
 state_persisted_to:"GITHUB_ACTIONS_REDACTED_ARTIFACT_ONLY",
 live_source_cells:cells.filter(x=>x.LIVE_SOURCE_REACHABLE===true).length,
 country_relevance_verified_cells:cells.filter(x=>x.COUNTRY_RELEVANCE_VERIFIED===true).length,
 source_adapter_registered_cells:cells.filter(x=>x.SOURCE_ADAPTER_REGISTERED===true).length,
 independent_fallback_verified_cells:cells.filter(x=>x.INDEPENDENT_FALLBACK_VERIFIED===true).length,
 original_page_verified:cells.filter(x=>x.ORIGINAL_EVIDENCE_VERIFIED===true).length,
 structural_annual_observation_countries:structuralAnnualObservationCells,
 // All verification dimensions are independent. Publisher 2xx does not
 // mean matching country evidence; structural years are never fresh news.
 HTTP_reachability_without_country_original_is_not_coverage:true,
 unobserved_countries_are_not_negative_evidence:true,
 commercial_rights_verified:0,signed_delivery_verified:0,
 rights_checked:false,signing_checked:false,
 provider_requests:totalProviderRequests,original_page_requests:totalPageRequests,
 requests_per_country_cap:12,original_pages_per_country_cap:4,
 source_urls_logged:false,source_titles_logged:false,raw_data_persisted:false,
 supabase_requests:0,b2_requests:0,real_money_payments:0,
 cells:cells.map(x=>{
   const evidence=review.get(x.country_iso3+":"+x.category);
   return {
     iso3:x.country_iso3,category:x.category,
     ROUTING_VERIFIED:x.ROUTING_VERIFIED,
     SOURCE_ADAPTER_REGISTERED:x.SOURCE_ADAPTER_REGISTERED,
     LIVE_SOURCE_REACHABLE:x.LIVE_SOURCE_REACHABLE,
     COUNTRY_RELEVANCE_VERIFIED:x.COUNTRY_RELEVANCE_VERIFIED,
     ORIGINAL_EVIDENCE_VERIFIED:x.ORIGINAL_EVIDENCE_VERIFIED,
     CURRENT_EVIDENCE_AVAILABLE:x.CURRENT_EVIDENCE_AVAILABLE,
     INDEPENDENT_FALLBACK_VERIFIED:x.INDEPENDENT_FALLBACK_VERIFIED,
     RIGHTS_QUALIFIED:x.RIGHTS_QUALIFIED,
     STRUCTURED_ANSWER_ELIGIBLE:null,
     SIGNED_DELIVERY_VERIFIED:x.SIGNED_DELIVERY_VERIFIED,
     NO_CURRENT_EVIDENCE:x.NO_CURRENT_EVIDENCE,
     // This means none in the BOUNDED sample; never "global no news".
     NO_QUALIFYING_EVIDENCE_FOUND:evidence?.verdict===
       "NO_QUALIFYING_CURRENT_EVIDENCE" ? true :
       evidence?false:null,
     BLOCKED:x.BLOCKED,
     verdict:evidence?.verdict??"UNTESTED",
     original_publisher_families_reached:evidence?.live_original_publisher_families??0,
     original_country_relevant_candidates:evidence?.country_relevant_originals??0,
     original_pages_verified:evidence?.verified_original_pages??0,
     independent_verified_publisher_families:evidence?.fallback_original_publisher_families??0,
     restricted_publisher_attempts:evidence?.restricted_original_publishers??0,
     rate_limited_publisher_attempts:evidence?.rate_limited_original_publishers??0,
   };
 }),
};
mkdirSync("artifacts/country-195",{recursive:true,mode:0o700});
writeFileSync("artifacts/country-195/live-batch-checkpoint.v1.json",
  JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report));
