/**
 * Current-original PRE-REVIEW country scheduling.
 *
 * A single country per hourly bounded provider budget cannot have guaranteed
 * new geopolitical, macro and minerals originals within <=90m. The previous
 * uniform rotation could use every current 12-GET run on an issuer-poor
 * country with no matching release. Opportunistically revisit subjects
 * covered by the already pinned official issuer readers while preserving an
 * exact periodic 195-country fairness slot and allowing D1/owner priority
 * to override this fallback.
 *
 * This is an *operational retry order*, NEVER origin authenticity, a
 * licence, independent corroboration, a signed numerical score, country
 * coverage or customer acceptance. It introduces ZERO HTTP/B2/D1 calls.
 */
export const ORIGINAL_REVIEW_PUBLISHER_HUBS=Object.freeze([
 "GBR","USA","CAN","AUS","JPN","DEU","FRA","IND","CHN"
]);
const HOURS_4=4;
const ISO=/^[A-Z]{3}$/u;
const fail=()=>{throw Error("ORIGINAL_REVIEW_OPPORTUNITY_ROUTER_INVALID")};
export function chooseOriginalReviewCountry({
 now=new Date(),fairnessCountryForRun,existsInRegistry
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   typeof fairnessCountryForRun!=="function"||
   typeof existsInRegistry!=="function"||
   ORIGINAL_REVIEW_PUBLISHER_HUBS.some(code=>
     !ISO.test(code)||!existsInRegistry(code)))
  fail();
 const epochHour=Math.floor(now.getTime()/3_600_000);
 const phase=((epochHour%HOURS_4)+HOURS_4)%HOURS_4;
 // Every fourth hourly check MUST still advance one canonical 195 slot.
 // This is not a claim that that country's 3 domains have fresh news.
 if(phase===0){
  const slot=Math.floor(epochHour/HOURS_4);
  const fairnessEpochHour=slot;
  const country=fairnessCountryForRun(new Date(fairnessEpochHour*3_600_000));
  if(!ISO.test(country)||!existsInRegistry(country))fail();
  return Object.freeze({
   country_iso3:country,
   selection_mode:"CANONICAL_195_FAIRNESS_ORIGINAL_REVIEW",
   publisher_hub_heuristic_only:false,
   verification_guaranteed:false,category_coverage_verified:false,
   commercial_rights_verified:false,network_requests_added:0
  });
 }
 // 3 of 4 hours reuse approved-publisher *search subjects* rather than
 // claiming third-party countries are legally licensed. Rotate across all
 // pinned reader hubs; after the 9-hub cycle every hub has had a slot.
 const slot=Math.floor(epochHour/HOURS_4)*3+phase-1;
 const country=ORIGINAL_REVIEW_PUBLISHER_HUBS[
  ((slot%ORIGINAL_REVIEW_PUBLISHER_HUBS.length)+ORIGINAL_REVIEW_PUBLISHER_HUBS.length)%
  ORIGINAL_REVIEW_PUBLISHER_HUBS.length
 ];
 return Object.freeze({
  country_iso3:country,selection_mode:"FIRST_PARTY_ISSUER_OPPORTUNITY_HEURISTIC",
  publisher_hub_heuristic_only:true,
  verification_guaranteed:false,category_coverage_verified:false,
  commercial_rights_verified:false,network_requests_added:0
 });
}
