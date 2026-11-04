/**
 * Source-specific HOT-50 backup routes for the 14 retired direct feed IDs.
 * An alternate publisher is not the retired publisher, nor independent
 * confirmation of a particular event. All feeds are PRIVATE discovery only.
 * Successful future HTTP/native-date checks, not manifest entries, prove
 * reachability. URL de-duplication is performed by the production registry.
 */
import {readFileSync} from "node:fs";
import {hot50FourLaneSourceCrosswalk} from "./hot-50-four-lane-source-crosswalk.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";

const CATS=new Set(["geopolitics","macro","rare_earth"]);
const FORMATS=new Set(["rss","atom","rdf","xml","json"]);
const sourceUrlIsSafe=value=>{
 let u;try{u=new URL(value)}catch{return false}
 return u.protocol==="https:"&&u.hostname.includes(".")&&
  !u.username&&!u.password&&!u.port&&!u.hash&&
  !["localhost","news.google.com","t.me"].includes(u.hostname)&&
  !u.hostname.endsWith(".internal")&&!u.hostname.endsWith(".local")&&
  u.href.length<=2000;
};
export function hot50RetiredBackupSources(){
 const document=JSON.parse(readFileSync(new URL(
  "../../config/hot-50-retired-direct-feed-backups.v1.json",import.meta.url),"utf8"));
 if(document?.schema!=="geomacro.hot50.retired-direct-feed-backups.v1"||
    document.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    document.activation_policy!=="REGISTER_AS_DIRECT_SOURCE_WITH_REAL_RUNTIME_HEALTH_PROBE"||
    document.event_verification_inferred!==false||
    document.commercial_rights_inferred!==false||
    !Array.isArray(document.sources)||document.sources.length!==14)
  throw Error("HOT50_RETIRED_BACKUP_MANIFEST_INVALID");
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 const pinned=new Map(snapshot.countries.flatMap(country=>country.direct_news_osint_feeds
  .map(feed=>[feed.id,{...feed,publisher_country_iso3:country.country_iso3}])));
 const known=new Set(),urls=new Map(),replacements=[];
 for(const row of document.sources){
  const old=pinned.get(row?.retired_source_id);
  if(!old||!isRetiredPrivateOsintSource({id:old.id})||
     known.has(old.id)||row.publisher_country_iso3!==old.publisher_country_iso3||
     row.url===old.url||!sourceUrlIsSafe(row.url)||
     !FORMATS.has(row.type)||!Array.isArray(row.categories)||
     row.categories.length<1||row.categories.some(c=>!CATS.has(c))||
     new Set(row.categories).size!==row.categories.length||
     row.categories.join("|")!==old.categories.join("|")||
     row.transport_verified_at_registration!==false||
     row.commercial_eligible!==false||
     row.publicly_deliverable!==false||
     typeof row.description!=="string"||!row.description)
   throw Error("HOT50_RETIRED_BACKUP_UNSAFE_OR_DRIFT:"+(row?.retired_source_id??"unknown"));
  known.add(old.id);
  const fallback={
   id:"private_hot50_backup_"+old.id.slice("private_".length),
   url:row.url,type:row.type,categories:[...row.categories],
   continent:"global",publisher_country_iso3:row.publisher_country_iso3,
   supported:true,private_hot50_backup:true,private_hot50_direct_20m:true,
   private_discovery_index_only:false,publisher_native_dates_required:true,
   backup_for_retired_ids:[row.retired_source_id],
   backup_original_publisher_equivalence:false,
   transport_verified_at_registration:false,
   original_article_verified:false,rights_verified:false,
   commercial_eligible:false,publicly_deliverable:false,
  };
  const prior=urls.get(row.url);
  if(prior){
   if(prior.publisher_country_iso3!==fallback.publisher_country_iso3||
      prior.type!==fallback.type)
    throw Error("HOT50_RETIRED_BACKUP_URL_CONFLICT");
   urls.set(row.url,Object.freeze({...prior,
    categories:[...new Set([...prior.categories,...fallback.categories])],
    backup_for_retired_ids:[...prior.backup_for_retired_ids,row.retired_source_id]}));
  }else urls.set(row.url,Object.freeze(fallback));
  replacements.push(Object.freeze({
   retired_source_id:row.retired_source_id,backup_url:row.url,
   publisher_country_iso3:row.publisher_country_iso3,
   category_count:row.categories.length,
   native_time_verified_at_registration:false,
   same_publisher_as_retired:false,
   current_http_success_unverified:true,
  }));
 }
 return Object.freeze({
  registry:Object.freeze([...urls.values()]),
  replacements:Object.freeze(replacements),
  summary:Object.freeze({
   retired_feed_backup_mapping_count:replacements.length,
   direct_backup_unique_url_count:urls.size,
   backed_retired_source_ids:Object.freeze([...known]),
   backup_http_healthy_inferred:false,
   backup_native_items_inferred:false,
   backed_source_is_original_publisher_equivalence:false,
   paid_rights_claimed:false,
  }),
 });
}
