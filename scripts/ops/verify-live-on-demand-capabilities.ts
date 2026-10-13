#!/usr/bin/env bun
/**
 * Real, read-only capability acceptance, separate from "no news today".
 * Each chosen source is an established official adapter. We never inject
 * synthetic headlines, replace original publication dates, or contact GDELT
 * while its 429 is under investigation.
 */
import { mkdirSync,writeFileSync } from "node:fs";
import {qualifyPrivateOnDemandEvidence, publicOnDemandEvidenceDisposition} from "../../src/lib/on-demand-private-evidence-package.server";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
  type OnDemandCategory,
} from "../../src/lib/on-demand-global-discovery.server";

const cases:readonly {
  id:string; country_iso3:string; category:OnDemandCategory;
  topic:string; mineral?:"lithium"; max_age_seconds:number;
}[]=[
  {id:"RUS_OFFICIAL_CONFLICT_HISTORY",country_iso3:"RUS",
   category:"geopolitics",topic:"conflict_geopolitics",max_age_seconds:31*86_400},
  {id:"CHN_OFFICIAL_MACRO_HISTORY",country_iso3:"CHN",
   category:"macro",topic:"macro_risk",max_age_seconds:7*86_400},
  {id:"GBR_OFFICIAL_LITHIUM_HISTORY",country_iso3:"GBR",
   category:"rare_earth",topic:"critical_minerals",mineral:"lithium",
   max_age_seconds:31*86_400},
] as const;
const hosts=new Set(["api.worldbank.org","www.gov.uk","news.un.org",
  "www.federalreserve.gov","www.ecb.europa.eu","www.minister.industry.gov.au"]);
const results=[];
for(const sample of cases) {
  const responses:Record<string,Record<string,number>>={};
  let actualHttp=0;
  const fetchImpl:typeof fetch=async (input,init)=>{
    const url=new URL(String(input));
    if(url.protocol!=="https:" || !hosts.has(url.hostname) ||
      url.username || url.password || url.port || url.hash)
      throw Error("CAPABILITY_UNTRUSTED_ORIGIN");
    actualHttp++;
    try {
      const response=await fetch(input,init);
      const statusClass=response.status===429?"rate_limited":
        response.status===403?"forbidden":response.ok?"http_2xx":
        response.status>=500?"http_5xx":"other_http";
      const hist=responses[url.hostname]??={};
      hist[statusClass]=(hist[statusClass]??0)+1;
      return response;
    }catch {
      const hist=responses[url.hostname]??={};
      hist.network_error=(hist.network_error??0)+1;
      throw Error("CAPABILITY_NETWORK_FAILURE");
    }
  };
  const r=await discoverOnDemandForPrivateQualification({
    country_iso3:sample.country_iso3,categories:[sample.category],
    topics:[sample.topic],mineral:sample.mineral??null,
    max_age_seconds:sample.max_age_seconds,
  },{fetchImpl,disableDiscoveryIndex:true});
  const verified=await verifyOnDemandOriginalArticlePages(
    r.private_original_review_candidates,{
      fetchImpl,maxAgeSeconds:sample.max_age_seconds,
    });
  // Real publisher originals enter the exact private qualification bridge.
  // The PR runner has no approved rights secrets. Injecting a NULL rights
  // registry is a NEGATIVE test; it MUST leave signing/payment disabled.
  const qualified=await qualifyPrivateOnDemandEvidence({
    country_iso3:sample.country_iso3,
    categories:[sample.category],topics:[sample.topic],
    mineral:sample.mineral??null,
    max_age_seconds:sample.max_age_seconds,now:new Date(),
    feed_candidates:r.private_original_review_candidates,
    page_verified_candidates:verified.verified_candidates,
    annual_macro_changes:r.private_macro_changes,
  },{readRights:async()=>null});
  const safeQualified=publicOnDemandEvidenceDisposition(qualified);
  const dated=r.private_candidates
    .filter(x=>x.source_native_feed_publication_date_verified &&
      x.feed_item_published_at!==null);
  const pageVerified=verified.verified_candidates;
  const historicalMacro=r.private_macro_qualifications.filter(x=>
    x.status==="VALID_ANNUAL_CHANGE" &&
    x.latest_observation_year!==null);
  const independentOriginals=new Set([...dated,...pageVerified].map(x=>x.publisher_family));
  const hasOriginalEvidence=dated.length>0 || pageVerified.length>0;
  // Macro native annual reference observations are a separately labeled
  // structural capability, never treated as original-dated news.
  const structuralOnly=sample.category==="macro" && historicalMacro.length>0;
  const status=hasOriginalEvidence?"FIRST_PARTY_ORIGINAL_DATE_FOUND":
    structuralOnly?"ANNUAL_STRUCTURAL_ONLY":"NO_QUALIFYING_PUBLISHER_EVIDENCE";
  results.push({
    case_id:sample.id,country_iso3:sample.country_iso3,
    category:sample.category,max_age_seconds:sample.max_age_seconds,
    status,
    private_qualification:safeQualified,
    native_feed_published_at:dated.map(x=>x.feed_item_published_at).slice(0,4),
    original_page_published_at:pageVerified.map(x=>x.page_original_published_at).slice(0,4),
    original_publisher_families:[...independentOriginals].sort(),
    source_native_original_count:dated.length,
    original_page_date_verified:pageVerified.length,
    annual_structural_reference_years:historicalMacro.map(x=>x.latest_observation_year),
    original_candidate_count:r.private_candidates.length,
    attempts:r.discovery.network_attempts,
    page_attempts:verified.attempted,
    actual_http_calls:actualHttp,
    provider_responses:responses,
    native_feed_rejection_audit:r.discovery.source_probes.filter(p=>p.feed_audit)
      .map(p=>({family:p.family,...p.feed_audit})),
    supabase_requests:r.discovery.supabase_requests,
    b2_requests:r.discovery.b2_requests,
    signed:r.discovery.signed_derived_intelligence_created,
    payable:r.discovery.payable,
    // Test positivity is narrower than commercial release authorization.
    positive_capability:hasOriginalEvidence ||
      (sample.category==="macro" && structuralOnly),
  });
}
const proof={
  schema:"geomacro.live-official-three-category-capability.v1",
  checked_at:new Date().toISOString(),
  live_provider_fetches:true,
  original_publisher_content_stored:false,
  categories:results,
  all_three_positive:results.length===3 &&
    results.every(x=>x.positive_capability),
};
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/real-category-capability.json",
  JSON.stringify(proof,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(proof));
if(results.some(x=>x.attempts>12 || x.page_attempts>4 ||
  x.actual_http_calls!==x.attempts+x.page_attempts ||
  x.supabase_requests!==0 || x.b2_requests!==0 ||
  x.payable!==false || x.signed!==false ||
  x.private_qualification.x402_payment_authorized!==false ||
  x.private_qualification.qualified_signed_intelligence!==false))
  process.exitCode=2;
else if(!proof.all_three_positive) process.exitCode=4;
