import {describe,it,expect} from "vitest";
import {ORIGINAL_ISSUER_USE,issuerRightsDisposition} from "../../scripts/lib/official-original-issuer-rights.mjs";

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
   expect(noticed.articleCommercialRightsVerified).toBe(false);
   expect(noticed.commercialEligible).toBe(false);
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
     expect(allIssuerChecks.commercialEligible).toBe(false);
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
