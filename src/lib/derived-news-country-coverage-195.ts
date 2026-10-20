import {COUNTRIES_195,country195ByIso3} from "./canonical-country-registry-195";
import type {DerivedNewsStructural} from "./derived-news-structural-bridge";

/** Read-only country mention routing for the SAME bounded 72h D1 news journal.
 * A headline country mention is NOT a country-specific original, licensed
 * commercial evidence, a verified subject, or a claim of global completeness.
 * Never infer country from a publisher's home country or from an undated feed.
 */
export const COUNTRY_NEWS_COVERAGE_SCHEMA=
  "geomacro.195x3-observed-derived-news-coverage.v1" as const;
export const COUNTRY_NEWS_DOMAINS=["geopolitics","macro","rare_earth"] as const;
export type NewsDomain=typeof COUNTRY_NEWS_DOMAINS[number];

const canonical=(value:string)=>value.normalize("NFKC").toLocaleLowerCase("en")
 .replace(/[\u2019\u02bc\u02bb]/gu,"'").replace(/\s+/gu," ").trim();
const byName=new Map<string,string|null>();
for(const country of COUNTRIES_195){
 for(const label of [country.name,...country.aliases]){
  const key=canonical(label);
  if(!key||key.length<3)continue;
  const prior=byName.get(key);
  if(prior===undefined)byName.set(key,country.iso3);
  else if(prior!==country.iso3)byName.set(key,null);
 }
}
/** EXACT geography-name or approved alias equality, no fuzzy substring. */
export function countryFromDerivedGeography(geography:string|null):string|null {
 if(typeof geography!=="string"||geography.length>80||
    /[<>\r\n]|https?:|www\./iu.test(geography))return null;
 return byName.get(canonical(geography))??null;
}
export function observedDerivedNewsForCountry(
 rows:readonly DerivedNewsStructural[],iso3:string,
 domain:NewsDomain|null=null,
):DerivedNewsStructural[]{
 if(!country195ByIso3(iso3)||
    (domain!==null&&!COUNTRY_NEWS_DOMAINS.includes(domain)))return [];
 return rows.filter(r=>(domain===null||r.category===domain)&&
   countryFromDerivedGeography(r.geography_mentioned)===iso3);
}
export function observed195x3Coverage(
 rows:readonly DerivedNewsStructural[],now:number,
 options:{country?:string|null;domain?:NewsDomain|null}={},
){
 if(!Number.isFinite(now)||!Array.isArray(rows)||rows.length>600)
  throw Error("COUNTRY_NEWS_195X3_INPUT_INVALID");
 const country=options.country??null,domain=options.domain??null;
 if((country!==null&&!country195ByIso3(country))||
    (domain!==null&&!COUNTRY_NEWS_DOMAINS.includes(domain)))
  throw Error("COUNTRY_NEWS_195X3_SCOPE_INVALID");
 const seen=new Set<string>();
 const matched=new Map<string,DerivedNewsStructural[]>();
 const categoryTotals:Record<NewsDomain,number>={geopolitics:0,macro:0,rare_earth:0};
 let unassigned=0;
 for(const row of rows){
  if(seen.has(row.id))throw Error("COUNTRY_NEWS_195X3_DUPLICATE_ID");
  seen.add(row.id);
  if(!COUNTRY_NEWS_DOMAINS.includes(row.category))throw Error("COUNTRY_NEWS_195X3_DOMAIN_INVALID");
  categoryTotals[row.category]++;
  const iso=countryFromDerivedGeography(row.geography_mentioned);
  if(!iso){unassigned++;continue;}
  const key=iso+":"+row.category;
  const arr=matched.get(key)??[];
  arr.push(row);matched.set(key,arr);
 }
 const countries=country===null?COUNTRIES_195:[country195ByIso3(country)!];
 const domains=domain===null?COUNTRY_NEWS_DOMAINS:[domain];
 const cells=countries.flatMap(c=>domains.map(d=>{
  const entries=matched.get(c.iso3+":"+d)??[];
  const latest=entries[0]??null;
  return {
   country_iso3:c.iso3,country_name:c.name,category:d,
   status:entries.length?
     "DERIVED_OFFICIAL_COUNTRY_MENTION_OBSERVED_UNVERIFIED":
     "NO_MATCHING_COUNTRY_MENTION_IN_BOUNDED_JOURNAL",
   observed_derived_records_72h:entries.length,
   classified_topic_releases_72h:entries.filter(x=>x.qualifying_topic_release_verified).length,
   unclassified_candidates_72h:entries.filter(x=>!x.qualifying_topic_release_verified).length,
   latest_original_published_at:latest?.original_published_at??null,
   // No issuer/locale/rights inference from 195-country support.
   country_subject_verified:false,local_original_publisher_verified:false,
   independent_same_event_verified:false,commercial_rights_verified:false,
   all_news_exhaustive:false,paid_delivery_eligible:false,
  };
 }));
 return {
  schema:COUNTRY_NEWS_COVERAGE_SCHEMA,
  country_count:COUNTRIES_195.length,category_count:COUNTRY_NEWS_DOMAINS.length,
  total_country_category_cells:585,
  returned_cells:cells.length,
  coverage_scope:"OBSERVED_DERIVED_RELEASES_IN_EXISTING_72H_D1_JOURNAL_ONLY",
  country_routing_basis:"EXACT_DERIVED_TITLE_GEOGRAPHY_MENTION_ONLY",
  not_observed_means_no_news:false,
  exhaustive_country_news_coverage_verified:false,
  producer_country_original_coverage_verified:false,
  original_release_delay_minutes:15,retention_hours:72,
  generated_at:new Date(now).toISOString(),
  source_neutral_derived_records_in_journal:rows.length,
  unassigned_or_regional_derived_records_72h:unassigned,
  observed_derived_records_by_category:categoryTotals,
  payment_required_now:false,chargeable:false,scored:false,signed:false,
  raw_upstream_delivered:false,
  cells,
 };
}
