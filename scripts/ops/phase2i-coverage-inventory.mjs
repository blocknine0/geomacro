#!/usr/bin/env node
/** Phase 2I-A only. Never infer event geography, source rights or archive
 * from the source's publisher location or from an HTTP 200.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
export const CATEGORIES=["geopolitics","macro","rare_earth"];
export const STATUSES=["WORKING","NO_NEW_EVENT","SOURCE_UNAVAILABLE","UNSUPPORTED_FORMAT","RIGHTS_PENDING","QUOTA_HELD","NOT_YET_VERIFIED"];
const FAMILIES=[
 ["preflight","config/private-osint-working-sources.v1.json"],
 ["national","config/private-osint-national-gap-feeds.v1.json"],
 ["official_feed","config/private-osint-official-feed-additions.v1.json"],
 ["macro_minerals","config/private-osint-macro-minerals-additions.v1.json"],
 ["regional","config/private-osint-regional-corridor-additions.v1.json"],
 ["nonrss","config/private-osint-official-nonrss-sources.v1.json"]
];
const fail=x=>{throw Error("PHASE2I_"+x)};
const read=p=>JSON.parse(readFileSync(p,"utf8"));
export function parseCountries(ts){
 const marker="const COUNTRY_ROWS="+String.fromCharCode(96);
 const p=ts.indexOf(marker),end=ts.indexOf(String.fromCharCode(96),p+marker.length);
 if(p<0||end<0)fail("CANONICAL_MISSING");
 const countries=ts.slice(p+marker.length,end).trim().split(/\r?\n/u).map(line=>{
  const [iso3,iso2,...name]=line.split("|");
  if(!/^[A-Z]{3}$/u.test(iso3)||!/^[A-Z]{2}$/u.test(iso2)||name.length!==1||!name[0])fail("COUNTRY_INVALID");
  return {iso3,iso2,name:name[0]};
 });
 if(countries.length!==195||new Set(countries.map(x=>x.iso3)).size!==195||
    !countries.some(x=>x.iso3==="PSE")||!countries.some(x=>x.iso3==="VAT"))fail("CANONICAL_DRIFT");
 return countries;
}
function safeUrl(value){
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
  u.hostname.includes(".")&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/iu.test(u.hostname)&&
  u.href.length<=1800?u.href:null;}catch{return null;}
}
export function gatherSources(countries,catalogues){
 const known=new Set(countries.map(x=>x.iso3)),byId=new Map();
 for(const [family] of FAMILIES){
  for(const raw of catalogues[family]??[]){
   const id=raw.id,iso3=raw.publisher_country_iso3??null,url=safeUrl(raw.url);
   const cats=raw.categories,format=raw.type;
   if(!/^[a-z][a-z0-9_-]{2,100}$/u.test(id??"")||!url||
      !Array.isArray(cats)||!cats.length||cats.some(c=>!CATEGORIES.includes(c))||
      !["rss","rdf","atom","xml","html","json"].includes(format))continue;
   if(iso3&&!known.has(iso3))fail("UNKNOWN_PUBLISHER_COUNTRY");
   const s={source_id:id,publisher_country_iso3:iso3,
    country_event_attributed:false,url,format,categories:cats,origin_registry:family,
    official_primary_candidate:family==="official_feed",
    access:"PUBLIC_ENDPOINT_BOUNDED_FETCH_ONLY",retention:"ORIGINAL_PRIVATE_RIGHTS_UNVERIFIED",
    legacy_preflight_200:raw.acceptance?.http_status===200&&raw.acceptance?.feed_parsed===true,
    legacy_preflight_at:null,rights_verified:false,commercial_eligible:false,
    collector_owner:"private-global-osint-15m.yml"};
   if(byId.has(id)){if(byId.get(id).url!==url)fail("SOURCE_ID_URL_COLLISION");}
   else byId.set(id,s);
  }
 }
 for(const x of catalogues.official_countries??[]){
  const cat=String(x.category??"").toLowerCase();
  const cats=[cat==="critical_minerals"?"rare_earth":cat].filter(c=>CATEGORIES.includes(c));
  const url=safeUrl(x.base_url),id=x.source_id;
  if(!cats.length||!url||!known.has(x.country_iso3)||byId.has(id))continue;
  byId.set(id,{source_id:id,publisher_country_iso3:x.country_iso3,country_event_attributed:false,
   url,format:String(x.transport??"").toLowerCase(),categories:cats,
   origin_registry:"official_country_directory",official_primary_candidate:true,
   access:"ENDPOINT_METHOD_AND_TERMS_REVIEW",retention:"ORIGINAL_PRIVATE_RIGHTS_UNVERIFIED",
   legacy_preflight_200:false,legacy_preflight_at:null,rights_verified:false,
   commercial_eligible:false,collector_owner:"official-country-source-directory"});
 }
 return [...byId.values()].sort((a,b)=>a.source_id.localeCompare(b.source_id));
}
export function parseFeed(xml,format,now=new Date()){
 if(typeof xml!=="string"||xml.length>192*1024||/<!DOCTYPE|<!ENTITY/iu.test(xml)||
    !["rss","atom","rdf","xml"].includes(format))return {ok:false,reason:"UNSUPPORTED_FORMAT"};
 const rss=/<rss(?:\s|>)/iu.test(xml),atom=/<feed(?:\s|>)/iu.test(xml);
 const rdf=/<rdf:RDF(?:\s|>)/iu.test(xml);
 if(!rss&&!atom&&!rdf)return {ok:false,reason:"FEED_ROOT_INVALID"};
 const items=[...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/giu)].slice(0,40);
 let last=null,lastNative=null,recent=0,native=0;
 for(const item of items){
  const match=(rss||rdf?/<(?:pubDate|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/iu:
    /<published[^>]*>([\s\S]*?)<\/published>/iu).exec(item[1]);
  const raw=match?.[1]?.trim();
  if(!raw||raw.length>100)continue;
  const ms=Date.parse(raw);
  if(!Number.isFinite(ms)||ms>now.getTime()+60000||ms<Date.parse("1990-01-01"))continue;
  native++;if(!last||ms>Date.parse(last)){last=new Date(ms).toISOString();lastNative=raw;}
  if(now.getTime()-ms<=25*3600000)recent++;
 }
 return {ok:true,item_count:items.length,native_dated_items:native,
  recent_native_dated_items:recent,last_source_native_publication_at:last,
  last_source_native_publication_time:lastNative};
}
async function limitedBody(resp){
 if(Number(resp.headers.get("content-length"))>192*1024)throw Error("SIZE_LIMIT");
 const reader=resp.body?.getReader();if(!reader)throw Error("BODY_MISSING");
 let size=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>192*1024)throw Error("SIZE_LIMIT");chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const out=new Uint8Array(size);let offset=0;
 for(const c of chunks){out.set(c,offset);offset+=c.length;}
 return new TextDecoder().decode(out);
}
export async function probeSource(source,{fetchImpl=fetch,now=new Date()}={}){
 const base={source_id:source.source_id,attempted_at:now.toISOString(),status:"NOT_YET_VERIFIED",
  http_status:null,last_successful_http_fetch_at:null,
  last_source_native_publication_at:null,last_source_native_publication_time:null,
  observed_feed_items:0,recent_native_dated_items:0,
  country_event_verified:false,eligible_raw_records:null,b2_archived_records:null,
  commercial_rights_verified:false,failure_reason:null};
 if(!["rss","atom","rdf","xml"].includes(source.format))
  return {...base,status:"UNSUPPORTED_FORMAT",failure_reason:"NO_REVIEWED_SOURCE_FORMAT_PARSER"};
 try{
  const r=await fetchImpl(source.url,{method:"GET",redirect:"error",cache:"no-store",
   headers:{"Accept":"application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.8",
     "User-Agent":"GeoMacro-Phase2I-CoverageAudit/1.0 (+https://geomacro.live)"},
   signal:AbortSignal.timeout(9000)});
  if(r.status===429)return {...base,http_status:429,status:"QUOTA_HELD",failure_reason:"SOURCE_HTTP_429"};
  if(r.status!==200)return {...base,http_status:r.status,status:"SOURCE_UNAVAILABLE",
   failure_reason:r.status===401||r.status===403?"ACCESS_DENIED":"SOURCE_HTTP_NON_200"};
  const parsed=parseFeed(await limitedBody(r),source.format,now);
  if(!parsed.ok)return {...base,http_status:200,last_successful_http_fetch_at:now.toISOString(),
   status:"UNSUPPORTED_FORMAT",failure_reason:parsed.reason};
  return {...base,http_status:200,last_successful_http_fetch_at:now.toISOString(),
   status:parsed.recent_native_dated_items>0?"WORKING":"NO_NEW_EVENT",
   last_source_native_publication_at:parsed.last_source_native_publication_at,
   last_source_native_publication_time:parsed.last_source_native_publication_time,
   observed_feed_items:parsed.item_count,recent_native_dated_items:parsed.recent_native_dated_items,
   failure_reason:parsed.native_dated_items===0?"NATIVE_PUBLICATION_CLOCK_MISSING":null};
 }catch(e){return {...base,status:String(e?.message)==="SIZE_LIMIT"?"UNSUPPORTED_FORMAT":"SOURCE_UNAVAILABLE",
   failure_reason:String(e?.message)==="SIZE_LIMIT"?"BODY_OVER_192KB":"NETWORK_TLS_TIMEOUT_OR_REDIRECT"};}
}
export async function probeRotation(sources,now=new Date(),fetchImpl=fetch,max=18){
 if(max<1||max>24)fail("BOUNDED_REQUEST_CAP");
 const choices=sources.filter(s=>["rss","atom","rdf","xml"].includes(s.format));
 if(!choices.length)return [];
 const start=(Math.floor(now.getTime()/7200000)*max)%choices.length;
 const selected=Array.from({length:Math.min(max,choices.length)},(_,i)=>
  choices[(start+i)%choices.length]);
 const results=new Array(selected.length);let index=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(index<selected.length){const i=index++;results[i]=await probeSource(selected[i],{fetchImpl,now});}
 }));
 return results;
}
export function buildLedger(countries,sources,prior={},newProbes=[],now=new Date()){
 if(countries.length!==195)fail("REGISTRY_NOT_195");
 const ids=new Set(sources.map(s=>s.source_id)),latest=new Map();
 for(const p of prior.source_probes??[])if(ids.has(p.source_id))latest.set(p.source_id,p);
 for(const p of newProbes){if(!ids.has(p.source_id)||!STATUSES.includes(p.status))
  fail("UNREGISTERED_SOURCE_PROBE");latest.set(p.source_id,p);}
 const cells=[];
 for(const country of countries)for(const category of CATEGORIES){
  const matching=sources.filter(s=>s.publisher_country_iso3===country.iso3&&s.categories.includes(category));
  const proofs=matching.map(s=>latest.get(s.source_id)).filter(Boolean);
  const live=proofs.find(p=>p.status==="WORKING")??proofs.find(p=>p.status==="NO_NEW_EVENT");
  const newest=proofs.filter(p=>p.last_successful_http_fetch_at)
    .sort((a,b)=>b.last_successful_http_fetch_at.localeCompare(a.last_successful_http_fetch_at))[0];
  const dated=proofs.filter(p=>p.last_source_native_publication_at)
    .sort((a,b)=>b.last_source_native_publication_at.localeCompare(a.last_source_native_publication_at))[0];
  const status=live?.status??(proofs.find(p=>p.status==="QUOTA_HELD")?"QUOTA_HELD":
    proofs.find(p=>p.status==="UNSUPPORTED_FORMAT")?"UNSUPPORTED_FORMAT":
    proofs.find(p=>p.status==="SOURCE_UNAVAILABLE")?"SOURCE_UNAVAILABLE":"NOT_YET_VERIFIED");
  cells.push({country_iso3:country.iso3,country_iso2:country.iso2,
   country_name:country.name,category,source_status:status,
   registered_source_ids:matching.map(s=>s.source_id),
   official_primary_source_ids:matching.filter(s=>s.official_primary_candidate).map(s=>s.source_id),
   supporting_source_ids:matching.filter(s=>!s.official_primary_candidate).map(s=>s.source_id),
   same_event_independent_source_verified:false,endpoint_formats:[...new Set(matching.map(s=>s.format))],
   last_actual_successful_http_fetch_at:newest?.last_successful_http_fetch_at??null,
   last_source_native_publication_time:dated?.last_source_native_publication_time??null,
   last_source_native_publication_at:dated?.last_source_native_publication_at??null,
   actual_country_attributed_news_candidates:null,eligible_raw_records:null,
   b2_archived_raw_records:null,commercially_distributable_derived_records:null,
   publisher_country_does_not_prove_event_country:true,country_event_verified:false,
   access_restrictions:"PER_SOURCE_ACCESS_REVIEW",retention_restrictions:"PRIVATE_ONLY_UNTIL_RIGHTS_VERIFIED",
   rights_status:"RIGHTS_PENDING",workflow_owner:"private-global-osint-15m.yml",
   failure_reason:status==="NOT_YET_VERIFIED"?
    (matching.length?"NO_LIVE_PROBE_YET":"NO_LOCAL_REGISTERED_SOURCE"):
    status==="WORKING"?"COUNTRY_EVENT_NOT_INDEPENDENTLY_ATTRIBUTED":
    proofs.find(p=>p.failure_reason)?.failure_reason??"NO_CURRENT_NATIVE_DATED_EVENT"});
 }
 if(cells.length!==585||new Set(cells.map(x=>x.country_iso3+":"+x.category)).size!==585)
  fail("585_CELLS_NOT_UNIQUE");
 const perCategory=Object.fromEntries(CATEGORIES.map(cat=>{const c=cells.filter(x=>x.category===cat);
  return [cat,{cells:195,registered_local_source_cells:c.filter(x=>x.registered_source_ids.length>0).length,
    no_local_source_cells:c.filter(x=>x.registered_source_ids.length===0).length,
    live_fetched_local_source_cells:c.filter(x=>["WORKING","NO_NEW_EVENT"].includes(x.source_status)).length,
    verified_country_events:0,commercially_eligible_country_events:0}]}));
 return {schema:"geomacro.phase2i.195x3-source-coverage.v1",
  generated_at:now.toISOString(),canonical_registry:"src/lib/canonical-country-registry-195.ts",
  country_count:195,category_count:3,cell_count:585,registered_source_count:sources.length,
  verified_http_source_count:[...latest.values()].filter(p=>p.http_status===200).length,
  actual_source_requests_this_run:newProbes.length,
  status_counts:Object.fromEntries(STATUSES.map(x=>[x,cells.filter(c=>c.source_status===x).length])),
  per_category:perCategory,source_registry:sources,source_probes:[...latest.values()].sort((a,b)=>a.source_id.localeCompare(b.source_id)),
  global_fallback_candidates_not_country_verified:{
   geopolitics:["un_security_council","gdelt_v2"],macro:["world_bank_wdi","imf_data"],
   rare_earth:["usgs_mcs","un_comtrade"]},
  language_translation_required:false,source_clock_not_retrieval_clock:true,
  publisher_location_not_event_location:true,commercial_rights_not_inferred:true,
  complete_live_585_country_event_coverage_verified:false,cells};
}
export function loadCatalogues(){
 const c={};for(const [name,path] of FAMILIES)c[name]=read(path).sources;
 c.official_countries=read("global-intelligence/sources/official-country-endpoints.v1.json").entries;
 return c;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const now=new Date(),countries=parseCountries(readFileSync("src/lib/canonical-country-registry-195.ts","utf8"));
  const sources=gatherSources(countries,loadCatalogues());
  let previous={};try{previous=read("artifacts/phase2i/previous-coverage-585.json")}catch{}
  const probes=process.argv.includes("--probe")?await probeRotation(sources,now):[];
  const result=buildLedger(countries,sources,previous,probes,now);
  mkdirSync("artifacts/phase2i",{recursive:true,mode:0o700});
  writeFileSync("artifacts/phase2i/coverage-585.latest.json",JSON.stringify(result,null,2)+"\n",{mode:0o600});
  const summary={schema:result.schema,country_count:195,cell_count:585,
   registered_sources:result.registered_source_count,new_http_requests:probes.length,
   statuses:result.status_counts,by_category:result.per_category};
  writeFileSync("artifacts/phase2i/summary.json",JSON.stringify(summary,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(summary));
 }catch(e){console.error("::error::PHASE2I_INVENTORY_NOT_ACCEPTED:"+String(e?.message??"UNKNOWN").replace(/[^A-Z0-9_]/gu,"").slice(0,64));process.exitCode=2;}
}
