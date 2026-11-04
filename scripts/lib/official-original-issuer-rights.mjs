import {verifyPinnedFactsOnlyGriV12Proof} from "./facts-only-gri-v12-dual-attestation.mjs";
/**
 * #1827 per-ISSUER commercial-use policy. Published terms may authorize
 * *publisher-owned* content or factual use, but NEVER prove each article
 * is first-party, current, attributed, country-relevant or redistributable.
 * No code here can activate pay-per-call, GRO, or raw source exports.
 *
 * Values were reviewed against the actual publisher legal notices on
 * 2026-10-11; see docs/STEP1_OFFICIAL_SOURCE_RIGHTS_REVIEW_2026-10-11.md.
 */
export const ORIGINAL_ISSUER_USE = Object.freeze({
  un_news_security_original_rss_review:Object.freeze({
    issuer:"united_nations",family:"geopolitics",
    rights:"NEWS_REUSE_NOTICE_REQUIRED",
    terms:"https://www.un.org/en/about-us/copyright/",
    restrictions:"Credit and advise UN; no original article redistribution before this requirement is satisfied",
  }),
  uk_fcdo_original_foreign_policy_atom_review:Object.freeze({
    issuer:"uk_fcdo",family:"geopolitics",
    rights:"OGL_V3_PUBLISHER_OWNED_ONLY",
    terms:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    restrictions:"Check page-specific terms, Crown ownership and third-party exclusions; attribute",
  }),
  fed_monetary_original_press_rss_review:Object.freeze({
    issuer:"federal_reserve_board",family:"macro",
    rights:"US_GOVERNMENT_PUBLIC_DOMAIN_PUBLISHER_ONLY",
    terms:"https://www.federalreserve.gov/disclaimer.htm",
    restrictions:"Board-authored material only; cite source; no third-party imagery or seals",
  }),
  statcan_prices_original_atom_review:Object.freeze({
    issuer:"statistics_canada",family:"macro",
    rights:"STATCAN_OPEN_LICENCE_PUBLISHER_ONLY",
    terms:"https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq",
    restrictions:"Specific Statistics Canada-owned content only, attribution and third-party exclusions",
  }),
  nrcan_government_news_original_atom_review:Object.freeze({
    issuer:"natural_resources_canada",family:"rare_earth",
    rights:"CANADA_OPEN_GOVERNMENT_LICENCE_PUBLISHER_ONLY",
    terms:"https://open.canada.ca/en/open-government-licence-canada/",
    restrictions:"Government-owned information only, attribution and third-party exclusions",
  }),
  uk_dbt_critical_minerals_atom_pending_review:Object.freeze({
    issuer:"uk_department_business_trade",family:"rare_earth",
    rights:"OGL_V3_PUBLISHER_OWNED_ONLY",
    terms:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    restrictions:"Exact Crown-owned GOV.UK news only; attribution and item-level third-party review",
  }),
  australia_industry_minister_original_rss_review:Object.freeze({
    issuer:"australian_industry_department",family:"rare_earth",
    rights:"NONCOMMERCIAL_REPRODUCTION_ONLY",
    terms:"https://www.minister.industry.gov.au/copyright",
    restrictions:"Publisher notice generally permits unaltered non-commercial reproductions; commercial article-content reuse NOT authorized",
  }),
  usgs_minerals_original_news_rss_review:Object.freeze({
    issuer:"us_geological_survey",family:"rare_earth",
    rights:"US_GOVERNMENT_PUBLIC_DOMAIN_PUBLISHER_ONLY",
    terms:"https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    restrictions:"USGS-produced works only; third-party materials excluded; live feed transport separately unavailable",
  }),
});
const LICENSE_PRELIMINARY = new Set([
  "OGL_V3_PUBLISHER_OWNED_ONLY",
  "US_GOVERNMENT_PUBLIC_DOMAIN_PUBLISHER_ONLY",
  "STATCAN_OPEN_LICENCE_PUBLISHER_ONLY",
  "CANADA_OPEN_GOVERNMENT_LICENCE_PUBLISHER_ONLY",
]);
/**
 * @param {{sourceId?: string, originalPublisherOwned?: boolean,
 * thirdPartyContentExcluded?: boolean, attributionRecorded?: boolean,
 * noticeSentToPublisher?: boolean}} [options]
 */
export function issuerRightsDisposition({sourceId,originalPublisherOwned=false,
  thirdPartyContentExcluded=false,attributionRecorded=false,
  noticeSentToPublisher=false}={}) {
  const rule=ORIGINAL_ISSUER_USE[sourceId];
  if(!rule)return Object.freeze({status:"UNKNOWN_SOURCE_FAIL_CLOSED",possibleDerivedUse:false,
    articleCommercialRightsVerified:false,commercialEligible:false});
  const licenseRecognized=LICENSE_PRELIMINARY.has(rule.rights);
  const notice=rule.rights==="NEWS_REUSE_NOTICE_REQUIRED" && noticeSentToPublisher===true;
  const candidate= (licenseRecognized||notice) &&
    originalPublisherOwned===true && thirdPartyContentExcluded===true &&
    attributionRecorded===true;
  return Object.freeze({
    sourceId,issuer:rule.issuer,rightsBasis:rule.rights,
    publisherRightsTerms:rule.terms,
    status:!licenseRecognized&&!notice?"HOLD_SOURCE_RIGHTS_OR_NOTICE":
      candidate?"PUBLISHER_RIGHTS_REVIEW_CANDIDATE":"HOLD_ITEM_LEVEL_EXCEPTIONS",
    // Grant the per-item issuer-rights disposition ONLY after the existing
    // ownership, third-party exclusion, attribution and notice (when required)
    // assertions have all been supplied. Other independent paid-product gates
    // (source authentication, event evidence, signatures) remain separate.
    possibleDerivedUse:candidate,
    articleCommercialRightsVerified:candidate,
    commercialEligible:candidate,
  });
}


/**
 * GeoMacro-wide facts-only commercial-reuse CANDIDATE policy.
 * Original publisher prose/selection/database may be protected even when
 * independently established facts are not copyrighted. A restricted article
 * can only trigger lawful discovery; commercial facts must be verified using
 * a DIFFERENT source whose own rights/terms permit the relevant use.
 *
 * Input proof flags MUST come from trusted server-side evidence validators,
 * never customer-controlled request parameters. This does not authorize GRO,
 * customer delivery, scoring without evidence or an article copyright license.
 */
export const DERIVED_FACTS_REUSE_POLICY_SCHEMA =
  "geomacro.facts-only-independent-commercial-review.v1";
const FACT_EVIDENCE_KINDS=new Set([
  "OFFICIAL_PRIMARY_DOCUMENT",
  "LICENSED_OPEN_DATASET",
]);
const FACTS_SHA=/^[a-f0-9]{64}$/u;
const FACT_EVENT=/^[A-Z][A-Z0-9_]{3,79}$/u;
const FACT_COUNTRY=/^[A-Z]{3}$/u;
const safeOfficialUrl=value=>{
 try{
  const u=new URL(value);
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.hash &&
    !u.port && !/[\u0000-\u001f]/u.test(value);
 }catch{return false}
};
/**
 * All sources, including third-party news, Telegram, GDELT, official feeds:
 * apply one decision contract without automatic commercial-rights promotion.
 * @param {object} source Trusted provenance, rights and scoring assertions.
 */
export function resolveDerivedCommercialEligibility(source={}){
 const s=source&&typeof source==="object"&&!Array.isArray(source)?source:{};
 const sourceId=typeof s.sourceId==="string"?s.sourceId:"";
 const originalRights=ORIGINAL_ISSUER_USE[sourceId]?.rights??"UNREVIEWED_OR_THIRD_PARTY";
 const originalRightsRestricted=originalRights==="NONCOMMERCIAL_REPRODUCTION_ONLY"||
   originalRights==="UNREVIEWED_OR_THIRD_PARTY"||
   originalRights==="NEWS_REUSE_NOTICE_REQUIRED";
 const evidence=Array.isArray(s.independentEvidence)?s.independentEvidence:[];
 const proof=evidence.length>=1&&evidence.length<=4&&evidence.every(e=>
   e&&typeof e==="object"&&!Array.isArray(e)&&
   FACT_EVIDENCE_KINDS.has(e.kind)&&safeOfficialUrl(e.url)&&
   FACTS_SHA.test(e.contentSha256)&&
   typeof e.issuer==="string"&&e.issuer.trim().length>=3&&
   e.independentlyFetched===true&&e.issuerVerified===true&&
   e.sameEventVerified===true&&e.factVerified===true&&
   e.licenceOrPublicDomainVerified===true&&
   e.thirdPartyMaterialExcluded===true);
 // One verified official primary fact may support a candidate. Dataset
 // mediated claims need two independent verified issuers. A GDELT CAMEO
 // event code alone never verifies an event or its severity.
 const hasPrimary=evidence.some(e=>e?.kind==="OFFICIAL_PRIMARY_DOCUMENT");
 // Distinct issuer labels are insufficient: two issuer aliases must not
 // recycle one dataset document, URL or content digest as dual corroboration.
 // These trusted assertions are upstream verification inputs, not RSS proofs.
 const independentDatasets=evidence.filter(e=>
   e?.kind==="LICENSED_OPEN_DATASET");
 const hasOpenDatasetConsensus=independentDatasets.length>=2 &&
   new Set(independentDatasets.map(e=>
     typeof e?.issuer==="string"?e.issuer.trim().toLowerCase():"")).size>=2 &&
   new Set(independentDatasets.map(e=>
     typeof e?.url==="string"?e.url:"")).size>=2 &&
   new Set(independentDatasets.map(e=>
     typeof e?.contentSha256==="string"?e.contentSha256:"")).size>=2;
 const independentFactsVerified=proof&&(hasPrimary||hasOpenDatasetConsensus)&&
   s.independentSameEventVerified===true&&
   typeof s.countryIso3==="string"&&FACT_COUNTRY.test(s.countryIso3)&&
   typeof s.eventType==="string"&&FACT_EVENT.test(s.eventType)&&
   s.sourceNativeTimeVerified===true&&
   FACTS_SHA.test(s.factualRecordSha256);
 const rightsSafe=s.sourceAccessAuthorized===true&&
   s.sourceTermsAllowThisProcessing===true&&
   s.publisherExpressionReused!==true&&s.rawArticleTextStored!==true&&
   s.originalArticleRedistributed!==true&&
   s.attributionRecorded===true;
 const allowMathematicalScore=rightsSafe&&independentFactsVerified===true;
 // A SHA-shaped string or caller-supplied audit=true is not an audit.
 // Require independently pinned Ed25519 Facts and Rights signatures over
 // an actually recomputed, source-capped, 72-hour GRI v1.2 calculation.
 const commercialEligible=allowMathematicalScore&&
   s.independentScoreAuditVerified===true&&
   s.scoreDerivedOnlyFromVerifiedFacts===true&&
   verifyPinnedFactsOnlyGriV12Proof(s);
 return Object.freeze({
   schema:DERIVED_FACTS_REUSE_POLICY_SCHEMA,sourceId,
   originalIssuerRightsBasis:originalRights,
   originalSourceSignalOnly:originalRightsRestricted,
   storeRawText:false,publishOriginalArticle:false,
   commercialOriginalArticleReuseAuthorized:false,
   independentFactsVerified:Boolean(independentFactsVerified),
   allowMathematicalScore:Boolean(allowMathematicalScore),
   commercialEligible:Boolean(commercialEligible),
   paidDeliveryAuthorized:false,signedGroAuthorized:false,
   status:!rightsSafe?"HOLD_SOURCE_ACCESS_OR_EXPRESSION":
      !independentFactsVerified?"PENDING_INDEPENDENT_FACT_VERIFICATION":
      !commercialEligible?"PENDING_INDEPENDENT_SCORE_AUDIT":
      "DERIVED_FACTS_COMMERCIAL_CANDIDATE",
 });
}


/**
 * Step 1: deterministic facts-only commercial Risk Gate review loop.
 * Call on every authorized discovery event, new independent source proof, or
 * signed-score arrival. No source fetch, payment unlock, storage, GRO signing
 * or customer publish happens here. An unlicensed article is a discovery
 * signal only; all promoted data comes from separately verified evidence.
 */
export const DERIVED_RISK_GATE_REVIEW_SCHEMA=
  "geomacro.derived-risk-gate-review-cycle.v1";
const RISK_GATE_CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const CANDIDATE_FACT_SHA=/^[a-f0-9]{64}$/u;
const nextReviewAction=status=>({
  HOLD_SOURCE_ACCESS_OR_EXPRESSION:"VERIFY_SOURCE_ACCESS_AND_PROCESSING_RIGHTS",
  PENDING_CORROBORATION:"FETCH_AND_VERIFY_INDEPENDENT_PRIMARY_OR_LICENSED_EVIDENCE",
  PENDING_INDEPENDENT_SCORE_AUDIT:"RECOMPUTE_AND_DUAL_SIGN_GRI_V12_PROOF",
  PENDING_EVENT_SCORE_BINDING:"BIND_ONE_VERIFIED_EVENT_TO_SIGNED_SCORE_ROW",
  DERIVED_FACTS_READY_FOR_DELIVERY_REVIEW:"RUN_SEPARATE_COMMERCIAL_DELIVERY_GATES",
})[status]??"HOLD_UNVERIFIED";

export function advanceDerivedRiskGateReview(source={}){
  const s=source&&typeof source==="object"&&!Array.isArray(source)?source:{};
  const rights=resolveDerivedCommercialEligibility(s);
  let status=rights.status==="HOLD_SOURCE_ACCESS_OR_EXPRESSION"?
    "HOLD_SOURCE_ACCESS_OR_EXPRESSION":
    !rights.independentFactsVerified?"PENDING_CORROBORATION":
    !rights.commercialEligible?"PENDING_INDEPENDENT_SCORE_AUDIT":
    "DERIVED_FACTS_READY_FOR_DELIVERY_REVIEW";
  let candidate=null;
  if(rights.commercialEligible){
    // The pinned and independently signed GRI proof already covers the score
    // event array. Bind the derived record to exactly ONE corresponding event;
    // never accept severity, domain or prose supplied separately by a caller.
    const rows=s.scoreProof?.score_events;
    const eventRows=Array.isArray(rows)?
      rows.filter(r=>r?.story_canonical_label===s.eventType):[];
    const row=eventRows.length===1?eventRows[0]:null;
    if(!row||!RISK_GATE_CATEGORIES.has(row.category)||
       typeof row.severity!=="number"||
       !Number.isFinite(row.severity)||row.severity<0||row.severity>100){
      status="PENDING_EVENT_SCORE_BINDING";
    }else{
      candidate=Object.freeze({
        schema:"geomacro.verified-risk-gate-fact-candidate.v1",
        event_type:s.eventType,
        country_iso3:s.countryIso3,
        domain:row.category,
        severity_impact:row.severity,
        // The event code is a controlled fact label: NOT article wording.
        recorded_fact:s.eventType,
        risk_score_0_100:s.scoreProof.verified_score_0_100,
        factual_record_sha256:s.factualRecordSha256,
        score_calculation_sha256:s.scoreProof.calculation_hash,
        evidence: Object.freeze(s.independentEvidence.map(e=>Object.freeze({
          kind:e.kind,issuer:e.issuer,url:e.url,sha256:e.contentSha256,
        }))),
      });
    }
  }
  return Object.freeze({
    schema:DERIVED_RISK_GATE_REVIEW_SCHEMA,
    status,next_action:nextReviewAction(status),
    source_id:rights.sourceId,
    original_source_signal_only:rights.originalSourceSignalOnly,
    source_rights_basis:rights.originalIssuerRightsBasis,
    independent_facts_verified:rights.independentFactsVerified,
    storeRawText:false,publishOriginalArticle:false,
    originalArticleRedistributed:false,
    allowMathematicalScore:rights.allowMathematicalScore,
    commercialEligible:status==="DERIVED_FACTS_READY_FOR_DELIVERY_REVIEW"&&
      candidate!==null,
    paidDeliveryAuthorized:false,signedGroAuthorized:false,
    candidate,
  });
}

/**
 * Bounded, idempotent-in-output review pass for scheduled ingestion callers.
 * Duplicates of an independently hashed event are collapsed, preferring its
 * most verified disposition. This function performs no writes and makes no
 * claim that producers are already wired to invoke it.
 */
export function reviewDerivedRiskGateBatch(sources=[]){
  if(!Array.isArray(sources)||sources.length>500)
    return Object.freeze({schema:DERIVED_RISK_GATE_REVIEW_SCHEMA,
      status:"BLOCKED_INVALID_BATCH",scanned:0,deduplicated:0,
      candidates:Object.freeze([]),reviews:Object.freeze([])});
  const accepted=new Map();
  for(let i=0;i<sources.length;i++){
    const source=sources[i];
    const result=advanceDerivedRiskGateReview(source);
    const s=source&&typeof source==="object"&&!Array.isArray(source)?source:{};
    const key=CANDIDATE_FACT_SHA.test(s.factualRecordSha256??"")&&
      /^[A-Z]{3}$/u.test(s.countryIso3??"")&&
      /^[A-Z][A-Z0-9_]{3,79}$/u.test(s.eventType??"")?
      s.countryIso3+"|"+s.eventType+"|"+s.factualRecordSha256:
      "unverified:"+i;
    const previous=accepted.get(key);
    const rank=r=>r.commercialEligible?4:
      r.status==="PENDING_EVENT_SCORE_BINDING"?3:
      r.status==="PENDING_INDEPENDENT_SCORE_AUDIT"?2:
      r.status==="PENDING_CORROBORATION"?1:0;
    if(!previous||rank(result)>rank(previous))accepted.set(key,result);
  }
  const reviews=Object.freeze([...accepted.values()]);
  return Object.freeze({
    schema:DERIVED_RISK_GATE_REVIEW_SCHEMA,status:"REVIEWED",
    scanned:sources.length,deduplicated:sources.length-reviews.length,
    candidates:Object.freeze(reviews.filter(r=>r.commercialEligible)
      .map(r=>r.candidate)),
    reviews,
  });
}
