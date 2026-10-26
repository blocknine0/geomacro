import {COUNTRIES_195,country195ByIso3} from "./canonical-country-registry-195";
import type {DerivedNewsStructural} from "./derived-news-structural-bridge";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";


export const PUBLIC_FINDS_COUNTRY_COVERAGE_SCHEMA =
  "geomacro.195x3-public-finds-coverage.v2" as const;
const PUBLIC_FINDS_STATUS="DERIVED_COUNTRY_MENTION_OBSERVED_UNVERIFIED" as const;
const NO_COUNTRY_MATCH="NO_MATCHING_COUNTRY_MENTION_IN_ROLLING_STATIC_ARCHIVE" as const;
const PUBLIC_FIND_RETENTION_MS=72*60*60_000;
const PUBLIC_FIND_STATUSES=new Set([
  "official_release_observed_unscored",
  "official_feed_candidate_unscored",
  "osint_feed_observed_unverified",
]);
const COUNTRY_TITLE_MEDIA_SUFFIX=/\s+[—–-]\s+(?:Al Jazeera|The Hindu|TASS|Xinhua|The Tribune-Democrat|Bozeman Daily Chronicle|Mining Weekly|Reuters|Associated Press|Bloomberg|Financial Times|The Guardian|The Independent|The New York Times|The Washington Post|BBC|CNN|China Daily|Japan Times|South China Morning Post|The Korea Herald|The Korea Times|Taipei Times|The Manila Times|The New Zealand Herald|The Jerusalem Post|The Times of India|Times of India|India Today|The Straits Times|The Jakarta Post|The Bangkok Post|France 24|Deutsche Welle|Euronews|The National|Arab News|Daily Sabah|Hindustan Times|Business Standard|The Economic Times|The Kyiv Independent|Kyiv Independent|The Globe and Mail|CBC|Nikkei Asia|Nikkei|The Australian|The Sydney Morning Herald|The Telegraph|The Times|The Star|The Diplomat)\s*$/iu;
const MEDIA_FOLLOWING_COUNTRY=/^\s+(?:daily|times|post|news|herald|press|observer|chronicle|standard|today|tribune|businessline|morning post|independent|review|express|bulletin|record|mail)\b/iu;
function escapeRegExp(value:string){
 return [...value].map(char=>".^$*+?()[]{}|\\".includes(char)?"\\"+char:char).join("");
}

/**
 * Routes one row only when its exact geography field or headline identifies
 * one unambiguous country. Multiple-country headlines stay regional/unassigned.
 * This is mention routing, not verification that the event is about that state.
 */
export function countryFromDerivedHeadline(title:string):string|null{
 if(typeof title!=="string"||title.length>240||/[<>\r\n]|https?:|www\./iu.test(title))return null;
 const core=canonical(title.replace(/^Geomacro finds\s+/iu,"").replace(COUNTRY_TITLE_MEDIA_SUFFIX,""));
 if(!core)return null;
 const spans:Array<{start:number;end:number;iso3:string}>=[];
 for(const alias of uniqueCountryAliases){
  const phrase=escapeRegExp(canonical(alias.label)).replace(/ /gu,"\\s+");
  const pattern=new RegExp("(^|[^\\p{L}\\p{N}])("+phrase+")(?=$|[^\\p{L}\\p{N}])","gu");
  for(const match of core.matchAll(pattern)){
   const start=(match.index??0)+match[1].length;
   const end=start+match[2].length;
   if(MEDIA_FOLLOWING_COUNTRY.test(core.slice(end)))continue;
   if(spans.some(span=>start<span.end&&end>span.start))continue;
   spans.push({start,end,iso3:alias.iso3});
  }
 }
 const codes=[...new Set(spans.map(span=>span.iso3))];
 return codes.length===1?codes[0]:null;
}
function countryFromPublicFind(signal:Pick<StatelessIntelligenceSignal,"geography"|"title">):string|null{
 const geography=countryFromDerivedGeography(signal.geography);
 if(geography)return geography;
 // An explicit but unknown/ambiguous geography is not overridden by title guesswork.
 if(typeof signal.geography==="string"&&signal.geography.trim())return null;
 return countryFromDerivedHeadline(signal.title);
}
/**
 * Counts only the safe Geomacro-derived records already in the rolling public
 * archive. It reveals no titles, source identities, URLs or article text.
 * Country routing uses one exact geography/title mention and is always
 * unverified; multi-country stories remain unassigned rather than being
 * duplicated into several country cells.
 */
export function observedPublicFinds195x3Coverage(
 rows:readonly StatelessIntelligenceSignal[],now:number,
 options:{country?:string|null;domain?:NewsDomain|null}={},
){
 if(!Number.isFinite(now)||!Array.isArray(rows)||rows.length>250)
  throw Error("COUNTRY_NEWS_195X3_INPUT_INVALID");
 const country=options.country??null,domain=options.domain??null;
 if((country!==null&&!country195ByIso3(country))||
    (domain!==null&&!COUNTRY_NEWS_DOMAINS.includes(domain)))
  throw Error("COUNTRY_NEWS_195X3_SCOPE_INVALID");
 const seen=new Set<string>();
 const matched=new Map<string,StatelessIntelligenceSignal[]>();
 const categoryTotals:Record<NewsDomain,number>={geopolitics:0,macro:0,rare_earth:0};
 let unassigned=0;
 const recent:StatelessIntelligenceSignal[]=[];
 for(const row of rows){
  if(!row||typeof row!=="object"||Array.isArray(row)||
     typeof row.id!=="string"||seen.has(row.id)||
     !COUNTRY_NEWS_DOMAINS.includes(row.category as NewsDomain)||
     !PUBLIC_FIND_STATUSES.has(String(row.status))||
     typeof row.title!=="string"||typeof row.published_at!=="string")
   throw Error("COUNTRY_NEWS_195X3_PUBLIC_FIND_INVALID");
  seen.add(row.id);
  const at=Date.parse(row.published_at);
  if(!Number.isFinite(at)||at>now||at<now-PUBLIC_FIND_RETENTION_MS)continue;
  const category=row.category as NewsDomain;
  categoryTotals[category]++;
  recent.push(row);
  const iso=countryFromPublicFind(row);
  if(!iso){unassigned++;continue;}
  const key=iso+":"+category;
  const items=matched.get(key)??[];
  items.push(row);
  matched.set(key,items);
 }
 const countries=country===null?COUNTRIES_195:[country195ByIso3(country)!];
 const domains=domain===null?COUNTRY_NEWS_DOMAINS:[domain];
 const globallyAssigned=[...matched.values()].reduce((sum,items)=>sum+items.length,0);
 if(globallyAssigned+unassigned!==recent.length)
  throw Error("COUNTRY_NEWS_195X3_ASSIGNMENT_ACCOUNTING_INVALID");
 const cells=countries.flatMap(c=>domains.map(d=>{
  const entries=(matched.get(c.iso3+":"+d)??[])
   .slice().sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
  const latest=entries[0]??null;
  const classified=entries.filter(row=>row.status==="official_release_observed_unscored").length;
  return {
   country_iso3:c.iso3,country_name:c.name,category:d,
   status:entries.length?PUBLIC_FINDS_STATUS:NO_COUNTRY_MATCH,
   observed_derived_records_72h:entries.length,
   classified_topic_releases_72h:classified,
   unclassified_candidates_72h:entries.length-classified,
   latest_original_published_at:latest?.published_at??null,
   country_subject_verified:false,local_original_publisher_verified:false,
   independent_same_event_verified:false,commercial_rights_verified:false,
   all_news_exhaustive:false,paid_delivery_eligible:false,
  };
 }));
 return {
  schema:PUBLIC_FINDS_COUNTRY_COVERAGE_SCHEMA,
  country_count:COUNTRIES_195.length,category_count:COUNTRY_NEWS_DOMAINS.length,
  total_country_category_cells:585,returned_cells:cells.length,
  coverage_scope:"OBSERVED_PUBLIC_GEOMACRO_FINDS_IN_PERMANENT_STATIC_ARCHIVE_ROLLING_LATEST_250",
  country_routing_basis:"EXACT_PUBLIC_TITLE_OR_GEOGRAPHY_MENTION_ONLY",
  not_observed_means_no_news:false,
  exhaustive_country_news_coverage_verified:false,
  producer_country_original_coverage_verified:false,
  original_release_delay_minutes:0,retention_hours:72,
  generated_at:new Date(now).toISOString(),
  source_neutral_derived_records_in_public_archive_latest_250:recent.length,
  unassigned_or_regional_derived_records_72h:unassigned,
  observed_derived_records_by_category:categoryTotals,
  payment_required_now:false,chargeable:false,scored:false,signed:false,
  raw_upstream_delivered:false,cells,
 };
}

/** Read-only country mention routing over the permanent archive rolling latest feed (at most 250 eligible records).
 * A headline country mention is NOT country-specific original evidence, licensed
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

const uniqueCountryAliases=[...byName.entries()]
 .filter((entry):entry is [string,string]=>entry[1]!==null)
 .map(([label,iso3])=>({label,iso3}))
 .sort((a,b)=>b.label.length-a.label.length||a.canonical(a.label).localeCompare(canonical(b.label)));
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
 if(!Number.isFinite(now)||!Array.isArray(rows)||rows.length>250)
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
     "NO_MATCHING_COUNTRY_MENTION_IN_ROLLING_STATIC_ARCHIVE",
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
  coverage_scope:"OBSERVED_DERIVED_RELEASES_IN_PERMANENT_STATIC_ARCHIVE_ROLLING_LATEST_250_ONLY",
  country_routing_basis:"EXACT_DERIVED_TITLE_GEOGRAPHY_MENTION_ONLY",
  not_observed_means_no_news:false,
  exhaustive_country_news_coverage_verified:false,
  producer_country_original_coverage_verified:false,
  original_release_delay_minutes:0,retention_hours:72,
  generated_at:new Date(now).toISOString(),
  source_neutral_derived_records_in_public_archive_latest_250:rows.length,
  unassigned_or_regional_derived_records_72h:unassigned,
  observed_derived_records_by_category:categoryTotals,
  payment_required_now:false,chargeable:false,scored:false,signed:false,
  raw_upstream_delivered:false,
  cells,
 };
}
