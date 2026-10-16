import {COUNTRIES_195,CANONICAL_195_VERSION,
  country195ByIso3} from "./canonical-country-registry-195";

export const COVERAGE_DOMAINS_195=["geopolitics","macro","rare_earth"] as const;
export type CoverageDomain195=typeof COVERAGE_DOMAINS_195[number];
export type CoverageObservation195=Readonly<{
  iso3:string;category:CoverageDomain195;
  source_adapter_registered?:boolean;
  live_source_reachable?:boolean;
  country_relevance_verified?:boolean;
  independent_fallback_verified?:boolean;
  original_evidence_verified?:boolean;
  current_evidence_available?:boolean;
  rights_qualified?:boolean;
  signed_delivery_verified?:boolean;
  no_current_evidence?:boolean;
  blocked_reason?:string;
}>;
const SAFE_BLOCKERS=new Set([
  "PROVIDER_NOT_LIVE_PROBED","PROVIDER_DENIED_401_403","PROVIDER_RATE_LIMIT_429",
  "PROVIDER_UNAVAILABLE","NO_COUNTRY_RELEVANT_ORIGINAL",
  "ORIGINAL_PUBLICATION_UNVERIFIED","SOURCE_IDENTITY_UNRESOLVED",
  "ITEM_RIGHTS_REVIEW_PENDING","NO_CURRENT_QUALIFYING_EVENT",
  "SECOND_INDEPENDENT_ORIGINAL_MISSING","SAME_EVENT_AND_RIGHTS_REVIEW_PENDING",
  "NO_REGISTERED_SIGNATURE","NO_DURABLE_CUSTOMER_READBACK",
]);
type Dimension=true|false|null;
/** Every value is three-valued: true (independently proven), false
 * (independently checked and denied), null (not yet observed).
 * ROUTING_VERIFIED is only a static canonical ISO3/category check.
 */
export type CoverageCell195=Readonly<{
 country_iso3:string;country_iso2:string;country_name:string;
 observer_state:boolean;category:CoverageDomain195;
 ROUTING_VERIFIED:true;
 SOURCE_ADAPTER_REGISTERED:Dimension;
 LIVE_SOURCE_REACHABLE:Dimension;
 COUNTRY_RELEVANCE_VERIFIED:Dimension;
 INDEPENDENT_FALLBACK_VERIFIED:Dimension;
 ORIGINAL_EVIDENCE_VERIFIED:Dimension;
 CURRENT_EVIDENCE_AVAILABLE:Dimension;
 RIGHTS_QUALIFIED:Dimension;
 SIGNED_DELIVERY_VERIFIED:Dimension;
 NO_CURRENT_EVIDENCE:Dimension;
 BLOCKED:string|null;
}>;
export function buildCanonical195x3CoverageMatrix(
 observations:readonly CoverageObservation195[]=[],
){
 const outcomes=new Map<string,CoverageObservation195>();
 for(const result of observations){
  if(!country195ByIso3(result.iso3) ||
     !COVERAGE_DOMAINS_195.includes(result.category))
   throw Error("COUNTRY_195_COVERAGE_OBSERVATION_SCOPE_INVALID");
  const key=result.iso3+":"+result.category;
  if(outcomes.has(key))throw Error("COUNTRY_195_DUPLICATE_COVERAGE_OBSERVATION");
  if(result.blocked_reason && !SAFE_BLOCKERS.has(result.blocked_reason))
   throw Error("COUNTRY_195_INVALID_GAP_REASON");
  // A current genuine event requires a verified original and a reachable
  // issuer; a signed answer requires verified rights, original and current
  // evidence. Never deduce successful proof from a configured endpoint.
  if(result.country_relevance_verified===true &&
       (result.live_source_reachable!==true || result.source_adapter_registered===false) ||
     result.independent_fallback_verified===true &&
       (result.country_relevance_verified!==true || result.original_evidence_verified!==true) ||
     result.original_evidence_verified===true &&
       result.live_source_reachable!==true ||
     result.current_evidence_available===true &&
       (result.original_evidence_verified!==true ||
        result.independent_fallback_verified!==true ||
        result.country_relevance_verified!==true ||
        result.rights_qualified!==true) ||
     result.rights_qualified===true &&
       result.original_evidence_verified!==true ||
     result.signed_delivery_verified===true &&
       (result.rights_qualified!==true ||
        result.current_evidence_available!==true) ||
     result.no_current_evidence===true &&
       result.current_evidence_available!==false)
   throw Error("COUNTRY_195_UNSUPPORTED_PROOF_PROMOTION");
  outcomes.set(key,result);
 }
 const cells:CoverageCell195[]=COUNTRIES_195.flatMap(country=>
  COVERAGE_DOMAINS_195.map(category=>{
   const r=outcomes.get(country.iso3+":"+category);
   return {
    country_iso3:country.iso3,country_iso2:country.iso2,
    country_name:country.name,observer_state:country.observer_state,category,
    ROUTING_VERIFIED:true as const,
    SOURCE_ADAPTER_REGISTERED:r?.source_adapter_registered??null,
    LIVE_SOURCE_REACHABLE:r?.live_source_reachable??null,
    COUNTRY_RELEVANCE_VERIFIED:r?.country_relevance_verified??null,
    INDEPENDENT_FALLBACK_VERIFIED:r?.independent_fallback_verified??null,
    ORIGINAL_EVIDENCE_VERIFIED:r?.original_evidence_verified??null,
    CURRENT_EVIDENCE_AVAILABLE:r?.current_evidence_available??null,
    RIGHTS_QUALIFIED:r?.rights_qualified??null,
    SIGNED_DELIVERY_VERIFIED:r?.signed_delivery_verified??null,
    NO_CURRENT_EVIDENCE:r?.no_current_evidence??null,
    BLOCKED:r?.blocked_reason??"PROVIDER_NOT_LIVE_PROBED",
   };
  }));
 return {
  schema:"geomacro.country-category-coverage-matrix.v1" as const,
  country_registry_version:CANONICAL_195_VERSION,
  country_count:COUNTRIES_195.length,category_count:3,cell_count:cells.length,
  routing_verified_counts:Object.fromEntries(COVERAGE_DOMAINS_195.map(
    c=>[c,cells.filter(x=>x.category===c&&x.ROUTING_VERIFIED).length])),
  // Distinct from static route registration, never default to 585.
  live_source_verified_counts:Object.fromEntries(COVERAGE_DOMAINS_195.map(
    c=>[c,cells.filter(x=>x.category===c&&x.LIVE_SOURCE_REACHABLE===true).length])),
  current_evidence_verified_counts:Object.fromEntries(COVERAGE_DOMAINS_195.map(
    c=>[c,cells.filter(x=>x.category===c&&x.CURRENT_EVIDENCE_AVAILABLE===true).length])),
  signed_delivery_verified_counts:Object.fromEntries(COVERAGE_DOMAINS_195.map(
    c=>[c,cells.filter(x=>x.category===c&&x.SIGNED_DELIVERY_VERIFIED===true).length])),
  methodology:"STATIC_COUNTRY_ROUTING_PLUS_SEPARATE_READONLY_LIVE_PROOFS",
  source_catalogue_is_not_evidence:true,unprobed_is_not_no_current_evidence:true,
  b2_requests:0,supabase_requests:0,x402_payment_authorized:false,
  cells,
 };
}
