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
    // Even a reviewed issuer article still needs purpose-specific legal signoff,
    // unaltered provenance and country/event confirmation. Never auto grant.
    possibleDerivedUse:candidate,
    articleCommercialRightsVerified:false,
    commercialEligible:false,
  });
}
