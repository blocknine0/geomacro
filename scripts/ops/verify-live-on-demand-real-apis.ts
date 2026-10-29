#!/usr/bin/env bun
/**
 * Real (not mocked) read-only global API evidence acceptance.
 * Does not create a source right, signed GRO, a public intelligence object,
 * a B2 archive, D1 checkpoint, a USDC payment or an x402 settlement.
 * Exact customer example: CHN lithium supply risk x the same three
 * Geomacro categories. Maximum 12 discovery plus 4 original page GETs.
 * No unbounded search, source-identity leak, funds or extra workflow.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import {approvedOnDemandSourceHostname} from "../lib/on-demand-source-origin-allowlist.mjs";
import { buildPrivateOnDemandMacroDrivers } from "../../src/lib/on-demand-private-macro-drivers.server";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
} from "../../src/lib/on-demand-global-discovery.server";

// Strictly status-only observability around the SAME bounded live HTTP
// calls. Hostnames, article URLs, provider bodies, query strings and customer
// text are NOT emitted. Original publisher content remains ephemeral.
const FAMILY_BY_HOST:Readonly<Record<string,string>>={
  "api.worldbank.org":"world_bank",
  "api.gdeltproject.org":"gdelt",
  "api.reliefweb.int":"reliefweb",
  "www.gov.uk":"gov_uk",
  "news.un.org":"un_news",
  "www.federalreserve.gov":"federal_reserve",
  "www.ecb.europa.eu":"ecb",
  "www.minister.industry.gov.au":"australian_industry",
  "api.io.canada.ca":"canada_nrcan",
  "www.canada.ca":"canada_nrcan",
  "press.un.org":"un_press",
  "www.bis.org":"bis",
  "www.stats.gov.cn":"china_nbs",
  "www.boj.or.jp":"bank_of_japan",
  "www.iea.org":"iea",
  "www.bankofcanada.ca":"bank_of_canada",
  "news.gov.bc.ca":"bc_minerals",
  "www.consilium.europa.eu":"eu_council",
  "www.usgs.gov":"usgs",
  "www.energy.gov":"us_doe",
  "www.rbi.org.in":"rbi_india",
  "www.ungeneva.org":"un_geneva",
};
const outcomeCounts=new Map<string,Record<
  "ok_2xx"|"http_403"|"http_429"|"http_5xx"|"other_http"|"network_error",number
>>();
type Outcome=NonNullable<ReturnType<typeof outcomeCounts.get>>;
const makeOutcome=():Outcome=>({
  ok_2xx:0,http_403:0,http_429:0,http_5xx:0,other_http:0,network_error:0,
});
const addOutcome=(family:string,bucket:keyof Outcome)=>{
  const state=outcomeCounts.get(family)??makeOutcome();
  state[bucket]++;
  outcomeCounts.set(family,state);
};
const statusOnlyFetch:typeof fetch=async(input,init)=>{
  // The source discovery itself also verifies an independent fixed origin
  // allowlist. This wrapper refuses any unexpected request, not a new SSRF.
  let uri:URL;
  try {uri=new URL(String(input));} catch {throw Error("UNRECOGNIZED_PROBE_URL");}
  const family=FAMILY_BY_HOST[uri.hostname];
  if(uri.protocol!=="https:"||!approvedOnDemandSourceHostname(uri.hostname)||!family||
    uri.username||uri.password||uri.port||uri.hash)throw Error("UNRECOGNIZED_PROBE_ORIGIN");
  const kind=family==="world_bank" && uri.pathname.includes("/indicator/FP.CPI.TOTL.ZG")
    ?"world_bank_inflation":family==="world_bank" && uri.pathname.includes("/indicator/NY.GDP.MKTP.KD.ZG")
    ?"world_bank_gdp":family==="world_bank"
    ?"world_bank_country":family;
  try {
    const response=await fetch(input,init);
    addOutcome(kind,response.status>=200&&response.status<300?"ok_2xx":
      response.status===403?"http_403":
      response.status===429?"http_429":
      response.status>=500?"http_5xx":"other_http");
    return response;
  } catch {
    addOutcome(kind,"network_error");
    throw Error("BOUNDED_EXTERNAL_TRANSPORT_FAILURE");
  }
};

const privateEvidence=await discoverOnDemandForPrivateQualification({
  country_iso3:"CHN",
  categories:["geopolitics","macro","rare_earth"],
  mineral:"lithium",
  // Genuine country/query scope for each of the three existing categories.
  topics:["sanctions_restrictions","macro_risk","critical_minerals"],
  max_age_seconds:7*86_400,
},{fetchImpl:statusOnlyFetch});
const receipt=privateEvidence.discovery;
const privateMacroDrivers=buildPrivateOnDemandMacroDrivers(privateEvidence.private_macro_changes);
// PRIVATE evidence continuation: only the aggregate count may enter logs or
// artifacts. Original publisher URLs, page HTML and articles remain private.
const pageProof=await verifyOnDemandOriginalArticlePages(
  privateEvidence.private_original_review_candidates,
  {fetchImpl:statusOnlyFetch,maxAgeSeconds:7*86_400});
// A 2xx feed with zero matched records is NOT a usable China/query result.
// Annual WDI observations are explicitly structural, not current news.
const categoryRetrievalProof=receipt.categories.map(category=>{
  const providers=receipt.source_probes.filter(p=>p.category===category);
  const indexLeads=providers.filter(p=>
    ["gdelt_doc_discovery","reliefweb_discovery"].includes(p.family))
    .reduce((n,p)=>n+p.observed_record_count,0);
  const nativeOriginals=privateEvidence.private_candidates.filter(p=>
    p.domain===category && p.source_native_feed_publication_date_verified).length;
  const verifiedPages=pageProof.verified_candidates.filter(p=>
    p.domain===category).length;
  const annualStructural=category==="macro"?privateEvidence.private_macro_changes.length:0;
  return {
    category,
    provider_attempts:providers.length,
    reachable_providers:providers.filter(p=>p.reachable).length,
    index_only_discovery_leads:indexLeads,
    native_dated_original_leads:nativeOriginals,
    original_pages_date_verified:verifiedPages,
    annual_structural_observations:annualStructural,
    // Counts signal accessible query-relevant records, NOT rights/signing.
    sample_records_observed:
      indexLeads+nativeOriginals+verifiedPages+annualStructural>0,
  };
});
const proof={
  schema:"geomacro.live-on-demand-real-api-safety.v1",
  checked_at:receipt.checked_at,
  sample_country_iso3:receipt.country_iso3,
  sample_topic_mineral:"lithium",
  sample_case:"CHN_LITHIUM_CURRENT_SUPPLY_RISK",
  category_count:receipt.categories.length,
  categories:receipt.categories,
  category_retrieval_proof:categoryRetrievalProof,
  // This is a time-sensitive availability probe, not positive capability
  // acceptance. Genuine no-news is recorded, not misreported as an outage.
  current_news_availability:categoryRetrievalProof.map(x=>({
    category:x.category,
    status:x.native_dated_original_leads+x.original_pages_date_verified>0
      ? "ORIGINAL_PUBLISHER_LEAD_FOUND_NOT_SIGNED"
      : x.reachable_providers>0
        ? "NO_MATCHING_CURRENT_PUBLISHER_ORIGINAL"
        : "PROVIDERS_UNAVAILABLE",
  })),
  three_category_capability_proven_by_this_probe:false,
  network_attempts:receipt.network_attempts,
  original_article_page_attempts:pageProof.attempted,
  // Fixed-host, HTTP-status-class aggregate only. No original source URL,
  // path, query, header, response body or exception message.
  provider_http_outcomes:[...outcomeCounts.entries()]
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([family,counts])=>({family,...counts})),
  total_bounded_network_attempts:receipt.network_attempts+pageProof.attempted,
  parallel:receipt.searched_in_parallel,
  status:receipt.status,
  distinct_provider_families_reached:receipt.reached_source_families,
  providers:receipt.source_probes.map(row=>({
    family:row.family,
    reachable:row.reachable,
    discovered_records:row.observed_record_count,
    publisher_original_publication_clock_verified:row.publication_clock_verified,
    independent_claim_verified:row.independent_claim_verified,
    commercial_rights_verified:row.derived_commercial_rights_verified,
  })),
  private_original_candidate_count:privateEvidence.private_candidates.length,
  duplicate_original_headlines_suppressed:privateEvidence.duplicate_original_headline_count,
  // Connectivity != qualifying fresh original, reviewed same-event evidence,
  // commercially licensed supply-risk scoring or signed paid delivery.
  qualifying_fresh_original_found:privateEvidence.private_original_review_candidates.length>0,
  current_lithium_risk_answer_verified:false,
  x402_commercial_release_authorized:false,
  private_official_annual_change_count:privateEvidence.private_macro_changes.length,
  private_annual_directional_macro_driver_count:privateMacroDrivers.length,
  // Read-only: fixed WDI indicator names + bounded annual period/status only.
  // Never publish official numeric values, country-peer observations or hashes.
  private_world_bank_annual_qualification:privateEvidence.private_macro_qualifications,
  private_original_candidate_page_dates_verified:
    privateEvidence.private_original_review_candidates.length>0 &&
    pageProof.verified===privateEvidence.private_original_review_candidates.length,
  original_article_page_publication_date_verified_count:pageProof.verified,
  private_original_candidate_derived_rights_verified:false,
  published_signed_intelligence:receipt.signed_derived_intelligence_created,
  independently_corrobated_same_event:receipt.independent_same_event_corroboration_verified,
  commercially_licensed:receipt.source_derived_commercial_rights_verified,
  payable:receipt.payable,
  raw_upstream_delivered:receipt.raw_upstream_delivered,
  payment_settlement_attempted:receipt.settlement_attempted,
  supabase_requests:receipt.supabase_requests,
  b2_requests:receipt.b2_requests,
};
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/real-api-proof.json",
  JSON.stringify(proof,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(proof));
const observedRequests=proof.provider_http_outcomes.reduce((n,row)=>
  n+row.ok_2xx+row.http_403+row.http_429+row.http_5xx+
    row.other_http+row.network_error,0);
if(observedRequests!==proof.total_bounded_network_attempts ||
   proof.provider_http_outcomes.length>10 ||
   proof.current_lithium_risk_answer_verified!==false ||
   proof.x402_commercial_release_authorized!==false ||
   proof.sample_country_iso3!=="CHN" ||
   proof.sample_topic_mineral!=="lithium" ||
   proof.sample_case!=="CHN_LITHIUM_CURRENT_SUPPLY_RISK" ||
   proof.category_count!==3||proof.network_attempts>12 ||
   proof.original_article_page_attempts>4 ||
   proof.total_bounded_network_attempts>16 ||
   proof.original_article_page_publication_date_verified_count>
     proof.original_article_page_attempts ||
   proof.private_original_candidate_count>16 ||
   proof.duplicate_original_headlines_suppressed>16 ||
   proof.private_world_bank_annual_qualification.length>2 ||
   proof.private_world_bank_annual_qualification.some(p=>
     !["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"].includes(p.indicator) ||
     !Number.isInteger(p.accepted_annual_values) ||
     p.accepted_annual_values<0 || p.accepted_annual_values>6 ||
     (p.latest_observation_year!==null &&
       (!Number.isInteger(p.latest_observation_year) ||
        p.latest_observation_year>new Date().getUTCFullYear())) ||
     (p.previous_observation_year!==null &&
       (!Number.isInteger(p.previous_observation_year) ||
        p.previous_observation_year>new Date().getUTCFullYear()))) ||
   proof.private_official_annual_change_count>2 ||
   proof.private_annual_directional_macro_driver_count>
     proof.private_official_annual_change_count ||
   proof.network_attempts<1||proof.payable!==false||
   proof.raw_upstream_delivered!==false||
   proof.payment_settlement_attempted!==false||
   proof.supabase_requests!==0||proof.b2_requests!==0)
  process.exitCode=2;
else if(proof.distinct_provider_families_reached===0)
  process.exitCode=3; // zero genuine external sources; NOT false GREEN
else if(proof.category_retrieval_proof.length!==3 ||
    proof.category_retrieval_proof.some(p=>p.provider_attempts===0) ||
    proof.current_news_availability.some(p=>p.status==="PROVIDERS_UNAVAILABLE"))
  process.exitCode=4; // transport outage (no eligible provider reached)
else if(proof.three_category_capability_proven_by_this_probe!==false)
  process.exitCode=5; // negative/current-news probe cannot certify capability

