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

// Read-only daily WDI gap recovery: split a large 2025-missing-only request
// into exactly ONE publisher-supported <=17-country batch per UTC day.
// The daily quota permits <=5 source GETs (2 initial + 1 gap + 2 minerals).
// Never infer a missing 2025 cell from a historical observation.
export function planWdiMissingCountryBatches(codes,source,now=new Date()){
 const canonical=canonical195(source);
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("WDI_BACKFILL_CLOCK_INVALID");
 if(!Array.isArray(codes)||codes.length<1||codes.length>195||
    new Set(codes).size!==codes.length||
    codes.some(x=>typeof x!=="string"||!canonical.has(x)))
   throw Error("WDI_BACKFILL_TARGET_INVALID");
 const sorted=[...codes].sort();
 const slots=Math.ceil(sorted.length/17);
 // Rotate by UTC calendar day. Every missing ISO3 is reached within
 // ceil(missing/17) DAILY published slots, without repeating requests to
 // a denied/limited provider or opening a second same-day quota lane.
 const slot=Math.floor(now.getTime()/86_400_000)%slots;
 const eligible=sorted.slice(slot*17,slot*17+17);
 return Object.freeze({
   requested_missing_country_count:sorted.length,
   unprobed_country_count:sorted.length-eligible.length,
   rotation_slot:slot,rotation_slots:slots,
   batches:Object.freeze([Object.freeze(eligible)]),
   all_requested_gaps_checked:eligible.length===sorted.length,
   max_extra_source_calls:1
 });
}
export function combineWdiMissingCountryBatches(plan,observed,{failure=null}={}){
 if(!plan||!Array.isArray(plan.batches)||!Array.isArray(observed)||
    observed.length>2||observed.length>plan.batches.length||
    (failure!==null&&!/^WDI_BACKFILL_[A-Z_]+$/u.test(failure)))
   throw Error("WDI_BACKFILL_MERGE_INVALID");
 const target=plan.batches.flat(),reached=new Set();
 const indicatorIds=[...INDICATORS];
 const years=new Map(indicatorIds.map(id=>[id,new Map()]));
 for(let i=0;i<observed.length;i++){
   const report=observed[i],batch=plan.batches[i];
   if(report?.schema!=="geomacro.wdi-195-last-nonempty-reference.v1"||
      report.target_countries_count!==batch.length||
      !Array.isArray(report.indicators)||report.indicators.length!==2||
      report.request_count!==1)
     throw Error("WDI_BACKFILL_MERGE_INVALID");
   for(const row of report.indicators){
     if(!indicatorIds.includes(row.indicator)||
        !Array.isArray(row.target_country_reference_years)||
        row.target_country_reference_years.length!==batch.length)
       throw Error("WDI_BACKFILL_MERGE_INVALID");
     for(const val of row.target_country_reference_years){
       if(!batch.includes(val.iso3)||typeof val.iso3!=="string"||
          (val.reference_year!==null&&
          (!Number.isSafeInteger(val.reference_year)||val.reference_year<1960||
           val.reference_year>2100)))
         throw Error("WDI_BACKFILL_MERGE_INVALID");
       if(val.reference_year!==null)years.get(row.indicator).set(val.iso3,val.reference_year);
     }
   }
   batch.forEach(x=>reached.add(x));
 }
 const complete=observed.length===plan.batches.length&&
   plan.all_requested_gaps_checked&&failure===null;
 return {
   schema:"geomacro.wdi-195-missing-country-batched-reference.v1",
   status:complete?"OFFICIAL_HISTORICAL_PERIODS_OBSERVED":
     failure?"UNVERIFIED_OR_UNAVAILABLE":"PARTIAL_HISTORICAL_GAP_OBSERVATION",
   reason:failure,source_family:"world_bank_wdi",
   targeted_missing_countries:plan.requested_missing_country_count,
   actually_queried_missing_countries:reached.size,
   not_yet_queried_missing_countries:plan.requested_missing_country_count-reached.size,
   observed_source_requests:observed.length+(failure?1:0),
   target_country_reference_years_by_indicator:Object.fromEntries(
     indicatorIds.map(id=>[id,target.map(iso3=>({
       iso3,reference_year:years.get(id).get(iso3)??null,
       reference_is_current_observation:false
     }))])),
   raw_source_values_stored:false,
   last_nonempty_year_is_not_current_news:true,
   paid_delivery_enabled:false,verified_current_195x3_country_domain_events:false
 };
}

export async function observeWdiLastNonempty({fetchImpl=fetch,now=new Date(),registrySource,missingIso3}={}){
 const url=wdiLastNonemptyUrl(now,missingIso3,registrySource);
 const response=await fetchImpl(url,{method:"GET",redirect:"error",
  headers:{accept:"application/json"},signal:AbortSignal.timeout(25000)});
 return inspectWdiLastNonempty(await bounded(response),{now,registrySource,missingIso3});
}
