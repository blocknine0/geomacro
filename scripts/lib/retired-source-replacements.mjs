import {readFileSync} from "node:fs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";

const CATS=new Set(["geopolitics","macro","rare_earth"]);
const host=url=>new URL(url).hostname.replace(/^www\./u,"");
const samePublisher=(a,b)=>host(a)===host(b)||
 (host(a)==="en.antaranews.com"&&host(b)==="antaranews.com");
export function retiredSourceReplacements(doc=JSON.parse(readFileSync(new URL("../../config/retired-source-replacements.v1.json",import.meta.url),"utf8"))){
 if(doc.schema!=="geomacro.retired-source-replacements.v1"||doc.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(doc.retired)||!Array.isArray(doc.replacements))
  throw Error("SOURCE_REPLACEMENT_MANIFEST_INVALID");
 const retired=new Map(doc.retired.map(x=>[x.id,x]));
 const urls=new Set(),ids=new Set();
 return Object.freeze(doc.replacements.map(row=>{
  const old=retired.get(row.retired_source_id);
  let url;try{url=new URL(row.url)}catch{throw Error("SOURCE_REPLACEMENT_URL_INVALID")}
  if(!old?.url||!/^private_replacement_[a-f0-9]{20}$/u.test(row.id)||ids.has(row.id)||urls.has(row.url)||
     url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !samePublisher(row.url,old.url)||row.url===old.url||isRetiredPrivateOsintSource(row)||
     !Array.isArray(row.categories)||!row.categories.length||row.categories.some(c=>!CATS.has(c))||
     row.type!=="rss"||!Number.isSafeInteger(row.native_72h_items_at_probe)||row.native_72h_items_at_probe<1||
     !Number.isFinite(Date.parse(row.checked_at))||row.full_duplicate_news_coverage_verified!==false||
     !Array.isArray(row.same_article_url_hashes)||row.same_article_url_hashes.some(h=>! /^[a-f0-9]{64}$/u.test(h))||
     (row.activation_state!==undefined&&row.activation_state!=="disabled_pending_live_verification")||
     (row.activation_state==="disabled_pending_live_verification"&&
       !/^LIVE_PROBE_FAILURE_[A-Z0-9_]+$/u.test(row.disabled_reason_code??"")))
   throw Error("SOURCE_REPLACEMENT_UNVERIFIED_OR_SCOPE_INVALID:"+row.retired_source_id);
  ids.add(row.id);urls.add(row.url);
  if(row.activation_state==="disabled_pending_live_verification")return null;
  return Object.freeze({id:row.id,url:row.url,type:row.type,categories:Object.freeze([...row.categories]),
   continent:row.continent??"global",publisher_country_iso3:row.publisher_country_iso3??null,
   supported:true,replaces_retired_source_ids:Object.freeze([row.retired_source_id]),
   same_publisher_replacement:true,
   // Overlap is a historical exact-article URL sample, never an all-news SLA.
   sampled_identical_article_urls:row.same_article_url_hashes.length,
   full_duplicate_news_coverage_verified:false,
   publisher_native_dates_required:true,private_discovery_index_only:false,
   transport_verified_at_registration:false,original_article_verified:false,
   rights_verified:false,commercial_eligible:false,publicly_deliverable:false});
 }).filter(Boolean));
}

export function applyRetiredSourceReplacements(sources){
 const map=new Map();
 for(const source of [...sources.filter(s=>!isRetiredPrivateOsintSource(s)),...retiredSourceReplacements()]){
  const old=map.get(source.url);
  map.set(source.url,old?{...old,categories:[...new Set([...old.categories,...source.categories])],
   replaces_retired_source_ids:[...new Set([...(old.replaces_retired_source_ids??[]),...(source.replaces_retired_source_ids??[])])]}:source);
 }
 return [...map.values()];
}
