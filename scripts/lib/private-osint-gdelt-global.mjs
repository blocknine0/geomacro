/**
 * GDELT 2.0 15-minute STATIC ZIP discovery. No DOC API requests, publisher
 * page scraping, inferred source publication timestamps, or paid promotion.
 * The HTTPS files are taken only from provider manifest MD5/size-verified URLs.
 */
import {readGdeltStaticArchive,summarizeGdeltGkgBulk}
 from "./gdelt-gkg-bulk-discovery.mjs";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const MAX_ROWS=100_000;
const CONFLICT_ROOT_CODES=new Set(["13","14","15","16","17","18","19","20"]);
const BATCH_WINDOW_MS=2*3600_000;
const dateAdded=x=>{
 if(!/^\d{14}$/u.test(String(x??"")))return null;
 const t=String(x);
 const iso=t.slice(0,4)+"-"+t.slice(4,6)+"-"+t.slice(6,8)+"T"+
   t.slice(8,10)+":"+t.slice(10,12)+":"+t.slice(12,14)+".000Z";
 const ms=Date.parse(iso);
 return Number.isFinite(ms)&&new Date(ms).toISOString()===iso?ms:null;
};
/** GDELT's ActionGeo_CountryCode is FIPS, not ISO3 event attribution. */
export function summarizeGdeltEventsStaticCsv(content,{batch_at,now=new Date()}={}){
 const clock=Date.parse(String(batch_at??""));
 if(typeof content!=="string"||Buffer.byteLength(content)>64*1024*1024||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isFinite(clock)||clock>now.getTime()||
    now.getTime()-clock>BATCH_WINDOW_MS)
  throw Error("GDELT_EVENTS_STATIC_INPUT_INVALID");
 const seen=new Set(),geopolitics=new Set(),geoCodes=new Set();
 let scanned=0,valid=0,withSource=0;
 for(const line of content.split("\n")){
  if(!line.trim())continue;
  if(++scanned>MAX_ROWS)throw Error("GDELT_EVENTS_STATIC_ROWS_EXCEEDED");
  const columns=line.replace(/\r$/u,"").split("\t");
  if(columns.length!==61)continue;
  const eventId=columns[0],added=dateAdded(columns[59]);
  if(!/^\d+$/u.test(eventId)||!Number.isFinite(added)||
     added>now.getTime()+5*60_000||
     Math.abs(added-clock)>60*60_000)continue;
  if(seen.has(eventId))continue;
  seen.add(eventId);valid++;
  const goldstein=Number(columns[30]);
  if(!Number.isFinite(goldstein)||goldstein< -10||goldstein>10)continue;
  const source=columns[60];
  try{
   const u=new URL(source);
   if(!["http:","https:"].includes(u.protocol)||u.username||u.password||
      u.href.length>2048)continue;
  }catch{continue}
  withSource++;
  if(CONFLICT_ROOT_CODES.has(columns[28])){
   geopolitics.add(eventId);
   if(/^[A-Z]{2}$/u.test(columns[53]))geoCodes.add(columns[53]);
  }
 }
 return Object.freeze({
  schema:"geomacro.gdelt-static-events-private-index.v1",
  scanned_event_rows:scanned,distinct_valid_event_ids:valid,
  event_rows_with_source_url_and_goldstein:withSource,
  geopolitics_conflict_event_hints:geopolitics.size,
  distinct_gdelt_fips_geo_codes:geoCodes.size,
  publisher_original_date_verified:false,iso3_event_country_verified:false,
  news_original_url_emitted:false,rights_verified:false,chargeable:false,
 });
}
export async function privateGdeltGlobalDiscovery({
 now=new Date(),fetchImpl=fetch,resolveCountry,sleepImpl=()=>Promise.resolve(),
 readArchive=readGdeltStaticArchive,
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof resolveCountry!=="function"||typeof fetchImpl!=="function"||
    typeof sleepImpl!=="function"||typeof readArchive!=="function")
  throw Error("OSINT_GDELT_CONFIG_INVALID");
 const [eventResult,gkgResult]=await Promise.allSettled([
  readArchive({fetchImpl,now,kind:"events",max404Fallbacks:1}),
  readArchive({fetchImpl,now,kind:"gkg",max404Fallbacks:1}),
 ]);
 let events=null,gkg=null;
 if(eventResult.status==="fulfilled"){
  try{events=summarizeGdeltEventsStaticCsv(eventResult.value.decoded,{
    now,batch_at:eventResult.value.manifest.batch_at});}catch{}
 }
 if(gkgResult.status==="fulfilled"){
  try{gkg=summarizeGdeltGkgBulk(gkgResult.value.decoded,{
    now,batch_at:gkgResult.value.manifest.batch_at});}catch{}
 }
 const domains=new Map((gkg?.domains??[]).map(x=>[x.category,x]));
 const counts=Object.fromEntries(CATEGORIES.map(cat=>[
  cat,Number(domains.get(cat)?.theme_matched_article_count??0)
 ]));
 const outcomes=CATEGORIES.map(category=>({
  category,state:gkg?"OBSERVED_STATIC_GKG":"UNAVAILABLE_STATIC_GKG",
  index_metadata_hints:counts[category],
  static_event_conflict_hints:category==="geopolitics"?
    events?.geopolitics_conflict_event_hints??0:0,
 }));
 return {
  schema:"geomacro.private-gdelt-discovery-hints.v1",
  transport:"STATIC_LASTUPDATE_MD5_VERIFIED_ZIP",
  checks:outcomes,
  static_events_integrity_verified:events!==null,
  static_gkg_integrity_verified:gkg!==null,
  conflict_event_hints:events?.geopolitics_conflict_event_hints??0,
  global_article_index_hints:Object.values(counts).reduce((a,b)=>a+b,0),
  mapped_country_count:0,unmapped_or_ambiguous_hints:
    Object.values(counts).reduce((a,b)=>a+b,0),
  canonical_195_country_router:true,source_publisher_clock_verified:false,
  gdelt_index_time_is_not_publication_time:true,
  source_original_pages_verified:false,commercial_rights_verified:false,
  attribution_and_scope_pending:true,
  original_article_urls_or_titles_emitted:false,
  headline_body_stored:false,raw_content_downloaded:true,
  private_only:true,public_published:false,paid_products_authorized:false,
  index_refresh_guaranteed_within_15m:false,
 };
}
