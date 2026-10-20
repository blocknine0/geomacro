// Official WDI last non-empty annual statistical reference for countries
// absent from a single year. Never treat historical values as current data.
import {readFileSync} from "node:fs";
const BASE="https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG";
const INDICATORS=Object.freeze(["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"]);
const BODY_LIMIT=512*1024;
function canonical195(source=readFileSync("src/lib/canonical-country-registry-195.ts","utf8")){
 const rows=/const COUNTRY_ROWS=\x60([^\x60]{1,10000})\x60;/u.exec(source)?.[1]?.trim().split("\n");
 if(!rows||rows.length!==195)throw Error("WDI_BACKFILL_REGISTRY_INVALID");
 const codes=new Set(rows.map(x=>x.split("|")[0]));
 if(codes.size!==195||!codes.has("VAT")||!codes.has("PSE")||
    [...codes].some(x=>!/^[A-Z]{3}$/u.test(x)))
   throw Error("WDI_BACKFILL_REGISTRY_INVALID");
 return codes;
}
function targetIso3(codes,source){
 const canonical=canonical195(source);
 if(!Array.isArray(codes)||codes.length===0||codes.length>50)
   throw Error("WDI_BACKFILL_TARGET_INVALID");
 const distinct=[...new Set(codes)];
 if(distinct.length!==codes.length||distinct.some(x=>typeof x!=="string"||!canonical.has(x)))
   throw Error("WDI_BACKFILL_TARGET_INVALID");
 return distinct.sort();
}
export function wdiLastNonemptyUrl(now=new Date(),missingIso3,registrySource){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("WDI_BACKFILL_CLOCK_INVALID");
 const targets=targetIso3(missingIso3,registrySource);
 const url=new URL(BASE.replace("/country/all/","/country/"+targets.join(";")+"/"));
 url.searchParams.set("source","2");
 url.searchParams.set("format","json");
 url.searchParams.set("mrnev","1");
 url.searchParams.set("per_page","120");
 url.searchParams.set("page","1");
 return url.href;
}
export function inspectWdiLastNonempty(data,{now=new Date(),registrySource,missingIso3}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("WDI_BACKFILL_CLOCK_INVALID");
 const targets=targetIso3(missingIso3,registrySource);
 const allowed=new Set(targets);
 if(!Array.isArray(data)||data.length!==2||
    !data[0]||Number(data[0].page)!==1||Number(data[0].pages)!==1||
    !Array.isArray(data[1])||data[1].length>120||
    Number(data[0].total)!==data[1].length)
   throw Error("WDI_BACKFILL_PAGINATION_UNVERIFIED");
 const floor=now.getUTCFullYear()-1;
 const periods=new Map(INDICATORS.map(id=>[id,new Map()]));
 let excluded=0;
 for(const row of data[1]){
  const iso=row?.countryiso3code,id=row?.indicator?.id;
  if(!allowed.has(iso)||!periods.has(id)){excluded++;continue;}
  const year=Number(row?.date);
  if(typeof row?.date!=="string"||!/^(?:19|20)\d{2}$/u.test(row.date)||
     year>floor||year<1960||
     typeof row.value!=="number"||!Number.isFinite(row.value)){
   excluded++;continue;
  }
  const seen=periods.get(id),previous=seen.get(iso);
  if(previous===undefined||year>previous)seen.set(iso,year);
 }
 const lines=INDICATORS.map(indicator=>{
  const years=periods.get(indicator);
  const inTen=[...years].filter(([,y])=>floor-y<=10).length;
  const inFive=[...years].filter(([,y])=>floor-y<=5).length;
  return {
   indicator,last_completed_calendar_year:floor,
   targeted_missing_2025_country_count:targets.length,
   target_countries_with_any_historical_reference:years.size,
   target_countries_with_reference_in_last_5_years:inFive,
   target_countries_with_reference_in_last_10_years:inTen,
   target_countries_without_any_reference:targets.length-years.size,
   target_country_reference_years:targets.map(iso3=>({
    iso3,reference_year:years.get(iso3)??null,
    reference_is_current_observation:false,
    publication_datetime_verified:false
   }))
  };
 });
 return {schema:"geomacro.wdi-195-last-nonempty-reference.v1",
  checked_at:now.toISOString(),source_family:"world_bank_wdi",
  canonical_195_country_registry_verified:true,
  query_target_is_only_2025_missing_countries:true,
  target_countries_count:targets.length,
  indicator_count:2,request_count:1,
  excluded_aggregates_and_bad_rows:excluded,indicators:lines,
  annual_reference_not_live_fx_or_news:true,
  source_publication_datetime_verified:false,
  verified_current_195x3_country_domain_events:false,
  historical_data_present_is_not_current:true,
  raw_source_values_stored:false,paid_delivery_enabled:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0};
}
async function bounded(response){
 if([401,403,429].includes(response.status))throw Error("WDI_BACKFILL_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("WDI_BACKFILL_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>BODY_LIMIT)throw Error("WDI_BACKFILL_BODY_LIMIT");
 if(!response.body)throw Error("WDI_BACKFILL_BODY_EMPTY");
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
  bytes+=value.byteLength;
  if(bytes>BODY_LIMIT)throw Error("WDI_BACKFILL_BODY_LIMIT");
  chunks.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 const b=new Uint8Array(bytes);let n=0;
 for(const x of chunks){b.set(x,n);n+=x.byteLength}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(b))}
 catch{throw Error("WDI_BACKFILL_JSON_INVALID")}
}
export async function observeWdiLastNonempty({fetchImpl=fetch,now=new Date(),registrySource,missingIso3}={}){
 const url=wdiLastNonemptyUrl(now,missingIso3,registrySource);
 const response=await fetchImpl(url,{method:"GET",redirect:"error",
  headers:{accept:"application/json"},signal:AbortSignal.timeout(25000)});
 return inspectWdiLastNonempty(await bounded(response),{now,registrySource,missingIso3});
}
