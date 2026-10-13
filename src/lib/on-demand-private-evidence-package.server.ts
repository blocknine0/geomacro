import { createHash } from "node:crypto";
import { canonicalRiskObjectJson } from "./risk-object-signing.server";
import type {
  OnDemandCategory, OnDemandMineral, PrivateOriginalCandidate,
  PrivatePageDatedOriginal, PrivateOfficialMacroChange,
} from "./on-demand-global-discovery.server";
import { readB2CommercialSourceRights, type B2CommercialSourceRight } from "./b2-live.server";
import { commercialSourceEligibilityFromRow } from "./commercial-source-eligibility.server";
import { ACCEPTED_SOURCE_IDS } from "./on-demand-reviewed-rights-qualifier.server";

/**
 * Existing retrieval -> existing governed review/rights/scoring boundary.
 * PRIVATE per-request only. The presence of a real announcement is neither
 * independent same-event verification nor permission to charge or sign.
 * Never serialize records, publisher identities, URLs, titles or hashes to
 * customers. Only publicOnDemandEvidenceDisposition() may cross the API.
 */
export type PrivateEvidenceDisposition =
  "NO_CURRENT_EVIDENCE" | "INSUFFICIENT_EVIDENCE" |
  "SOURCE_RIGHTS_UNAVAILABLE" | "SOURCE_RIGHTS_NOT_CERTIFIED" |
  "ATTRIBUTION_NOT_SUPPORTED" | "SOURCE_RIGHTS_VERIFIED_REVIEW_PENDING";

type PrivatePublisherClaim = Readonly<{
  classification: "PUBLISHER_ANNOUNCEMENT" | "ANNUAL_STRUCTURAL_REFERENCE";
  category: OnDemandCategory;
  country_iso3: string;
  commodity: OnDemandMineral | null;
  factual_assertion: "PUBLISHER_ISSUED_TITLED_ANNOUNCEMENT" | "ANNUAL_VALUE_CHANGED";
  // A title is the only news fact supported by the existing bounded reader.
  // No claim of impact, quantities, event occurrence or country risk.
  original_title: string | null;
  source_native_published_at: string | null;
  reference_year: number | null;
  publisher_organization_id: string;
  // PRIVATE canonical origin/path; not for customer, logs or audit artifacts.
  original_article_url: string | null;
  article_identity_sha256: string;
  source_registry_id: string | null;
  source_rights_eligible: boolean;
  required_public_attribution: boolean;
  material_facts_independently_verified: false;
  same_event_corroborated: false;
  source_document_fingerprint_sha256: string;
}>;

export type PrivateOnDemandEvidencePackage = Readonly<{
  schema: "geomacro.on-demand-private-evidence-package.v1";
  country_iso3: string;
  categories: readonly OnDemandCategory[];
  subject_topic_ids: readonly string[];
  commodity: OnDemandMineral | null;
  max_age_seconds: number;
  // Deterministic over validated evidence, not request/fetch wall clock.
  exact_evidence_sha256: string;
  disposition: PrivateEvidenceDisposition;
  evidence: readonly PrivatePublisherClaim[];
  distinct_original_articles: number;
  duplicate_announcements_discarded: number;
  annual_structural_observations: number;
  original_publisher_dates_verified: number;
  attribution_obligations_unmet: number;
  conflicting_duplicate_records_rejected: number;
  independent_same_event_verified: false;
  conflicting_claims_reviewed: false;
  risk_severity_score: null;
  confidence: Readonly<{
    original_publication: "VERIFIED" | "NO_VERIFIED_ORIGINAL";
    factual_impact: "NOT_ASSESSED";
    source_independence: "NOT_REVIEWED";
    calibrated_confidence: null;
  }>;
  commercial_derived_rights_verified: boolean;
  signed_gro_verified: false;
  x402_payment_authorized: false;
}>;

const HEX64=/^[a-f0-9]{64}$/u;
const ISOTIME=/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$/iu;
const SUPPORTED_TOPICS=new Set([
 "sanctions_restrictions","conflict_geopolitics","political_governance",
 "macro_risk","sovereign_risk","fx_external_risk","critical_minerals","hot_topics",
]);
const FAMILY_TO_SOURCE:Readonly<Record<string,{organization:string;source_id:string}>>={
  "un_news_original_publisher":{organization:"un_news",source_id:"un_news"},
  "uk_fcdo_original_publisher":{organization:"uk_fcdo",source_id:"uk_fcdo"},
  "uk_fcdo_search_original_page":{organization:"uk_fcdo",source_id:"uk_fcdo"},
  "us_federal_reserve_original_publisher":{organization:"federal_reserve",source_id:"federal_reserve"},
  "ecb_original_publisher":{organization:"ecb",source_id:"ecb"},
  // UK HMT / DBT / DESNZ have no independently pinned reviewed source-id
  // mapping in the existing strict reviewer: keep them for PRIVATE evidence
  // but do not invent a commercial licence or reviewer registration.
};
const MINERAL_PATTERN:Readonly<Record<OnDemandMineral,RegExp>>={
  lithium:/\\blithium\\b/iu,cobalt:/\\bcobalt\\b/iu,
  nickel:/\\bnickel\\b/iu,graphite:/\\bgraphite\\b/iu,
  copper:/\\bcopper\\b/iu,"rare earth":/\\brare[- ]earths?\\b/iu,
};
const sha=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");
const sorted=(a:readonly string[])=>[...new Set(a)].sort();
const issuerFor=(family:string)=>{
  if(family.startsWith("uk_hmt_"))return "uk_hmt";
  if(family.startsWith("uk_dbt_"))return "uk_dbt";
  if(family.startsWith("uk_desnz_"))return "uk_desnz";
  if(family.startsWith("uk_ofsi_"))return "uk_ofsi";
  if(family.startsWith("australian_industry_"))return "australian_industry";
  return FAMILY_TO_SOURCE[family]?.organization??"";
};
const titleText=(x:string)=>x.normalize("NFKC").replace(/\\s+/gu," ").trim();
function originalClock(x:string|null,now:Date,maxAgeSeconds:number):string|null{
  if(!x || !ISOTIME.test(x))return null;
  const date=Date.parse(x);
  if(!Number.isFinite(date)||date>now.getTime() ||
      now.getTime()-date>maxAgeSeconds*1_000)return null;
  return new Date(date).toISOString();
}
function safeOriginalUrl(original:PrivateOriginalCandidate):boolean{
  try{
    const u=new URL(original.article_url);
    const org=issuerFor(original.publisher_family);
    if(!org||u.protocol!=="https:"||u.username||u.password||u.port||
       u.search||u.hash||u.href.length>=2048)return false;
    const expectedHost=org==="un_news"?"news.un.org":
      org==="federal_reserve"?"www.federalreserve.gov":
      org==="ecb"?"www.ecb.europa.eu":
      org==="australian_industry"?"www.minister.industry.gov.au":"www.gov.uk";
    if(u.hostname!==expectedHost)return false;
    return org==="un_news"?/^\\/en\\/story\\/20\\d{2}\\/\\d{1,2}\\//u.test(u.pathname):
      org==="federal_reserve"?/^\\/newsevents\\/pressreleases\\//u.test(u.pathname):
      org==="ecb"?/^\\/press\\//u.test(u.pathname):
      org==="australian_industry"?/^\\/(?:t-ayres|king)\\/media\\//u.test(u.pathname):
      /^\\/government\\/(?:news|speeches|statements|world-location-news|publications)\\//u.test(u.pathname);
  }catch{return false}
}

/** Only authentic outputs from the existing discovery/page-verification path. */
export async function qualifyPrivateOnDemandEvidence(input:Readonly<{
  country_iso3:string;categories:readonly OnDemandCategory[];
  topics:readonly string[]; mineral:OnDemandMineral|null;
  max_age_seconds:number; now:Date;
  feed_candidates:readonly PrivateOriginalCandidate[];
  page_verified_candidates:readonly PrivatePageDatedOriginal[];
  annual_macro_changes:readonly PrivateOfficialMacroChange[];
}>, options:{readRights?:()=>Promise<B2CommercialSourceRight[]|null>}={}):Promise<PrivateOnDemandEvidencePackage>{
  if(!/^[A-Z]{3}$/u.test(input.country_iso3)||
     !Number.isFinite(input.now?.getTime()) ||
     !Number.isInteger(input.max_age_seconds) ||
     input.max_age_seconds<1||input.max_age_seconds>31*86_400 ||
     !Array.isArray(input.categories) || input.categories.length<1 ||
     input.categories.length>3 ||
     input.categories.some(c=>!["geopolitics","macro","rare_earth"].includes(c)) ||
     !Array.isArray(input.topics) || input.topics.some(t=>!SUPPORTED_TOPICS.has(t)) ||
     !Array.isArray(input.feed_candidates)||input.feed_candidates.length>16 ||
     !Array.isArray(input.page_verified_candidates)||input.page_verified_candidates.length>4 ||
     !Array.isArray(input.annual_macro_changes)||input.annual_macro_changes.length>2 ||
     (input.mineral!==null && !Object.hasOwn(MINERAL_PATTERN,input.mineral)))
    throw Error("ON_DEMAND_PRIVATE_EVIDENCE_INPUT_INVALID");

  // First-page timestamp evidence supersedes a native feed date only when the
  // same publisher URL identity and first-party hash agree exactly.
  const byIdentity=new Map<string,PrivatePublisherClaim>();
  let discarded=0;
  let invalidOrConflicting=0;
  const rejectedIdentities=new Set<string>();
  const scoped=sorted(input.categories), topics=sorted(input.topics);
  const pages=new Map(input.page_verified_candidates.map(c=>[
    c.article_identity_sha256,c,
  ]));
  for(const candidate of input.feed_candidates){
    if(!candidate||!scoped.includes(candidate.domain) ||
       candidate.first_party_article_url_verified!==true ||
       candidate.paid_delivery_allowed!==false ||
       !HEX64.test(candidate.article_identity_sha256) ||
       !safeOriginalUrl(candidate) ||
       candidate.article_identity_sha256!==sha(candidate.publisher_family+"|"+candidate.article_url)) {
      invalidOrConflicting++;continue;
    }
    const title=titleText(candidate.article_title);
    if(title.length<10||title.length>300 ||
       (input.mineral && candidate.domain==="rare_earth" &&
        !MINERAL_PATTERN[input.mineral].test(title))) {
      invalidOrConflicting++;continue;
    }
    const page=pages.get(candidate.article_identity_sha256);
    const date=page?.publisher_article_page_date_verified===true
      ? originalClock(page.page_original_published_at,input.now,input.max_age_seconds)
      : candidate.source_native_feed_publication_date_verified===true
        ? originalClock(candidate.feed_item_published_at,input.now,input.max_age_seconds)
        : null;
    if(!date)continue;
    if(page && candidate.feed_item_published_at){
      const f=originalClock(candidate.feed_item_published_at,input.now,input.max_age_seconds);
      if(!f || Math.abs(Date.parse(f)-Date.parse(date))>10*60_000){
        invalidOrConflicting++;continue;
      }
    }
    const organization=issuerFor(candidate.publisher_family);
    const registry=FAMILY_TO_SOURCE[candidate.publisher_family];
    const source_registry_id=registry &&
       ACCEPTED_SOURCE_IDS[registry.organization]?.includes(registry.source_id)
      ? registry.source_id:null;
    const url=new URL(candidate.article_url);
    // Same original issuer/path is ONE announcement even when fetched via
    // both Atom and government search. Time/title conflicts fail closed.
    const key=sha(organization+"|"+url.origin+url.pathname);
    if(rejectedIdentities.has(key)){invalidOrConflicting++;continue;}
    const existing=byIdentity.get(key);
    if(existing){
      if(existing.source_native_published_at!==date ||
         titleText(existing.original_title??"").toLowerCase()!==title.toLowerCase()){
        byIdentity.delete(key);rejectedIdentities.add(key);invalidOrConflicting++;
      }else discarded++;
      continue;
    }
    const fact={classification:"PUBLISHER_ANNOUNCEMENT" as const,
      category:candidate.domain,country_iso3:input.country_iso3,
      commodity:candidate.domain==="rare_earth"?input.mineral:null,
      factual_assertion:"PUBLISHER_ISSUED_TITLED_ANNOUNCEMENT" as const,
      original_title:title,source_native_published_at:date,
      reference_year:null,publisher_organization_id:organization,
      original_article_url:url.origin+url.pathname,
      article_identity_sha256:candidate.article_identity_sha256,
      source_registry_id,source_rights_eligible:false,
      required_public_attribution:false,
      material_facts_independently_verified:false as const,
      same_event_corroborated:false as const,
      source_document_fingerprint_sha256:sha(canonicalRiskObjectJson([
        organization,url.origin+url.pathname,title,date,input.country_iso3,candidate.domain,
      ])),
    };
    byIdentity.set(key,fact);
  }
  const records=[...byIdentity.values()].sort((a,b)=>
    a.source_document_fingerprint_sha256.localeCompare(b.source_document_fingerprint_sha256));
  // The annual WDI records are original year-labelled observations, not
  // announcements. Never turn their years into precise release timestamps.
  const structural=input.annual_macro_changes.filter(row=>
    row.country_iso3===input.country_iso3 &&
    row.observation_type==="ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" &&
    Number.isInteger(row.latest_observation_year) &&
    Number.isInteger(row.previous_observation_year) &&
    row.previous_observation_year===row.latest_observation_year-1 &&
    HEX64.test(row.source_observation_sha256));
  let rights:B2CommercialSourceRight[]|null=null;
  if(records.length>0){
    try{rights=await (options.readRights??readB2CommercialSourceRights)();}
    catch{rights=null}
  }
  const checked=records.map(record=>{
    const matches=rights?.filter(x=>x.source_id===record.source_registry_id)??[];
    const row=matches.length===1?matches[0]:null;
    const policy=record.source_registry_id && row &&
      (!row.category || row.category===record.category)
      ?commercialSourceEligibilityFromRow(record.source_registry_id,row):null;
    return {...record,
      source_rights_eligible:policy?.eligible===true &&
        policy.delivery_boundary==="DERIVED_ONLY" && policy.raw_payload_allowed===false &&
        !!policy.licence_name?.trim(),
      required_public_attribution:policy?.attribution_required===true ||
        row?.attribution_required===true,
    };
  });
  const hasAttr=checked.some(x=>x.required_public_attribution);
  const allRights=checked.length>0 &&
    checked.every(x=>x.source_rights_eligible);
  const disposition:PrivateEvidenceDisposition=
    invalidOrConflicting>0 && checked.length===0?"INSUFFICIENT_EVIDENCE":
    checked.length===0 && structural.length===0
      ?(input.max_age_seconds<=86_400?"NO_CURRENT_EVIDENCE":"INSUFFICIENT_EVIDENCE")
      :checked.length===0?"INSUFFICIENT_EVIDENCE"
      :!rights?"SOURCE_RIGHTS_UNAVAILABLE"
      :hasAttr?"ATTRIBUTION_NOT_SUPPORTED"
      :!allRights?"SOURCE_RIGHTS_NOT_CERTIFIED"
      :"SOURCE_RIGHTS_VERIFIED_REVIEW_PENDING";
  const exact_evidence_sha256=sha(canonicalRiskObjectJson({
    country_iso3:input.country_iso3,categories:scoped,topics,
    mineral:input.mineral,max_age_seconds:input.max_age_seconds,
    factual_records:checked.map(x=>({
      identity:x.source_document_fingerprint_sha256,
      source_rights_eligible:x.source_rights_eligible,
      required_public_attribution:x.required_public_attribution,
    })),
    annual_structural_fingerprints:structural.map(x=>x.source_observation_sha256).sort(),
  }));
  return Object.freeze({
    schema:"geomacro.on-demand-private-evidence-package.v1" as const,
    country_iso3:input.country_iso3,categories:scoped as OnDemandCategory[],
    subject_topic_ids:topics,commodity:input.mineral,max_age_seconds:input.max_age_seconds,
    exact_evidence_sha256,disposition,evidence:checked,
    distinct_original_articles:checked.length,
    duplicate_announcements_discarded:discarded,
    annual_structural_observations:structural.length,
    original_publisher_dates_verified:checked.length,
    attribution_obligations_unmet:checked.filter(x=>x.required_public_attribution).length,
    conflicting_duplicate_records_rejected:invalidOrConflicting,
    independent_same_event_verified:false as const,
    conflicting_claims_reviewed:false as const,
    risk_severity_score:null,
    confidence:{
      original_publication:checked.length?"VERIFIED" as const:"NO_VERIFIED_ORIGINAL" as const,
      factual_impact:"NOT_ASSESSED" as const,source_independence:"NOT_REVIEWED" as const,
      calibrated_confidence:null,
    },
    commercial_derived_rights_verified:allRights,
    signed_gro_verified:false as const,x402_payment_authorized:false as const,
  });
}

/** This is the ONLY sanctioned public projection, with no private identifiers. */
export function publicOnDemandEvidenceDisposition(pkg:PrivateOnDemandEvidencePackage){
  return {
    schema:"geomacro.on-demand-evidence-status.v1" as const,
    status:pkg.disposition,
    verified_original_publication_count:pkg.original_publisher_dates_verified,
    annual_structural_observation_count:pkg.annual_structural_observations,
    duplicate_publisher_records_suppressed:pkg.duplicate_announcements_discarded,
    independent_same_event_verified:false as const,
    commercial_rights_verified:pkg.commercial_derived_rights_verified,
    qualified_signed_intelligence:false as const,
    x402_payment_authorized:false as const,
  };
}
