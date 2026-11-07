/**
 * Every best-effort 20-minute GitHub tick continuously checks *publisher*
 * RSS/Atom/JSON feeds for GeoMacro's three risk categories; no extra GDELT
 * bulk GET, news.google.com discovery result, Telegram scrape, AIS stream,
 * paid provider or credentialed API is introduced here.
 *
 * This keeps every Hot-50 (when not retired) and the existing larger
 * 195-country global native-feed registry. Under 512 GET ceiling it rotates
 * additional non-priority direct feeds instead of discarding them. No catalog
 * entry implies feed HTTP success, publisher rights or a verified event.
 */
import {HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
import {hot50Direct20mPublisherRegistry} from "./hot-50-direct-20m-sources.mjs";
import {hot50RetiredBackupSources} from "./hot-50-retired-backup-sources.mjs";
import {geopoliticsContinuitySources} from "./geopolitics-continuity-sources.mjs";
import {macroMineralsContinuitySources} from "./macro-minerals-continuity-sources.mjs";
import {privateOsintRuntimeSources} from "./private-osint-country-rotation.mjs";
import {privateOsintGlobalSources} from "./private-osint-global-sources.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
import {retiredSourceReplacements} from "./retired-source-replacements.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

export const GLOBAL_DIRECT_20M_MAX_REQUESTS=512;
const SPARE_RETRIES=8;
const MAX_DIRECT=GLOBAL_DIRECT_20M_MAX_REQUESTS-SPARE_RETRIES;
const TYPES=new Set(["rss","rdf","atom","xml","json"]);
const CATS=["geopolitics","macro","rare_earth"];
const INTERVAL=20*60_000;

const directSource=s=>{
 if(!s||typeof s.url!=="string"||typeof s.id!=="string"||
    !TYPES.has(s.type)||!Array.isArray(s.categories)||
    !s.categories.length||s.categories.some(c=>!CATS.includes(c))||
    s.private_discovery_index_only===true||
    isRetiredPrivateOsintSource(s))
  return false;
 let u;
 try{u=new URL(s.url)}catch{return false}
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
   u.hostname!=="news.google.com"&&u.hostname!=="t.me"&&
   !u.hostname.endsWith(".t.me")&&!u.hostname.endsWith(".internal")&&
   !u.hostname.endsWith(".local")&&u.hostname.includes(".");
};
function safeDirect(source){
 return Object.freeze({...source,categories:Object.freeze([...source.categories]),
  supported:true,private_discovery_index_only:false,
  publisher_native_dates_required:true,
  original_article_verified:false,rights_verified:false,
  commercial_eligible:false,publicly_deliverable:false,
  private_three_domain_direct20m:true,
 });
}
export function threeDomainGlobal20mPublisherRegistry(now=new Date(),{
 base=null,hot50=null,requestCeiling=MAX_DIRECT,
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isSafeInteger(requestCeiling)||requestCeiling<109||
    requestCeiling>MAX_DIRECT)
  throw Error("THREE_DOMAIN_20M_REGISTRY_INVALID");
 const raw=base??privateOsintRuntimeSources(now,privateOsintGlobalSources(),
   COUNTRIES_195,{includeLocalGapLane:true});
 const first=hot50??hot50Direct20mPublisherRegistry(now).registry;
 if(!Array.isArray(raw)||raw.length<1||raw.length>512||
    !Array.isArray(first)||first.length<1||first.length>512)
  throw Error("THREE_DOMAIN_20M_SOURCE_ARRAY_INVALID");
 const backups=hot50RetiredBackupSources();
 const merged=new Map(),hotUrls=new Set();
 const add=(s,priority)=>{
  if(isRetiredPrivateOsintSource(s))return;
  if(!directSource(s)){
   if(priority)throw Error("THREE_DOMAIN_20M_HOT_SOURCE_INVALID");
   return;
  }
  const old=merged.get(s.url);
  if(old){
   const cats=[...new Set([...old.categories,...s.categories])];
   if(priority&&old.publisher_country_iso3&&s.publisher_country_iso3&&
      old.publisher_country_iso3!==s.publisher_country_iso3)
    throw Error("THREE_DOMAIN_20M_PUBLISHER_COUNTRY_DRIFT");
   merged.set(s.url,safeDirect({...old,categories:cats,
     backup_for_retired_ids:[...new Set([...(old.backup_for_retired_ids??[]),
       ...(s.backup_for_retired_ids??[])])],
     private_hot50_backup:old.private_hot50_backup===true||s.private_hot50_backup===true,
     private_hot50_direct_20m:old.private_hot50_direct_20m||priority}));
  }else merged.set(s.url,safeDirect(s));
  if(priority)hotUrls.add(s.url);
 };
 for(const s of first)add(s,true);
 const oldPinnedCount=hotUrls.size;
 for(const s of retiredSourceReplacements())add(s,true);
 // Guarantee a source-specific replacement for all 14 retired Hot-50 IDs.
 // Existing publisher URLs are merged into one GET and promoted to priority;
 // distinct replacement feeds are fetched ahead of rotating global feeds.
 for(const s of backups.registry)add(s,true);
 const hot50PriorityWithBackups=hotUrls.size;
 for(const s of raw)add(s,false);
 // Geopolitics only: prefer existing source IDs for already registered URLs,
 // so a priority promotion cannot invalidate native-origin dedupe identities.
 // Sources that remain 403/denied stay failed; these are independent alternate
 // publishers, not a transport bypass or a verified same-event confirmation.
 const geoContinuity=geopoliticsContinuitySources();
 let geopoliticsNewDirectUrls=0;
 for(const s of geoContinuity){
   const old=merged.get(s.url);
   if(old){
     merged.set(s.url,safeDirect({...old,
       categories:[...new Set([...old.categories,"geopolitics"])],
       private_geopolitics_continuity:true}));
     hotUrls.add(s.url);
   }else{
     add(s,true);geopoliticsNewDirectUrls++;
   }
 }

 // Preserve original registry identity and one GET per distinct official URL.
 // Alternate publishers do not turn upstream denials into HTTP success.
 const macroMineralsContinuity=macroMineralsContinuitySources();
 let macroMineralsNewDirectUrls=0;
 for(const s of macroMineralsContinuity){
   const old=merged.get(s.url);
   if(old){
     merged.set(s.url,safeDirect({...old,
       categories:[...new Set([...old.categories,...s.categories])],
       private_macro_minerals_continuity:true}));
     hotUrls.add(s.url);
   }else{
     add(s,true);macroMineralsNewDirectUrls++;
   }
 }

 const backed=new Set([...merged.values()].flatMap(source=>
  source.backup_for_retired_ids??[]));
 if(backed.size!==14||
    backups.summary.backed_retired_source_ids.some(id=>!backed.has(id)))
  throw Error("THREE_DOMAIN_20M_HOT50_BACKUP_COVERAGE_DRIFT");
 if(hotUrls.size<1||hotUrls.size>requestCeiling)throw Error("THREE_DOMAIN_20M_HOT_PIN_OVERCAP");
 const priority=[...merged.values()].filter(s=>hotUrls.has(s.url));
 const other=[...merged.values()].filter(s=>!hotUrls.has(s.url));
 const budget=requestCeiling-priority.length;
 const slot=Math.floor(now.getTime()/INTERVAL);
 // Round-robin over time, not source country inferred from publisher.
 const offset=other.length?(slot*Math.max(1,budget))%other.length:0;
 const rotating=other.length<=budget?other:
  [...other.slice(offset),...other.slice(0,offset)].slice(0,budget);
 const registry=Object.freeze([...priority,...rotating]);
 if(registry.length>MAX_DIRECT||new Set(registry.map(s=>s.url)).size!==registry.length||
    CATS.some(c=>!registry.some(s=>s.categories.includes(c))))
  throw Error("THREE_DOMAIN_20M_REAL_SOURCE_SCOPE_INVALID");
 return Object.freeze({registry,summary:Object.freeze({
  publisher_feed_candidates_configured:merged.size,
  hot50_distinct_direct_feeds_pinned:oldPinnedCount,
  hot50_priority_direct_feeds_including_backups:hot50PriorityWithBackups,
  all_priority_direct_feeds:priority.length,
  geopolitics_continuity_sources_pinned:geoContinuity.length,
  geopolitics_new_direct_urls:geopoliticsNewDirectUrls,
  macro_minerals_continuity_sources_pinned:macroMineralsContinuity.length,
  macro_minerals_new_direct_urls:macroMineralsNewDirectUrls,
  macro_minerals_continuity_transport_verified_by_registration:false,
  geopolitics_continuity_transport_verified_by_registration:false,
  hot50_retired_backup_mapping_count:backed.size,
  hot50_retired_backup_unique_urls_pinned:backups.registry.length,
  hot50_retired_backup_unique_urls_in_current_tick:priority.filter(s=>
   (s.backup_for_retired_ids??[]).length>0).length,
  hot50_retired_backup_live_healthy_not_inferred:true,
  hot50_retired_transport_reprobes_this_tick:priority.filter(s=>
   s.private_hot50_retired_reprobe===true).length,
  hot50_retired_reprobe_does_not_prove_http_success:true,
  other_direct_feeds_configured:other.length,
  other_direct_feeds_deferred_this_tick:Math.max(0,other.length-rotating.length),
  checked_feed_urls_this_tick:registry.length,
  reserved_bounded_transient_retries:GLOBAL_DIRECT_20M_MAX_REQUESTS-requestCeiling,
  native_publication_time_required:true,
  categories_configured:Object.freeze([...CATS]),
  country_universe_for_title_matching:195,
  publisher_country_not_event_country:true,
  google_index_urls_polled:0,telegram_messages_polled:0,
  paid_credentials_used:0,
  provider_rights_or_event_verified_by_registration:false,
  guaranteed_20m_delivery_sla:false,
  all_eligible_items_d1_inserted_by_registration:false,
  all_eligible_items_b2_durable_by_registration:false,
 })});
}
