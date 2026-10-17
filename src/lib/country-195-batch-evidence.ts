import type {CoverageDomain195,CoverageObservation195}
  from "./canonical-195-country-coverage-matrix";
import type {PrivateOriginalCandidate,SourceProbe,PrivatePageDatedOriginal}
  from "./on-demand-global-discovery.server";

/**
 * Scope-wide, read-only source diagnostics for one country-category.
 * Official publisher reachability is NEVER synonymous with a relevant
 * first-party original. Neither is equivalent to commercial eligibility.
 */
export const COUNTRY_BATCH_REVIEWED_TOPICS=Object.freeze([
  "sanctions_restrictions","conflict_geopolitics","political_governance",
  "macro_risk","sovereign_risk","fx_external_risk","critical_minerals",
] as const);
const nonOriginal=(family:string)=>family==="gdelt_doc_discovery"||
  family==="reliefweb_discovery"||family.startsWith("world_bank_official_");

export type CountryBatchCellEvidence={
  observation:CoverageObservation195;
  verdict:"PARTIAL_SOURCE_COVERAGE"|
    "NO_QUALIFYING_CURRENT_EVIDENCE"|"SOURCE_BLOCKED"|"UNTESTED";
  registered_source_adapters:number;
  live_original_publisher_families:number;
  country_relevant_originals:number;
  verified_original_pages:number;
  latest_verified_original_publication_utc:string|null;
  fallback_original_publisher_families:number;
  restricted_original_publishers:number;
  rate_limited_original_publishers:number;
  // Annual World Bank data remains structural, never current original news.
  commercial_rights_qualified:false;
  signed_delivery_verified:false;
};

export function summarizeCountryBatchCell(
  country:string,category:CoverageDomain195,
  probes:readonly SourceProbe[],
  candidates:readonly PrivateOriginalCandidate[],
  originals:readonly PrivatePageDatedOriginal[],
  now:Date=new Date(),
):CountryBatchCellEvidence{
  const nowMs=now.getTime();
  if(!Number.isFinite(nowMs))throw Error("COUNTRY_195_PROOF_CLOCK_INVALID");
  const relevant=probes.filter(p=>p.category===category&&!nonOriginal(p.family));
  const reachable=new Set(relevant.filter(p=>p.reachable===true).map(p=>p.family));
  const restricted=relevant.filter(p=>p.retrieval_state==="ACCESS_RESTRICTED").length;
  const throttled=relevant.filter(p=>p.retrieval_state==="RATE_LIMITED").length;
  const matched=candidates.filter(x=>x.domain===category && x.country_iso3===country);
  // Re-check a native original publication clock at the final coverage
  // boundary. A previously page-verified but replayed/stale/future original
  // must not be promoted just because its source remains transport-reachable.
  const pages=originals.filter(x=>{
    const published=Date.parse(x.page_original_published_at);
    return x.domain===category && x.country_iso3===country &&
      x.publisher_article_page_date_verified===true &&
      Number.isFinite(published) &&
      published<=nowMs && nowMs-published<=86_400_000 &&
      matched.some(y=>y.article_identity_sha256===x.article_identity_sha256 &&
        y.publisher_family===x.publisher_family &&
        y.article_url===x.article_url &&
        y.article_title===x.article_title &&
        // A stale native feed clock never becomes current through a newer
        // page time. Undated originals must be page-proved upstream.
        (y.source_native_feed_publication_date_verified!==true ||
         (typeof y.feed_item_published_at==="string" &&
          Number.isFinite(Date.parse(y.feed_item_published_at)) &&
          Date.parse(y.feed_item_published_at)<=nowMs &&
          nowMs-Date.parse(y.feed_item_published_at)<=86_400_000 &&
          Math.abs(Date.parse(y.feed_item_published_at)-published)<=600_000)));
  });
  const sourceFamilies=new Set(matched.map(x=>x.publisher_family));
  const verifiedFamilies=new Set(pages.map(x=>x.publisher_family));
  // At least two different publisher families + actual distinct ORIGINAL
  // URLs and identities are required even for a page-only fallback.
  // This still DOES NOT check semantic same-event equivalence, source rights,
  // counterevidence, two signed authorities, GRO or customer readback.
  const distinctPages=new Set(pages.map(x=>x.article_identity_sha256)).size;
  const distinctUrls=new Set(pages.map(x=>x.article_url)).size;
  const pageVerified=pages.length>0;
  const twoOriginalPageLeads=verifiedFamilies.size>=2 &&
    distinctPages>=2 && distinctUrls>=2;
  const live=reachable.size>0 || pageVerified;
  const countryRelevant=sourceFamilies.size>0;
  const blocked=pageVerified
    ? twoOriginalPageLeads?"SAME_EVENT_AND_RIGHTS_REVIEW_PENDING":
      "SECOND_INDEPENDENT_ORIGINAL_MISSING"
    :restricted>0?"PROVIDER_DENIED_401_403":
    throttled>0?"PROVIDER_RATE_LIMIT_429":
    !relevant.length||!live?"PROVIDER_UNAVAILABLE":
    countryRelevant?"ORIGINAL_PUBLICATION_UNVERIFIED":
    "NO_COUNTRY_RELEVANT_ORIGINAL";
  // A source page-date check can never truthfully return a qualified current
  // event. That requires the separate actual same-event/rights/signing gates.
  const verdict=pageVerified?"PARTIAL_SOURCE_COVERAGE":
    !live&&relevant.some(p=>p.attempted)?"SOURCE_BLOCKED":
    !live?"UNTESTED":
    countryRelevant?"PARTIAL_SOURCE_COVERAGE":
    restricted+throttled>0?"SOURCE_BLOCKED":
    "NO_QUALIFYING_CURRENT_EVIDENCE";
  return {
    observation:{
      iso3:country,category,
      source_adapter_registered:relevant.length>0,
      live_source_reachable:live,
      country_relevance_verified:countryRelevant,
      original_evidence_verified:pageVerified,
      // Explicitly unknown: a current, SAME event is not established merely
      // because publisher page dates are verified (even for two origins).
      independent_fallback_verified:twoOriginalPageLeads,
      blocked_reason:blocked,
    },
    verdict,
    registered_source_adapters:new Set(relevant.map(p=>p.family)).size,
    live_original_publisher_families:reachable.size,
    country_relevant_originals:matched.length,
    verified_original_pages:pages.length,
    latest_verified_original_publication_utc:pages.length?
      pages.map(x=>x.page_original_published_at).sort().at(-1)??null:null,
    fallback_original_publisher_families:verifiedFamilies.size,
    restricted_original_publishers:restricted,
    rate_limited_original_publishers:throttled,
    commercial_rights_qualified:false,signed_delivery_verified:false,
  };
}
