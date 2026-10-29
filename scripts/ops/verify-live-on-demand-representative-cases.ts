#!/usr/bin/env bun
/**
 * Four independent REAL API scenarios, separate from historical regression.
 * Never use a single mineral/country to represent every category. No payment,
 * B2, D1, signing, new connectors, raw article export, or lasting raw storage.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {approvedOnDemandSourceHostname} from "../lib/on-demand-source-origin-allowlist.mjs";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
  type OnDemandCategory,
  type OnDemandMineral,
} from "../../src/lib/on-demand-global-discovery.server";
import {qualifyRetrievedOnDemandEvidence}
  from "../../src/lib/on-demand-evidence-qualification.server";

type Case={
  id:string; country_iso3:string; categories:OnDemandCategory[];
  topics:string[]; mineral:OnDemandMineral|null;
  max_age_seconds:number; time_class:"CURRENT_24H"|"RECENT_7D";
};
// Country/topic/window aligned to established, directly accessible first-party
// sources; no pretence that any named country MUST produce a new event today.
// The existing historical Russia/China/UK fixtures run separately.
const CASES:readonly Case[]=[
  {id:"RUS_GEO_24H",country_iso3:"RUS",
   categories:["geopolitics"],topics:["conflict_geopolitics"],
   mineral:null,max_age_seconds:86_400,time_class:"CURRENT_24H"},
  {id:"GBR_FX_24H",country_iso3:"GBR",
   categories:["macro"],topics:["fx_external_risk"],
   mineral:null,max_age_seconds:86_400,time_class:"CURRENT_24H"},
  {id:"GBR_MINERALS_24H",country_iso3:"GBR",
   categories:["rare_earth"],topics:["critical_minerals"],
   mineral:"lithium",max_age_seconds:86_400,time_class:"CURRENT_24H"},
  {id:"GBR_CROSS_DOMAIN_7D",country_iso3:"GBR",
   categories:["geopolitics","macro","rare_earth"],
   topics:["sanctions_restrictions","macro_risk","critical_minerals"],
   mineral:"lithium",max_age_seconds:7*86_400,time_class:"RECENT_7D"},
];
const checkedAt=new Date();
const cases=[];
let allNetwork=0;
let actualHttp2xx=0;
for(const sample of CASES){
  let totalHttp=0, successes=0, rateLimited=0, accessDenied=0, networkErrors=0;
  const countedFetch:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.protocol!=="https:" || !approvedOnDemandSourceHostname(url.hostname) ||
      url.username || url.password || url.port || url.hash)
      throw Error("REPRESENTATIVE_PROBE_UNRECOGNIZED_ORIGIN");
    totalHttp++;
    try{
      const response=await fetch(input,init);
      if(response.ok)successes++;
      if(response.status===429)rateLimited++;
      if(response.status===403)accessDenied++;
      return response;
    }catch{
      networkErrors++;
      throw Error("REPRESENTATIVE_PROBE_TRANSPORT_FAILURE");
    }
  };
  const query={
    country_iso3:sample.country_iso3,
    categories:sample.categories,
    topics:sample.topics,
    mineral:sample.mineral,
    max_age_seconds:sample.max_age_seconds,
  };
  const result=await discoverOnDemandForPrivateQualification(query,{
    fetchImpl:countedFetch,now:checkedAt,
    // Three source-aligned single-category checks rely on ORIGINAL publishers;
    // the separate cross-domain case still verifies index outage/fallback.
    // The injected observer deliberately does not inherit SSR process cooldown.
    disableDiscoveryIndex:sample.time_class==="CURRENT_24H",
  });
  const page=await verifyOnDemandOriginalArticlePages(
    result.private_original_review_candidates,{
      fetchImpl:countedFetch,now:checkedAt,maxAgeSeconds:sample.max_age_seconds,
    });
  const qualified=qualifyRetrievedOnDemandEvidence({
    search:query,discovery:result.discovery,
    originals:result.private_original_review_candidates,
    verifiedCountryName:result.private_verified_country_name,
    pageProof:page,macroChanges:result.private_macro_changes,
    now:checkedAt,
  });
  const perCategory=sample.categories.map(category=>{
    const probes=result.discovery.source_probes.filter(p=>p.category===category);
    const originals=qualified.originals.filter(p=>p.category===category);
    return {
      category,provider_attempts:probes.filter(p=>p.attempted).length,
      reachable_providers:probes.filter(p=>p.reachable).length,
      first_party_originals_with_verified_dates:originals.length,
      original_pages_verified:page.verified_candidates.filter(p=>
        p.domain===category).length,
      official_annual_structural_rows:category==="macro"
        ?qualified.structural.length:0,
      independent_same_event_verified:qualified.qualified_for_same_event_signing,
      item_level_commercial_rights_verified:
        qualified.rights.original_article_rights_verified,
      signed_customer_delivery:false,
      current_status:originals.length>0
        ?"ORIGINAL_DATE_QUALIFIED_REVIEW_PENDING"
        :probes.some(p=>p.reachable)
          ?"NO_RELEVANT_ORIGINAL_IN_REQUESTED_WINDOW"
          :"ORIGINAL_PROVIDER_UNAVAILABLE",
    };
  });
  const attempted=result.discovery.network_attempts+page.attempted;
  if(attempted!==totalHttp || result.discovery.network_attempts>12 ||
    page.attempted>4 || totalHttp>16 ||
    result.discovery.supabase_requests!==0 ||
    result.discovery.b2_requests!==0 ||
    result.discovery.payable!==false ||
    result.discovery.signed_derived_intelligence_created!==false ||
    result.discovery.settlement_attempted!==false ||
    qualified.commercial_delivery_eligible!==false ||
    qualified.qualified_for_same_event_signing!==false)
    throw Error("REPRESENTATIVE_PROBE_NO_FUNDS_OR_BUDGET_INVARIANT");
  allNetwork+=totalHttp;
  actualHttp2xx+=successes;
  cases.push({
    case_id:sample.id,country_iso3:sample.country_iso3,
    time_class:sample.time_class,
    source_publication_window_seconds:sample.max_age_seconds,
    categories:perCategory,
    actual_network_attempts:totalHttp,
    real_http_2xx:successes,
    denied_http_403:accessDenied,
    rate_limited_http_429:rateLimited,
    network_errors:networkErrors,
    original_page_checks:page.attempted,
    commercial_delivery_eligible:false,
    signed_customer_delivery:false,
    no_current_event_is_a_valid_result:true,
  });
}
const proof={
  schema:"geomacro.live-source-aligned-four-case-readonly.v1",
  checked_at:checkedAt.toISOString(),
  source_provider_request_real:true,
  category_scope:["geopolitics","macro","rare_earth"],
  current_window_cases:3,cross_domain_recent_cases:1,
  strict_max_requests_per_case:16,
  actual_network_requests:allNetwork,
  all_cases:cases,
  raw_source_content_exported:false,
  source_urls_exported:false,
  per_article_rights_certified:false,
  signed_customer_answers:0,
  supabase_reads:0,b2_requests:0,d1_writes:0,
  payment_offers_created:0,settlements:0,
};
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/representative-source-cases.json",
  JSON.stringify(proof,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(proof));
if(allNetwork>64 || cases.length!==4 ||
   actualHttp2xx===0 || cases.some(row=>
    row.actual_network_attempts>16 || row.signed_customer_delivery!==false))
  process.exitCode=4;
