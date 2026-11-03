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
 const hasOpenDatasetConsensus=evidence.filter(e=>
   e?.kind==="LICENSED_OPEN_DATASET").length>=2 &&
   new Set(evidence.map(e=>e?.issuer)).size>=2;
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
 const commercialEligible=allowMathematicalScore&&
   s.independentScoreAuditVerified===true&&
   s.scoreDerivedOnlyFromVerifiedFacts===true;
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
