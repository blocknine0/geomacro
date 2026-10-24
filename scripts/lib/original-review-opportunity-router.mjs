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
   publisher_hub_slot_mandatory:false,
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
  // Retain one of the three hub hours even if the unscored D1 journal
  // continually prioritizes a quiet, independently unverified country.
  publisher_hub_slot_mandatory:phase===1,
  verification_guaranteed:false,category_coverage_verified:false,
  commercial_rights_verified:false,network_requests_added:0
 });
}

/**
 * Keep one in four scheduled country-original opportunities genuinely fair.
 * A source-neutral, unscored D1 journal lead must never silently overwrite
 * that fairness slot and starve VAT/PSE and the long-tail 195 registry.
 * Manual owner dispatch still wins. Other hours may prioritize actual
 * recently observed publisher leads over heuristic issuer hubs.
 */
export function finalizeOriginalReviewCountry({
  opportunity,priority=null,manualCountry="",existsInRegistry,
}={}){
 if(!opportunity||typeof opportunity!=="object"||
    typeof existsInRegistry!=="function"||
    !ISO.test(opportunity.country_iso3??"")||
    !existsInRegistry(opportunity.country_iso3)||
    !["CANONICAL_195_FAIRNESS_ORIGINAL_REVIEW",
      "FIRST_PARTY_ISSUER_OPPORTUNITY_HEURISTIC"].includes(opportunity.selection_mode)||
    typeof manualCountry!=="string"||
    (manualCountry!==""&&(!ISO.test(manualCountry)||!existsInRegistry(manualCountry))))
   fail();
 if(manualCountry)return Object.freeze({
   country_iso3:manualCountry,mode:"MANUAL_COUNTRY_ORIGINAL_REVIEW",
   fairness_slot_preserved:false,journal_eligible_countries:0,
   actual_native_source_qualified:false,review_approved:false,
 });
 if(opportunity.selection_mode==="CANONICAL_195_FAIRNESS_ORIGINAL_REVIEW")
   return Object.freeze({
     country_iso3:opportunity.country_iso3,
     mode:opportunity.selection_mode,
     fairness_slot_preserved:true,
     journal_eligible_countries:Number.isSafeInteger(priority?.eligible_country_count)?
       priority.eligible_country_count:0,
     actual_native_source_qualified:false,review_approved:false,
   });
 // A bounded dedicated known first-party publisher search every fourth
 // hour is the minimum to make a genuine first current signed input plausible.
 if(opportunity.publisher_hub_slot_mandatory===true)
   return Object.freeze({
     country_iso3:opportunity.country_iso3,mode:opportunity.selection_mode,
     fairness_slot_preserved:false,publisher_hub_slot_preserved:true,
     journal_eligible_countries:Number.isSafeInteger(priority?.eligible_country_count)?
       priority.eligible_country_count:0,
     actual_native_source_qualified:false,review_approved:false,
   });
 const journalUsable=(priority?.selection_mode==="SHARED_D1_RECENT_COUNTRY_LEAD" ||
    priority?.selection_mode==="SHARED_D1_22H_REVIEW_LEAD") &&
    ISO.test(priority.country_iso3??"")&&
    existsInRegistry(priority.country_iso3)&&
    Number.isSafeInteger(priority.eligible_country_count)&&
    priority.eligible_country_count>0;
 return Object.freeze({
   country_iso3:journalUsable?priority.country_iso3:opportunity.country_iso3,
   mode:journalUsable?priority.selection_mode:opportunity.selection_mode,
   fairness_slot_preserved:false,
   journal_eligible_countries:Number.isSafeInteger(priority?.eligible_country_count)?
     priority.eligible_country_count:0,
   actual_native_source_qualified:false,review_approved:false,
 });
}
