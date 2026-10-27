/** Private, NO-NEW-FETCH 195 x three-domain census of the actual 25h D1 readback.
 * A dated candidate is not a verified original event, live publisher guarantee,
 * qualified intelligence or a signed commercial product.
 */
export const OBSERVED_COUNTRY_COVERAGE_VERSION="geomacro.observed-country-category-coverage.v1";
const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
const WINDOW_MS=25*3600000;

export function observedCountryCategoryCoverage(items,countries,now=Date.now()){
 if(!Array.isArray(items)||items.length>5000||!Array.isArray(countries)||
   countries.length!==195||!Number.isFinite(now))
   throw Error("SOURCE_COUNTRY_COVERAGE_INPUT_INVALID");
 const codes=countries.map(x=>x?.iso3);
 const valid=new Set(codes);
 if(valid.size!==195||codes.some(x=>typeof x!=="string"||!/^[A-Z]{3}$/u.test(x)))
   throw Error("SOURCE_COUNTRY_REGISTRY_INVALID");
 const cells=new Map(codes.map(x=>[x,Object.fromEntries(CATEGORIES.map(c=>[c,0]))]));
 const observed=new Set();
 let excludedMissingCountry=0,excludedNativeClock=0,excludedUnknownCountry=0,excludedUnrecognized=0,duplicateIds=0;
 for(const item of items){
  if(!item||typeof item!=="object"||!CATEGORIES.includes(item.category)||
    typeof item.id!=="string"||!/^news-[0-9a-f]{16,64}$/u.test(item.id)){
    excludedUnrecognized++;continue;
  }
  if(observed.has(item.id)){duplicateIds++;continue;}
  observed.add(item.id);
  const native=item.source?.original_published_at;
  const ms=typeof native==="string"?Date.parse(native):NaN;
  if(!Number.isFinite(ms)||ms>now||now-ms>WINDOW_MS){
    excludedNativeClock++;continue;
  }
  const iso3=item.country_iso3;
  if(iso3===null||iso3===undefined){excludedMissingCountry++;continue;}
  if(!valid.has(iso3)){excludedUnknownCountry++;continue;}
  cells.get(iso3)[item.category]++;
 }
 const matrix=[...cells].sort(([a],[b])=>a.localeCompare(b))
  .map(([iso3,counts])=>({iso3,counts}));
 const actualCountries=Object.fromEntries(CATEGORIES.map(category=>[
   category,matrix.filter(row=>row.counts[category]>0).length
 ]));
 const missing=Object.fromEntries(CATEGORIES.map(category=>[
  category,matrix.filter(row=>row.counts[category]===0).map(row=>row.iso3)
 ]));
 return {
  schema:OBSERVED_COUNTRY_COVERAGE_VERSION,window_hours:25,
  country_universe:195,required_cells:585,
  actual_observed_countries_by_category:actualCountries,
  missing_countries_by_category:missing,
  observed_cells:matrix.reduce((n,r)=>n+CATEGORIES.filter(c=>r.counts[c]>0).length,0),
  coverage_records:matrix,
  exclusions:{missing_country:excludedMissingCountry,invalid_native_clock:excludedNativeClock,
    unknown_iso3:excludedUnknownCountry,unrecognized_record:excludedUnrecognized,duplicate_ids:duplicateIds},
  country_mention_is_not_event_geography_verification:true,
  original_item_and_independent_event_verified:false,
  complete_195x3_live_ingestion_certified:false,
  derived_from_existing_d1_readback:true,
  additional_source_fetches:0,additional_d1_queries:0,
 };
}
