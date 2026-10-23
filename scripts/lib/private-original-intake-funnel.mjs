/**
 * Sanitized source-to-original funnel for one canonical ISO3 and three domains.
 * The 195-country router reuses this exact diagnostic per country, not 195
 * provider credentials, synthetic articles, or separate paid engines.
 *
 * Aggregates only: NEVER emit publisher identities, URLs, headlines, raw
 * HTML, byte hashes, rights grants, signatures, or auth configuration.
 */
const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
const RETRIEVAL_STATES=Object.freeze([
  "RECORDS_OBSERVED","NO_MATCHING_RECORDS","RATE_LIMITED",
  "ACCESS_RESTRICTED","TRANSPORT_UNAVAILABLE","COOLDOWN_ACTIVE",
  "PROVIDER_INVALID","UNSPECIFIED",
]);
const FEED_STAGES=Object.freeze([
  "inspected","native_dated","country_mentioned","scope_matched",
  "eligible_pub_date","allowed_article_paths",
]);
const zeroCategories=()=>Object.fromEntries(CATEGORIES.map(c=>[c,0]));
const counter=names=>Object.fromEntries(names.map(k=>[k,0]));
const numeric=(x)=>Number.isSafeInteger(x)&&x>=0;

export function summarizePrivateOriginalIntakeFunnel({discovery,pages,receipt}={}){
  if(!discovery || !pages || !receipt ||
      !Array.isArray(discovery.private_original_review_candidates) ||
      !Array.isArray(discovery.discovery?.source_probes) ||
      !Array.isArray(pages.verified_candidates) ||
      !numeric(discovery.discovery.network_attempts) ||
      !numeric(pages.attempted) ||
      !numeric(receipt.byte_exact_rereads_attempted) ||
      !numeric(receipt.distinct_source_verified_pre_review_leads) ||
      !CATEGORIES.every(c=>numeric(receipt.verified_original_counts_by_category?.[c])))
    throw Error("ORIGINAL_INTAKE_FUNNEL_INVALID");
  const candidateCounts=zeroCategories(),pageCounts=zeroCategories();
  const probeCounts=counter(RETRIEVAL_STATES),feedStages=counter(FEED_STAGES);
  const observedByDomain=zeroCategories();
  for(const probe of discovery.discovery.source_probes){
    const state=RETRIEVAL_STATES.includes(probe?.retrieval_state)
      ?probe.retrieval_state:"UNSPECIFIED";
    probeCounts[state]++;
    if(CATEGORIES.includes(probe?.category) && numeric(probe.observed_record_count))
      observedByDomain[probe.category]+=probe.observed_record_count;
    for(const key of FEED_STAGES){
      const n=probe?.feed_audit?.[key];
      if(numeric(n))feedStages[key]+=n;
    }
  }
  for(const candidate of discovery.private_original_review_candidates){
    if(CATEGORIES.includes(candidate?.domain))candidateCounts[candidate.domain]++;
  }
  for(const page of pages.verified_candidates){
    if(CATEGORIES.includes(page?.domain))pageCounts[page.domain]++;
  }
  const candidates=Object.values(candidateCounts).reduce((a,b)=>a+b,0);
  const pagesVerified=Object.values(pageCounts).reduce((a,b)=>a+b,0);
  if(receipt.distinct_source_verified_pre_review_leads >
      receipt.byte_exact_rereads_attempted ||
     receipt.byte_exact_rereads_attempted>pages.attempted ||
     pagesVerified>pages.attempted)
    throw Error("ORIGINAL_INTAKE_FUNNEL_STAGE_MISMATCH");

  const degradedProbeCount=probeCounts.RATE_LIMITED+
    probeCounts.ACCESS_RESTRICTED+probeCounts.TRANSPORT_UNAVAILABLE+
    probeCounts.COOLDOWN_ACTIVE+probeCounts.PROVIDER_INVALID;
  const inspectedPublisherRecords=probeCounts.RECORDS_OBSERVED>0 ||
    feedStages.inspected>0;
  const nextGate=receipt.distinct_source_verified_pre_review_leads>0
    ?"PRIVATE_FACTS_AND_RIGHTS_REVIEW_PENDING":
    candidates===0
      ? inspectedPublisherRecords && degradedProbeCount>0
        ?"COUNTRY_TOPIC_AND_PROVIDER_TRANSPORT_DEGRADED"
        : inspectedPublisherRecords
          ?"COUNTRY_TOPIC_OR_ORIGINAL_PUBLISHER_MATCH_NOT_CONFIRMED"
          : degradedProbeCount>0
            ?"SOURCE_TRANSPORT_ACCESS_OR_QUOTA_DEGRADED"
            :"NO_CURRENT_FIRST_PARTY_CANDIDATE_DISCOVERED"
      : pages.attempted===0
        ?"DISCOVERED_CANDIDATES_NOT_SUBMITTED_TO_PAGE_READBACK"
        : pagesVerified===0
          ?"ORIGINAL_PAGE_OR_NATIVE_DATE_UNVERIFIED"
          : receipt.byte_exact_rereads_attempted===0
            ?"PAGE_VERIFIED_CANDIDATES_NOT_ACCEPTED_FOR_EXACT_BYTES"
            :"EXACT_ORIGINAL_BYTES_OR_CLOCK_NOT_VERIFIED";
  return Object.freeze({
    schema:"geomacro.private-original-discovery-funnel.v1",
    scope:"ONE_COUNTRY_FROM_CANONICAL_195_THREE_DOMAIN_ROUTER",
    country_iso3:receipt.country_iso3,
    original_source_network_attempts:discovery.discovery.network_attempts,
    source_probe_retrieval_states:probeCounts,
    degraded_source_probe_count:degradedProbeCount,
    country_topic_match_unconfirmed:candidates===0&&inspectedPublisherRecords,
    source_probe_record_observations_by_category:observedByDomain,
    feed_stage_counter_sums_not_unique_events:feedStages,
    original_candidates_by_category:candidateCounts,
    original_page_readback_attempts:pages.attempted,
    page_date_verified_candidates_by_category:pageCounts,
    exact_original_byte_readback_attempts:receipt.byte_exact_rereads_attempted,
    byte_verified_pre_review_leads:receipt.distinct_source_verified_pre_review_leads,
    next_required_gate:nextGate,
    one_country_is_not_195_country_coverage:true,
    country_subject_independently_verified:false,
    rights_signed_or_granted:false,paid_delivery_eligible:false,
    gri_scored:false,hot_products_published:false,
    payment_authorized:false,raw_source_material_in_receipt:false,
  });
}
