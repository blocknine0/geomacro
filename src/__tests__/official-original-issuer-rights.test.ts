import {describe,it,expect} from "vitest";
import {ORIGINAL_ISSUER_USE,issuerRightsDisposition,resolveDerivedCommercialEligibility} from "../../scripts/lib/official-original-issuer-rights.mjs";

const documentedOriginals=[
"un_news_security_original_rss_review",
"uk_fcdo_original_foreign_policy_atom_review",
"fed_monetary_original_press_rss_review",
"statcan_prices_original_atom_review",
"nrcan_government_news_original_atom_review",
"uk_dbt_critical_minerals_atom_pending_review",
"australia_industry_minister_original_rss_review",
"usgs_minerals_original_news_rss_review",
];
describe("#1827 original issuer reuse conditions",()=>{
 it("records exact public official rights terms for all original issuer families",()=>{
   expect(Object.keys(ORIGINAL_ISSUER_USE).sort()).toEqual([...documentedOriginals].sort());
   expect(new Set(Object.values(ORIGINAL_ISSUER_USE).map((r:any)=>r.family)))
     .toEqual(new Set(["geopolitics","macro","rare_earth"]));
   for(const row of Object.values(ORIGINAL_ISSUER_USE)){
     expect(new URL(row.terms).protocol).toBe("https:");
     expect(row.restrictions.length).toBeGreaterThan(25);
   }
 });
 it("never calls Australian minister's non-commercial licence commercial authorization",()=>{
   const x=issuerRightsDisposition({sourceId:"australia_industry_minister_original_rss_review",
     originalPublisherOwned:true,thirdPartyContentExcluded:true,attributionRecorded:true});
   expect(x.possibleDerivedUse).toBe(false);
   expect(x.articleCommercialRightsVerified).toBe(false);
   expect(x.commercialEligible).toBe(false);
   expect(x.status).toBe("HOLD_SOURCE_RIGHTS_OR_NOTICE");
 });
 it("holds UN original stories until UN was actually notified, then still no delivery gate",()=>{
   const base={sourceId:"un_news_security_original_rss_review",originalPublisherOwned:true,
     thirdPartyContentExcluded:true,attributionRecorded:true};
   const denied=issuerRightsDisposition(base);
   expect(denied.possibleDerivedUse).toBe(false);
   const noticed=issuerRightsDisposition({...base,noticeSentToPublisher:true});
   expect(noticed.possibleDerivedUse).toBe(true);
   expect(noticed.articleCommercialRightsVerified).toBe(true);
   expect(noticed.commercialEligible).toBe(true);
 });
 it("requires item publisher ownership, third-party exclusions and credit even for open licences",()=>{
   for(const sourceId of [
     "uk_fcdo_original_foreign_policy_atom_review",
     "fed_monetary_original_press_rss_review",
     "statcan_prices_original_atom_review",
     "nrcan_government_news_original_atom_review",
     "uk_dbt_critical_minerals_atom_pending_review",
     "usgs_minerals_original_news_rss_review",
   ]){
     const noCredit=issuerRightsDisposition({sourceId,originalPublisherOwned:true,
       thirdPartyContentExcluded:true});
     expect(noCredit.possibleDerivedUse).toBe(false);
     const noOwnership=issuerRightsDisposition({sourceId,thirdPartyContentExcluded:true,
       attributionRecorded:true});
     expect(noOwnership.possibleDerivedUse).toBe(false);
     const noThirdParty=issuerRightsDisposition({sourceId,originalPublisherOwned:true,
       attributionRecorded:true});
     expect(noThirdParty.possibleDerivedUse).toBe(false);
     const allIssuerChecks=issuerRightsDisposition({sourceId,originalPublisherOwned:true,
       thirdPartyContentExcluded:true,attributionRecorded:true});
     expect(allIssuerChecks.status).toBe("PUBLISHER_RIGHTS_REVIEW_CANDIDATE");
     expect(allIssuerChecks.articleCommercialRightsVerified).toBe(true);
     expect(allIssuerChecks.commercialEligible).toBe(true);
   }
 });
 it("never accidentally promotes unknown, EITI 403, NRCan unreviewed or another publisher",()=>{
   for(const sourceId of [undefined,"unknown","eiti_implementing_country_official_api_review",
     "nrcan_simply_science_official_rss_review"]){
     const x=issuerRightsDisposition({sourceId,originalPublisherOwned:true,
       thirdPartyContentExcluded:true,attributionRecorded:true,noticeSentToPublisher:true});
     expect(x.commercialEligible).toBe(false);
     expect(x.articleCommercialRightsVerified).toBe(false);
     expect(x.possibleDerivedUse).toBe(false);
   }
 });
});


const independentlyReviewedPrimary={
  kind:"OFFICIAL_PRIMARY_DOCUMENT",
  url:"https://www.industry.gov.au/news/independent-original-decision",
  issuer:"Australian Government Primary Gazette",
  contentSha256:"b".repeat(64),
  independentlyFetched:true,issuerVerified:true,sameEventVerified:true,
  factVerified:true,licenceOrPublicDomainVerified:true,thirdPartyMaterialExcluded:true,
};
const strictDerivedAttestation={
  sourceId:"australia_industry_minister_original_rss_review",
  sourceAccessAuthorized:true,sourceTermsAllowThisProcessing:true,
  publisherExpressionReused:false,rawArticleTextStored:false,
  originalArticleRedistributed:false,attributionRecorded:true,
  independentEvidence:[independentlyReviewedPrimary],
  countryIso3:"AUS",eventType:"MINERAL_EXPORT_RESTRICTION",
  sourceNativeTimeVerified:true,factualRecordSha256:"a".repeat(64),
  independentSameEventVerified:true,independentScoreAuditVerified:true,
  scoreDerivedOnlyFromVerifiedFacts:true,
};
describe("universal facts-only derived commercial candidate policy",()=>{
 it("restricted newspaper/government original is never made commercial merely by RSS access",()=>{
   const x=resolveDerivedCommercialEligibility({
     sourceId:"australia_industry_minister_original_rss_review",
     sourceAccessAuthorized:true,sourceTermsAllowThisProcessing:true,
     attributionRecorded:true,
   });
   expect(x.storeRawText).toBe(false);
   expect(x.publishOriginalArticle).toBe(false);
   expect(x.commercialOriginalArticleReuseAuthorized).toBe(false);
   expect(x.allowMathematicalScore).toBe(false);
   expect(x.commercialEligible).toBe(false);
   expect(x.status).toBe("PENDING_INDEPENDENT_FACT_VERIFICATION");
 });
 it("independently re-sourced licensed primary fact can qualify for math scoring, never automatic paid delivery",()=>{
   const x=resolveDerivedCommercialEligibility(strictDerivedAttestation);
   expect(x.originalSourceSignalOnly).toBe(true);
   expect(x.independentFactsVerified).toBe(true);
   expect(x.allowMathematicalScore).toBe(true);
   // Without two independently pinned Ed25519 signatures, boolean scoring
   // assertions and SHA-shaped placeholders NEVER authorize commercial use.
   expect(x.commercialEligible).toBe(false);
   expect(x.status).toBe("PENDING_INDEPENDENT_SCORE_AUDIT");
   expect(x.paidDeliveryAuthorized).toBe(false);
   expect(x.signedGroAuthorized).toBe(false);
 });
 it("forbid raw article text, verbatim reuse, disallowed source access and absent attribution",()=>{
   for(const patch of [
     {rawArticleTextStored:true},{publisherExpressionReused:true},
     {originalArticleRedistributed:true},{sourceAccessAuthorized:false},
     {sourceTermsAllowThisProcessing:false},{attributionRecorded:false},
   ]){
     const x=resolveDerivedCommercialEligibility({...strictDerivedAttestation,...patch});
     expect(x.commercialEligible).toBe(false);
     expect(x.allowMathematicalScore).toBe(false);
   }
 });
 it("a coded GDELT event alone is NOT independently verified fact or payable risk score",()=>{
   const x=resolveDerivedCommercialEligibility({
     ...strictDerivedAttestation,
     sourceId:"gdelt_project_event_metadata",
     independentEvidence:[{
       ...independentlyReviewedPrimary,
       kind:"LICENSED_OPEN_DATASET",issuer:"GDELT Project",
     }],
   });
   expect(x.independentFactsVerified).toBe(false);
   expect(x.commercialEligible).toBe(false);
 });
 it("two independently verified open metadata issuers can qualify only without copied expression",()=>{
   const x=resolveDerivedCommercialEligibility({
     ...strictDerivedAttestation,sourceId:"gdelt_project_event_metadata",
     independentEvidence:[
       {...independentlyReviewedPrimary,kind:"LICENSED_OPEN_DATASET",issuer:"GDELT Project"},
       {...independentlyReviewedPrimary,url:"https://reliefweb.int/updates",contentSha256:"c".repeat(64),
         kind:"LICENSED_OPEN_DATASET",issuer:"Independent Open Publisher"},
     ],
   });
   expect(x.allowMathematicalScore).toBe(true);
   expect(x.commercialEligible).toBe(false);
   expect(x.paidDeliveryAuthorized).toBe(false);
 });
 it("invalid evidence provenance, country and event identity cannot manufacture a verified score",()=>{
   for(const patch of [
     {countryIso3:"UNKNOWN"},{eventType:""},{factualRecordSha256:"dummy"},
     {independentSameEventVerified:false},{sourceNativeTimeVerified:false},
     {independentScoreAuditVerified:false},{scoreDerivedOnlyFromVerifiedFacts:false},
     {independentEvidence:[{...independentlyReviewedPrimary,licenceOrPublicDomainVerified:false}]},
   ]){
     expect(resolveDerivedCommercialEligibility({...strictDerivedAttestation,...patch})
       .commercialEligible).toBe(false);
   }
 });
});
