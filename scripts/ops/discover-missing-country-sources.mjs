#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {buildCountrySourceGapReport} from "../lib/country-source-gap-finder.mjs";
import {parseCountries,gatherSources,loadCatalogues,probeSource} from "./phase2i-coverage-inventory.mjs";
import {HOT50_COUNTRY_ISO3} from "../lib/hot-50-country-watch.mjs";
const fail=code=>{throw Error("COUNTRY_SOURCE_DISCOVERY_"+code)};
const readJson=path=>JSON.parse(readFileSync(path,"utf8"));
function parseArgs(argv){
 const out={probe:false,probeLimit:18,now:new Date()};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==="--probe")out.probe=true;
  else if(arg==="--probe-limit"){const n=Number(argv[++i]);if(!Number.isInteger(n)||n<1||n>24)fail("PROBE_LIMIT_INVALID");out.probeLimit=n;}
  else if(arg==="--risk-stream-sources"){out.riskSources=argv[++i];if(!out.riskSources)fail("RISK_SNAPSHOT_REQUIRED");}
  else if(arg==="--previous"){out.previous=argv[++i];if(!out.previous)fail("PREVIOUS_PATH_REQUIRED");}
  else if(arg==="--out"){out.output=argv[++i];if(!out.output)fail("OUTPUT_PATH_REQUIRED");}
  else fail("ARGUMENTS_INVALID");
 }
 if(!out.riskSources||!out.output)fail("RISK_SNAPSHOT_AND_OUTPUT_REQUIRED");
 return out;
}

export function parseJsonFeed(body,now){
 let data;try{data=JSON.parse(body)}catch{return {ok:false,reason:"JSON_INVALID"}}
 const items=data?.items;
 if(!["https://jsonfeed.org/version/1","https://jsonfeed.org/version/1.1"].includes(data?.version))
  return {ok:false,reason:"JSON_FEED_VERSION_INVALID"};
 if(!Array.isArray(items)||items.length>1000)return {ok:false,reason:"JSON_FEED_ITEMS_INVALID"};
 let native=0,recent=0,last=null;
 for(const item of items.slice(0,100)){
  const raw=item?.date_published??item?.published??item?.date_modified;
  if(typeof raw!=="string"||raw.length>64||!/(?:Z|[+-]\d{2}:?\d{2})$/iu.test(raw))continue;
  const ms=Date.parse(raw);
  if(!Number.isFinite(ms)||ms>now.getTime()+60000||ms<Date.parse("1990-01-01T00:00:00Z"))continue;
  native++;if(now.getTime()-ms<=25*3600000)recent++;
  if(!last||ms>Date.parse(last))last=new Date(ms).toISOString();
 }
 return {ok:true,item_count:items.length,native_dated_items:native,
  recent_native_dated_items:recent,last_source_native_publication_at:last};
}
async function probeJsonSource(source,{fetchImpl=fetch,now=new Date()}={}){
 const base={source_id:source.source_id,attempted_at:now.toISOString(),status:"NOT_YET_VERIFIED",
  http_status:null,last_successful_http_fetch_at:null,last_source_native_publication_at:null,
  last_source_native_publication_time:null,observed_feed_items:0,recent_native_dated_items:0,
  country_event_verified:false,eligible_raw_records:null,b2_archived_records:null,
  commercial_rights_verified:false,failure_reason:null};
 try{
  const response=await fetchImpl(source.url,{method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/feed+json,application/json;q=0.9",
    "User-Agent":"GeoMacro-Country-Source-Gap-Audit/1.0 (+https://geomacro.live)"},
   signal:AbortSignal.timeout(9000)});
  if(response.status!==200)return {...base,http_status:response.status,
   status:response.status===429?"QUOTA_HELD":"SOURCE_UNAVAILABLE",
   failure_reason:response.status===429?"SOURCE_HTTP_429":"SOURCE_HTTP_NON_200"};
  const contentType=String(response.headers.get("content-type")??"").toLowerCase();
  if(!contentType.includes("json"))return {...base,http_status:200,status:"UNSUPPORTED_FORMAT",
   failure_reason:"JSON_CONTENT_TYPE_REQUIRED"};
  const reader=response.body?.getReader();if(!reader)return {...base,http_status:200,
   status:"UNSUPPORTED_FORMAT",failure_reason:"BODY_MISSING"};
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>192*1024)throw Error("SIZE_LIMIT");chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const parsed=parseJsonFeed(new TextDecoder().decode(bytes),now);
  if(!parsed.ok)return {...base,http_status:200,status:"UNSUPPORTED_FORMAT",failure_reason:parsed.reason};
  return {...base,http_status:200,last_successful_http_fetch_at:now.toISOString(),
   status:parsed.recent_native_dated_items?"WORKING":"NO_NEW_EVENT",
   last_source_native_publication_at:parsed.last_source_native_publication_at,
   observed_feed_items:parsed.item_count,recent_native_dated_items:parsed.recent_native_dated_items,
   failure_reason:parsed.native_dated_items===0?"NATIVE_PUBLICATION_CLOCK_MISSING":null};
 }catch(error){return {...base,status:"SOURCE_UNAVAILABLE",
  failure_reason:String(error?.message)==="SIZE_LIMIT"?"BODY_OVER_192KB":"NETWORK_TLS_TIMEOUT_OR_REDIRECT"};}
}
async function probeCandidateRotation(sources,now,fetchImpl,max,previousProbes=[],hot50=[]){
 if(!Number.isInteger(max)||max<1||max>24)fail("PROBE_LIMIT_INVALID");
 const supported=sources.filter(s=>s.format==="json"||["rss","atom","rdf","xml"].includes(s.format));
 const prior=new Map(previousProbes.filter(p=>p&&typeof p.source_id==="string").map(p=>[p.source_id,p]));
 const hot=new Set(hot50);
 supported.sort((a,b)=>{
  const aHot=hot.has(a.publisher_country_iso3)?0:1,bHot=hot.has(b.publisher_country_iso3)?0:1;
  if(aHot!==bHot)return aHot-bHot;
  const at=Date.parse(prior.get(a.source_id)?.attempted_at??"");
  const bt=Date.parse(prior.get(b.source_id)?.attempted_at??"");
  const ageA=Number.isFinite(at)?at:Number.NEGATIVE_INFINITY;
  const ageB=Number.isFinite(bt)?bt:Number.NEGATIVE_INFINITY;
  return ageA-ageB||a.source_id.localeCompare(b.source_id);
 });
 const selected=supported.slice(0,max),results=new Array(selected.length);let index=0;
 await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{
  while(index<selected.length){
   const i=index++,source=selected[i];
   results[i]=source.format==="json"?
    await probeJsonSource(source,{fetchImpl,now}):
    await probeSource(source,{fetchImpl,now});
  }
 }));
 return results;
}

export async function discoverMissingCountrySources({riskStreamSources,previousProbes=[],probe=false,
 probeLimit=18,now=new Date(),catalogues=loadCatalogues(),countries=parseCountries(
  readFileSync("src/lib/canonical-country-registry-195.ts","utf8")),
 hot50=HOT50_COUNTRY_ISO3,rightsEntries=readJson("config/risk-stream-source-rights-reviewed.v1.json").entries,
 fetchImpl=fetch}={}){
 if(!Array.isArray(riskStreamSources))fail("RISK_ROWS_INVALID");
 const sources=gatherSources(countries,catalogues);
 const allProbes=new Map((previousProbes??[]).filter(p=>p&&typeof p.source_id==="string")
  .map(p=>[p.source_id,p]));
 const probes=probe?await probeCandidateRotation(sources,now,fetchImpl,probeLimit,
  [...allProbes.values()],hot50):[];
 for(const p of probes)allProbes.set(p.source_id,p);
 return {report:buildCountrySourceGapReport({countries,hot50,sourceCatalog:sources,
  riskStreamSources,probes:[...allProbes.values()],rightsEntries,now:now.getTime()}),
  probes,all_probes:[...allProbes.values()],source_catalog_count:sources.length,
  private_osint_probe_count:probes.length};
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 const risk=readJson(args.riskSources);
 const rows=Array.isArray(risk)?risk:risk.results??risk.result?.results;
 if(!Array.isArray(rows))fail("RISK_SNAPSHOT_SHAPE_INVALID");
 let previous={};if(args.previous)try{previous=readJson(args.previous)}catch{}
 const result=await discoverMissingCountrySources({riskStreamSources:rows,
  previousProbes:previous.probes??previous.probes_this_run??previous.source_probes??[],probe:args.probe,
  probeLimit:args.probeLimit,now:new Date()});
 mkdirSync(resolve(args.output,".."),{recursive:true,mode:0o700});
 writeFileSync(args.output,JSON.stringify({...result.report,
  source_catalog_count:result.source_catalog_count,
  probes:result.all_probes,probes_this_run:result.probes,
  private_osint_probe_count:result.private_osint_probe_count},null,2)+"\n",{mode:0o600});
 process.stdout.write(JSON.stringify({schema:result.report.schema,
  cells:result.report.cell_count,gaps:result.report.gap_count,
  hot50_gaps:result.report.hot50_gap_count,
  catalog_sources:result.source_catalog_count,
  probes:result.private_osint_probe_count,
  commercially_approved_candidates:result.report.cells.flatMap(c=>c.candidate_sources)
   .filter(x=>x.commercial_rights_approved===1).length})+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await main()}catch(error){
  process.stderr.write(String(error?.message??"COUNTRY_SOURCE_DISCOVERY_FAILED").slice(0,220)+"\n");
  process.exitCode=2;
 }
}
