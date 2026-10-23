import {countryFromDerivedGeography} from "./derived-news-country-coverage-195";
import {country195ByIso3} from "./canonical-country-registry-195";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

/**
 * A verified-free shared D1 newsroom observation can PRIORITIZE an original
 * review request, never replace exact first-party HTML, a source-rights grant,
 * independent Facts/Rights review, a GRI score or a customer deliverable.
 *
 * The scheduled canonical-195 sweep remains independent; this one rotating
 * signing-intake slot prioritizes countries with already-seen exact native
 * release clocks. Missing/D1-degraded journal => bounded original rotation.
 */
export const JOURNAL_ORIGINAL_REVIEW_WINDOW_MS = 22*60*60_000;
const MIN_DELAY_MS=15*60_000;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
type Summary=Readonly<{
 country_iso3:string;
 selection_mode:"SHARED_D1_RECENT_COUNTRY_LEAD"|"CANONICAL_195_ROTATION";
 eligible_country_count:number;
 selected_country_observed_categories:number;
 journal_is_original_evidence:false;
 source_rights_or_signature_verified:false;
 paid_output_authorized:false;
}>;

export function selectPriorityOriginalReviewCountry(
 records:readonly StatelessIntelligenceSignal[],
 fallbackIso3:string,
 now:Date=new Date(),
):Summary {
 if(!country195ByIso3(fallbackIso3)||!(now instanceof Date)||
    !Number.isFinite(now.getTime())||!Array.isArray(records)||
    records.length>600)
   throw Error("PRIORITY_ORIGINAL_REVIEW_INPUT_INVALID");
 const clock=now.getTime();
 const countries=new Map<string,{categories:Set<string>;latest:number}>();
 const seen=new Set<string>();
 for(const record of records){
   if(!record||typeof record.id!=="string"||seen.has(record.id)||
      !CATEGORIES.has(record.category)||record.date_precision!=="exact"||
      record.status!=="official_release_observed_unscored"||
      record.same_event_corrob_verified!==false||
      record.severity!==null||!Array.isArray(record.sources_credited)||
      record.sources_credited.length!==0)
     continue;
   seen.add(record.id);
   const published=Date.parse(record.published_at);
   if(!Number.isFinite(published)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(record.published_at)||
      published>clock-MIN_DELAY_MS||
      published<clock-JOURNAL_ORIGINAL_REVIEW_WINDOW_MS)continue;
   const country=countryFromDerivedGeography(record.geography);
   if(!country||!country195ByIso3(country))continue;
   const previous=countries.get(country)??{categories:new Set<string>(),latest:0};
   previous.categories.add(record.category);
   previous.latest=Math.max(previous.latest,published);
   countries.set(country,previous);
 }
 const ranked=[...countries].sort(([a,ra],[b,rb])=>
    rb.categories.size-ra.categories.size ||
    rb.latest-ra.latest || a.localeCompare(b));
 // One country per existing scheduled intake, no multiplier of provider GETs.
 // Cycle across the most recent 12 exact-country candidates rather than
 // starving smaller countries behind one global news hotspot.
 const slot=Math.floor((clock-2*3_600_000)/(6*3_600_000));
 const selected=ranked.length?ranked[((slot%Math.min(12,ranked.length))+
   Math.min(12,ranked.length))%Math.min(12,ranked.length)]:null;
 return Object.freeze({
   country_iso3:selected?.[0]??fallbackIso3,
   selection_mode:selected?"SHARED_D1_RECENT_COUNTRY_LEAD":"CANONICAL_195_ROTATION",
   eligible_country_count:ranked.length,
   selected_country_observed_categories:selected?.[1].categories.size??0,
   journal_is_original_evidence:false,
   source_rights_or_signature_verified:false,
   paid_output_authorized:false,
 });
}
