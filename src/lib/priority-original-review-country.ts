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
// First-party source lead priority is intended to reach GRI <=90m current
// proof admission. The separate public 22h news/reference window is NOT
// shortened and cannot turn a historical release into current GRI.
// An older D1 observation must not pin hourly private source probes to one
// expired country until its 22h journal retention naturally lapses.
export const JOURNAL_ORIGINAL_REVIEW_WINDOW_MS = 90*60_000;
const MIN_DELAY_MS=0;
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
      record.sources_credited.length>2||
      record.sources_credited.some(c=>typeof c!=="string"||c.length>250))
     continue;
   seen.add(record.id);
   // Required attribution does not make a PRIVATE review lead unusable.
   // Never remove that credit or infer commercial rights from this choice.
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
 // Prefer the richest *distinct category* observations, while cycling
 // through up to 12 tied countries so one global headline hotspot cannot
 // occupy every scheduled intake. This remains only an original-page LEAD.
 const topCategories=ranked[0]?.[1].categories.size??0;
 const tied=ranked.filter(([,value])=>value.categories.size===topCategories)
   .slice(0,12);
 // Align ties with the new existing hourly original review cadence.
 // A six-hour tie step would retry the same possibly invalid article
 // for six consecutive hourly original-intake runs.
 const slot=Math.floor(clock/3_600_000);
 const selected=tied.length?tied[((slot%tied.length)+tied.length)%tied.length]:null;
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
