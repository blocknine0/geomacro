import { createHash } from "node:crypto";
import { originalPublisherMatchesCountry } from "./on-demand-original-subject-matching";
import { canonicalRiskObjectJson } from "./risk-object-signing.server";
import {
  type OnDemandCategory, type OnDemandSearchInput,
  type PrivateOriginalCandidate, type PrivatePageDateResult,
  type PrivateOfficialMacroChange, type OnDemandDiscovery,
  matchesRequestedTopic,
} from "./on-demand-global-discovery.server";
import { buildPrivateOnDemandMacroDrivers } from "./on-demand-private-macro-drivers.server";
import type { PrivateOnDemandMacroRightsProof } from "./on-demand-private-macro-rights.server";
import { issuerRightsDisposition } from "../../scripts/lib/official-original-issuer-rights.mjs";

/**
 * Phase 2, Step 3: the ONLY bridge from genuine private original retrieval
 * to a deterministic, private evidence envelope. Not a scoring, signing or
 * commercial-admission mechanism. Never return this object to a customer.
 * The existing reviewer-signed same-event qualifier remains authoritative.
 */
export type PrivateEvidenceDisposition =
  "EVIDENCE_IDENTIFIED_REVIEW_PENDING" | "STRUCTURAL_ONLY" |
  "NO_CURRENT_EVIDENCE" | "INSUFFICIENT_EVIDENCE";

export type QualifiedPrivateEvidence = Readonly<{
  schema: "geomacro.on-demand-private-evidence-qualification.v1";
  country_iso3: string;
  query_fingerprint_sha256: string;
  evidence_fingerprint_sha256: string;
  disposition: PrivateEvidenceDisposition;
  originals: ReadonlyArray<Readonly<{
    category: OnDemandCategory;
    source_family: string;
    publisher_claim: string;
    article_identity_sha256: string;
    scoped_original_item_sha256: string;
    fact_fingerprint_sha256: string;
    original_published_at: string;
    original_clock_basis: "VERIFIED_ORIGINAL_PAGE" | "VERIFIED_NATIVE_FEED";
    subject_country_iso3: string;
    requested_topics: readonly string[];
    commodity: string | null;
    evidence_kind: "HISTORICAL_PUBLISHER_ANNOUNCEMENT" | "CURRENT_PUBLISHER_ANNOUNCEMENT";
    factual_claim_independently_verified: false;
    independent_same_event_verified: false;
    conflicting_facts_disposition: "NOT_VERIFIED";
    rights_status: string;
    article_commercial_rights_verified: false;
    attributable_publisher_identity: string;
    original_url_private: string;
  }>>;
  structural: ReturnType<typeof buildPrivateOnDemandMacroDrivers>;
  rights: Readonly<{
    annual_macro: PrivateOnDemandMacroRightsProof["status"] | "NOT_CHECKED";
    original_article_rights_verified: false;
    article_attribution_verified: false;
  }>;
  confidence: "UNASSESSED_PENDING_FACT_CHECK";
  uncertainty: readonly string[];
  qualified_for_same_event_signing: false;
  commercial_delivery_eligible: false;
  raw_data_delivered: false;
}>;

const SHA = /^[a-f0-9]{64}$/u;
const HOST_BY_FAMILY: Readonly<Record<string,string>> = Object.freeze({
  uk_fcdo_original_publisher:"www.gov.uk",
  uk_fcdo_search_original_page:"www.gov.uk",
  uk_ofsi_original_publisher:"www.gov.uk",
  uk_hmt_original_publisher:"www.gov.uk",
  uk_hmt_search_original_page:"www.gov.uk",
  uk_dbt_original_publisher:"www.gov.uk",
  uk_dbt_search_original_page:"www.gov.uk",
  uk_desnz_original_publisher:"www.gov.uk",
  un_news_original_publisher:"news.un.org",
  us_federal_reserve_original_publisher:"www.federalreserve.gov",
  ecb_original_publisher:"www.ecb.europa.eu",
  australian_industry_original_publisher:"www.minister.industry.gov.au",
  canada_nrcan_original_publisher:"www.canada.ca",
});
const REVIEW_RIGHTS_ID: Readonly<Record<string,string>> = Object.freeze({
  uk_fcdo_original_publisher:"uk_fcdo_original_foreign_policy_atom_review",
  uk_fcdo_search_original_page:"uk_fcdo_original_foreign_policy_atom_review",
  un_news_original_publisher:"un_news_security_original_rss_review",
  us_federal_reserve_original_publisher:"fed_monetary_original_press_rss_review",
  uk_dbt_original_publisher:"uk_dbt_critical_minerals_atom_pending_review",
  uk_dbt_search_original_page:"uk_dbt_critical_minerals_atom_pending_review",
  australian_industry_original_publisher:"australia_industry_minister_original_rss_review",
  canada_nrcan_original_publisher:"nrcan_government_news_original_atom_review",
});
const MINERALS = /^(lithium|cobalt|nickel|graphite|copper|rare earth)$/u;
const encode = (value: unknown) => canonicalRiskObjectJson(value);
const sha = (value: string) => createHash("sha256").update(value,"utf8").digest("hex");
function safeOriginal(candidate: PrivateOriginalCandidate, nowMs: number,
  maxAgeMs: number, search: OnDemandSearchInput, verifiedName:string|null): boolean {
  if (!candidate || !search.categories.includes(candidate.domain) ||
      candidate.first_party_article_url_verified !== true ||
      candidate.independent_same_event_verified !== false ||
      candidate.derived_commercial_rights_verified !== false ||
      candidate.paid_delivery_allowed !== false ||
      candidate.signed_gro_verified !== false ||
      typeof candidate.article_title !== "string" ||
      candidate.article_title.trim().length < 8 ||
      candidate.article_title.length > 300 ||
      !SHA.test(candidate.article_identity_sha256)) return false;
  let uri: URL;
  try { uri = new URL(candidate.article_url); } catch { return false; }
  if (uri.protocol !== "https:" || uri.hostname !== HOST_BY_FAMILY[candidate.publisher_family] ||
      uri.username || uri.password || uri.port || uri.hash || uri.search ||
      candidate.article_identity_sha256 !== sha(candidate.publisher_family+"|"+candidate.article_url))
    return false;
  const summary=candidate.item_scoped_summary_private??"";
  if(typeof summary!=="string" || summary.length>600 ||
     /[\u0000-\u001f\u007f]/u.test(summary)) return false;
  // Exactly the same first-party item summary that the live discovery
  // engine originally scoped. A search index or feed excerpt NEVER proves
  // the described factual claim: it is only first-party query relevance.
  if(!verifiedName || !originalPublisherMatchesCountry(
    candidate.article_title,summary,search.country_iso3,verifiedName,
    candidate.publisher_family,
  ))return false;
  const contextualText=(candidate.article_title+" "+summary).slice(0,850);
  const topics = search.topics ?? [];
  if (!matchesRequestedTopic(contextualText,candidate.domain,topics))
    return false;
  if (candidate.domain === "rare_earth" && search.mineral) {
    if (!MINERALS.test(search.mineral)) return false;
    const term = search.mineral === "rare earth" ? /\brare[- ]earths?\b/iu :
      new RegExp("\\b"+search.mineral+"\\b","iu");
    if (!term.test(contextualText)) return false;
  }
  const native = candidate.feed_item_published_at;
  if (native !== null && (typeof native !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(native) ||
      !Number.isFinite(Date.parse(native)) ||
      Date.parse(native)>nowMs || nowMs-Date.parse(native)>maxAgeMs))
    return false;
  return true;
}
function classify(originalAt: string, nowMs: number): "HISTORICAL_PUBLISHER_ANNOUNCEMENT" | "CURRENT_PUBLISHER_ANNOUNCEMENT" {
  return nowMs-Date.parse(originalAt)<=24*60*60*1000
    ? "CURRENT_PUBLISHER_ANNOUNCEMENT":"HISTORICAL_PUBLISHER_ANNOUNCEMENT";
}
/**
 * Inputs must remain in the trusted server path: discovery + original-page
 * verifier outputs. Exact producer identity hashes are recomputed; a page
 * result must match a source-retrieved record byte-for-byte on identity/title.
 * Source independence is deliberately NOT inferred from two different URLs.
 */
export function qualifyRetrievedOnDemandEvidence(input: Readonly<{
  search: OnDemandSearchInput;
  discovery: OnDemandDiscovery;
  originals: readonly PrivateOriginalCandidate[];
  verifiedCountryName: string | null;
  pageProof: PrivatePageDateResult;
  macroChanges: readonly PrivateOfficialMacroChange[];
  macroRights?: PrivateOnDemandMacroRightsProof;
  now?: Date;
}>): QualifiedPrivateEvidence {
  const {search,discovery}=input;
  const now=input.now??new Date(),nowMs=now.getTime();
  const ageSeconds=search.max_age_seconds??86400;
  if (!Number.isFinite(nowMs) || !Number.isInteger(ageSeconds) ||
      ageSeconds<1 || ageSeconds>31*86400 ||
      !/^[A-Z]{3}$/u.test(search.country_iso3) ||
      discovery.country_iso3!==search.country_iso3 ||
      !SHA.test(discovery.query_fingerprint_sha256) ||
      !Array.isArray(input.originals) || input.originals.length>16 ||
      !Array.isArray(input.pageProof?.verified_candidates) ||
      input.pageProof.verified_candidates.length>4 ||
      !Array.isArray(input.macroChanges) || input.macroChanges.length>2)
    throw Error("ON_DEMAND_QUALIFICATION_INPUT_INVALID");
  const maxAgeMs=ageSeconds*1000;
  const pageByIdentity=new Map<string,typeof input.pageProof.verified_candidates[number]>();
  for(const page of input.pageProof.verified_candidates){
    const source=input.originals.find(o=>o.article_identity_sha256===page.article_identity_sha256);
    if (!source ||
        source.article_url!==page.article_url ||
        source.article_title!==page.article_title ||
        source.item_scoped_summary_private!==page.item_scoped_summary_private ||
        source.publisher_family!==page.publisher_family ||
        source.domain!==page.domain ||
        page.publisher_article_page_date_verified!==true ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(page.page_original_published_at) ||
        Date.parse(page.page_original_published_at)>nowMs ||
        nowMs-Date.parse(page.page_original_published_at)>maxAgeMs ||
        (source.feed_item_published_at !== null &&
         Math.abs(Date.parse(source.feed_item_published_at) -
                  Date.parse(page.page_original_published_at))>600_000))
      throw Error("ON_DEMAND_PAGE_PROOF_NOT_BOUND_TO_SOURCE");
    // The trusted original-page verifier may validate an article whose
    // publisher feed summary supplied the query scope but whose title alone
    // cannot establish country/topic/commodity. Keep the page private and
    // reject admission without dropping the rest of the genuine records.
    // In contrast, contradictory or forged page/source identity is fatal.
    if (!safeOriginal(source,nowMs,maxAgeMs,search,input.verifiedCountryName))
      continue;
    pageByIdentity.set(page.article_identity_sha256,page);
  }
  const dedup=new Map<string,QualifiedPrivateEvidence["originals"][number]>();
  for(const source of input.originals){
    if (!safeOriginal(source,nowMs,maxAgeMs,search,input.verifiedCountryName)) continue;
    const page=pageByIdentity.get(source.article_identity_sha256);
    const originalAt=page?.page_original_published_at ??
      (source.source_native_feed_publication_date_verified===true
        ? source.feed_item_published_at:null);
    if (!originalAt || !Number.isFinite(Date.parse(originalAt)) ||
        Date.parse(originalAt)>nowMs || nowMs-Date.parse(originalAt)>maxAgeMs)
      continue;
    const fingerprint=sha(encode([
      source.publisher_family,source.article_identity_sha256,source.article_title,
      sha(encode(source.item_scoped_summary_private??"")),
      originalAt,source.domain,search.country_iso3,search.mineral??null,
    ]));
    const rights=issuerRightsDisposition({sourceId:REVIEW_RIGHTS_ID[source.publisher_family]});
    const record:QualifiedPrivateEvidence["originals"][number]={
      category:source.domain,source_family:source.publisher_family,
      publisher_claim:source.article_title,
      article_identity_sha256:source.article_identity_sha256,
      scoped_original_item_sha256:sha(encode([
        source.article_title,source.item_scoped_summary_private??"",
      ])),
      fact_fingerprint_sha256:fingerprint,
      original_published_at:originalAt,
      original_clock_basis:page?"VERIFIED_ORIGINAL_PAGE":"VERIFIED_NATIVE_FEED",
      subject_country_iso3:search.country_iso3,
      requested_topics:(search.topics??[]).filter(x=>x!=="hot_topics").sort(),
      commodity:source.domain==="rare_earth"?(search.mineral??null):null,
      evidence_kind:classify(originalAt,nowMs),
      factual_claim_independently_verified:false,
      independent_same_event_verified:false,
      conflicting_facts_disposition:"NOT_VERIFIED",
      rights_status:rights.status,
      article_commercial_rights_verified:false,
      attributable_publisher_identity:source.publisher_family,
      original_url_private:source.article_url,
    };
    // Per-source repeated announcements are a single underlying publisher claim.
    const key=sha(encode([
      source.publisher_family,source.domain,
      source.article_title.normalize("NFKC").toLowerCase().replace(/\s+/gu," ").trim(),
      originalAt.slice(0,10),
    ]));
    const existing=dedup.get(key);
    if (!existing || (record.original_clock_basis==="VERIFIED_ORIGINAL_PAGE" &&
        existing.original_clock_basis!=="VERIFIED_ORIGINAL_PAGE") ||
        (record.original_clock_basis===existing.original_clock_basis &&
         record.article_identity_sha256<existing.article_identity_sha256))
      dedup.set(key,record);
  }
  const originals=[...dedup.values()].sort((a,b)=>
    a.category.localeCompare(b.category) ||
    a.source_family.localeCompare(b.source_family) ||
    a.fact_fingerprint_sha256.localeCompare(b.fact_fingerprint_sha256));
  const structural=buildPrivateOnDemandMacroDrivers(input.macroChanges,{now});
  if(input.macroChanges.length>0 && structural.length!==input.macroChanges.length)
    throw Error("ON_DEMAND_STRUCTURAL_QUALIFICATION_INVALID");
  if(structural.some(row=>row.country_iso3!==search.country_iso3 ||
      !search.categories.includes("macro")))
    throw Error("ON_DEMAND_STRUCTURAL_COUNTRY_SCOPE_MISMATCH");
  const disposition:PrivateEvidenceDisposition=originals.length>0
    ?"EVIDENCE_IDENTIFIED_REVIEW_PENDING":structural.length>0
      ?"STRUCTURAL_ONLY":ageSeconds<=86400
        ?"NO_CURRENT_EVIDENCE":"INSUFFICIENT_EVIDENCE";
  const uncertainty=[
    ...(originals.length>0?["PUBLISHER_CLAIMS_NOT_INDEPENDENTLY_FACT_CHECKED",
      "CONFLICTING_EVIDENCE_NOT_RECONCILED","ITEM_SPECIFIC_COMMERCIAL_RIGHTS_NOT_VERIFIED"]:[]),
    ...(structural.length>0?["ANNUAL_OBSERVATION_NOT_A_RELEASE_TIMESTAMP_OR_LIVE_EVENT"]:[]),
    "NO_INDEPENDENT_SIGNED_SAME_EVENT_REVIEW",
  ];
  const fingerprint=sha(encode({
    country_iso3:search.country_iso3,
    query_fingerprint_sha256:discovery.query_fingerprint_sha256,
    originals:originals.map(x=>[x.fact_fingerprint_sha256,x.original_clock_basis]),
    structural:structural.map(x=>[x.source_observation_sha256,x.driver]),
  }));
  return {
    schema:"geomacro.on-demand-private-evidence-qualification.v1",
    country_iso3:search.country_iso3,
    query_fingerprint_sha256:discovery.query_fingerprint_sha256,
    evidence_fingerprint_sha256:fingerprint,
    disposition,originals,structural,
    rights:{
      annual_macro:input.macroRights?.status??"NOT_CHECKED",
      original_article_rights_verified:false,article_attribution_verified:false,
    },
    confidence:"UNASSESSED_PENDING_FACT_CHECK",uncertainty,
    qualified_for_same_event_signing:false,
    commercial_delivery_eligible:false,raw_data_delivered:false,
  };
}
/** Deliberately minimal public boundary. Never serialize private claims, names,
 * URLs, exact article dates or evidence fingerprints into a free/API response. */
export function publicOnDemandQualificationStatus(
  qualification:QualifiedPrivateEvidence,
) {
  return {
    status:qualification.disposition,
    original_record_count:qualification.originals.length,
    original_page_verified_count:qualification.originals.filter(x=>
      x.original_clock_basis==="VERIFIED_ORIGINAL_PAGE").length,
    structural_annual_record_count:qualification.structural.length,
    independent_same_event_verified:false,
    commercial_rights_verified:false,
    signing_eligible:false,payment_eligible:false,
  } as const;
}

/**
 * Private, source-bound structured Geomacro answer CANDIDATE.
 *
 * The first-party page validator attests only the narrow original event:
 * the Board published its earlier discount-window meeting minutes. No
 * claim about a newly changed 13 Oct rate, FX reaction or risk score.
 *
 * This remains request-local until a genuinely governed reviewer rights
 * decision, customer attribution, registered signer and immutable delivery
 * are independently accepted. It must NEVER be sent to public x402, D1 or
 * ledger in this provisional state.
 */
export function buildPrivateVerifiedFedMinutesFinding(
 qualification:QualifiedPrivateEvidence,pageProof:PrivatePageDateResult,
 options:{observedAt?:Date;queryPlanHash?:string}={},
):Readonly<{
 schema:"geomacro.private-source-bound-intelligence-candidate.v1";
 country_iso3:"USA";category:"macro";finding:string;
 verified_event:string;original_publication_utc:string;
 evidence_fingerprint_sha256:string;
 query_binding:Readonly<{
  discovery_query_fingerprint_sha256:string;
  received_query_plan_hash:string|null;
  exact_customer_question_verified:false;
 }>;
 source_freshness:Readonly<{
  checked_at_utc:string;
  original_age_seconds:number;
  current_24h_window_expires_utc:string;
  classification:"CURRENT_24H_ORIGINAL"|"HISTORICAL_ORIGINAL";
 }>;
 reviewer:Readonly<{
  independent_same_event_verified:false;original_item_relevance_verified:true;
  commercial_item_admission_verified:false;
  acceptance_status:"BLOCKED_ITEM_RIGHTS_AND_INDEPENDENT_REVIEW";
 }>;
 cause_context:string;supported_implications:readonly string[];
 uncertainty:readonly string[];
 provenance:Readonly<{article_identity_sha256:string;
  issuer:"Board of Governors of the Federal Reserve System";
  source_url_private:string;original_page_verified:true}>;
 rights:Readonly<{source_use_basis:string;attribution:string;
  attribution_required:true; third_party_material_excluded_from_answer:true;
  item_specific_commercial_admission_verified:false}>;
 source_supported:true;new_rate_decision_verified:false;
 external_fx_market_impact_verified:false;
 registered_signing_eligible:false;signed:false;
 immutable_customer_bytes_prepared:false;x402_payment_authorized:false;
}>|null {
 if(options.queryPlanHash!==undefined && !SHA.test(options.queryPlanHash))return null;
 const observedAt=options.observedAt??new Date();
 if(!Number.isFinite(observedAt.getTime()))return null;
 if(qualification.schema!=="geomacro.on-demand-private-evidence-qualification.v1" ||
    qualification.country_iso3!=="USA" || qualification.commercial_delivery_eligible!==false ||
    qualification.qualified_for_same_event_signing!==false ||
    !Array.isArray(pageProof.verified_candidates))return null;
 for(const page of pageProof.verified_candidates){
  if(page.verified_original_event_kind!==
     "FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED" ||
     page.publisher_family!=="us_federal_reserve_original_publisher" ||
     page.publisher_article_page_date_verified!==true ||
     !(page.source_native_feed_publication_date_verified===true &&
       page.feed_item_published_at!==null ||
       page.source_native_feed_publication_date_verified===false &&
       page.feed_item_published_at===null &&
       page.official_archive_release_day===page.page_original_published_at.slice(0,10)) ||
     page.independent_same_event_verified!==false ||
     page.paid_delivery_allowed!==false)continue;
  const record=qualification.originals.find(e=>
     e.source_family===page.publisher_family &&
     e.category==="macro" && e.subject_country_iso3==="USA" &&
     e.article_identity_sha256===page.article_identity_sha256 &&
     e.original_url_private===page.article_url &&
     e.publisher_claim===page.article_title &&
     e.original_clock_basis==="VERIFIED_ORIGINAL_PAGE" &&
     e.original_published_at===page.page_original_published_at &&
     e.factual_claim_independently_verified===false &&
     e.article_commercial_rights_verified===false &&
     e.rights_status==="HOLD_ITEM_LEVEL_EXCEPTIONS");
  if(!record || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
      .test(record.original_published_at))continue;
  const publishedAt=Date.parse(record.original_published_at);
  const ageSeconds=Math.floor((observedAt.getTime()-publishedAt)/1000);
  if(!Number.isSafeInteger(ageSeconds)||ageSeconds<0||ageSeconds>31*86400||
     !SHA.test(qualification.query_fingerprint_sha256)||
     !SHA.test(qualification.evidence_fingerprint_sha256))continue;
  const currentNewsExpiry=new Date(publishedAt+86400_000).toISOString();
  // Board page text is Board-authored; never include the linked PDF,
  // charts, logo, seal or third-party material. Attribution is explicit
  // but its later customer-contract compliance needs separate approval.
  return Object.freeze({
    schema:"geomacro.private-source-bound-intelligence-candidate.v1" as const,
    country_iso3:"USA" as const,category:"macro" as const,
    finding:"The Federal Reserve Board published minutes of earlier discount-window rate-setting meetings.",
    verified_event:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED",
    original_publication_utc:record.original_published_at,
    evidence_fingerprint_sha256:qualification.evidence_fingerprint_sha256,
    query_binding:{
      discovery_query_fingerprint_sha256:qualification.query_fingerprint_sha256,
      received_query_plan_hash:options.queryPlanHash??null,
      exact_customer_question_verified:false as const,
    },
    source_freshness:{
      checked_at_utc:observedAt.toISOString(),
      original_age_seconds:ageSeconds,
      current_24h_window_expires_utc:currentNewsExpiry,
      classification:ageSeconds<=86400?"CURRENT_24H_ORIGINAL" as const:
        "HISTORICAL_ORIGINAL" as const,
    },
    reviewer:{
      independent_same_event_verified:false as const,
      original_item_relevance_verified:true as const,
      commercial_item_admission_verified:false as const,
      acceptance_status:"BLOCKED_ITEM_RIGHTS_AND_INDEPENDENT_REVIEW" as const,
    },
    cause_context:"The Board publicly released its recorded discussions of discount rates for depository-institution discount-window lending; publication is distinct from a fresh monetary-policy decision.",
    supported_implications:[
      "Provides historical discount-window policy and central-bank liquidity context.",
      "Does not by itself establish a new October 13 rate change, a currency-price movement or a revised country-risk score.",
    ],
    uncertainty:[
      "Market reaction and downstream FX implications have not been independently measured.",
      "Independent same-event fact review and any conflicting economic evidence remain outstanding.",
      "Item-specific commercial rights/attribution certification and the customer delivery contract remain pending.",
    ],
    provenance:{
      article_identity_sha256:record.article_identity_sha256,
      issuer:"Board of Governors of the Federal Reserve System" as const,
      source_url_private:record.original_url_private,
      original_page_verified:true as const,
    },
    rights:{
      source_use_basis:"FEDERAL_RESERVE_BOARD_AUTHORED_RELEASE_PUBLIC_DOMAIN_UNLESS_NOTED",
      attribution:"Board of Governors of the Federal Reserve System",
      attribution_required:true as const,
      third_party_material_excluded_from_answer:true as const,
      item_specific_commercial_admission_verified:false as const,
    },
    source_supported:true as const,new_rate_decision_verified:false as const,
    external_fx_market_impact_verified:false as const,
    registered_signing_eligible:false as const,signed:false as const,
    immutable_customer_bytes_prepared:false as const,
    x402_payment_authorized:false as const,
  });
 }
 return null;
}
