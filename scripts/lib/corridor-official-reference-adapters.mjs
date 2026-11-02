/**
 * Corridor-only official statistical / live-index adapters.
 * These are data/reference observations, NOT source articles, verified
 * geopolitical events, corridor disruptions, or sellable risk signals.
 * All endpoints pinned, bounded, no arbitrary redirects, no raw persistence.
 */
import {createHash} from "node:crypto";
import {observePortwatchDaily} from "./imf-portwatch-daily-corridors.mjs";
export const OFFICIAL_CORRIDOR_ADAPTER_IDS=Object.freeze([
 "gdelt_v2_15m","world_bank_wdi","ecb_data","eurostat_data","imf_portwatch"
]);
const MAX_BYTES=192*1024;
const API=Object.freeze({
 gdelt_v2_15m:"https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
 world_bank_wdi:"https://api.worldbank.org/v2/country/us;cn;in;de;gb/indicator/NY.GDP.MKTP.KD.ZG?format=json&date=2023:2026&per_page=50",
 ecb_data:"https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&lastNObservations=2",
 eurostat_data:"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=EA20&coicop=CP00&sinceTimePeriod=2026-01&lang=EN"
});
const isDue=(id,now)=>id==="gdelt_v2_15m"||
 (id==="imf_portwatch"?[0,12].includes(now.getUTCHours())&&now.getUTCMinutes()<30:
 [0,6,12,18].includes(now.getUTCHours())&&now.getUTCMinutes()<30);
const idHash=(parts)=>createHash("sha256").update(parts.join("\x1f")).digest("hex");
function candidate(source_id,metric_id,period,value,now,extra={}){
 if(typeof metric_id!=="string"||!/^[a-z0-9_.-]{3,70}$/u.test(metric_id)||
    typeof period!=="string"||period.length>32||
    !(value===null||typeof value==="number"&&Number.isFinite(value)))
   throw Error("CORRIDOR_OFFICIAL_OBSERVATION_INVALID");
 const observed_at=now.toISOString();
 return {id:idHash([source_id,metric_id,period,String(value)]),source_id,
  metric_id,observation_period:period,numeric_value:value,
  observed_at,source_native_publication_at:null,
  source_observation_is_not_live_event:true,
  corridor_ids:extra.corridor_ids??[],
  context_only:true,independently_verified_event:false,
  commercial_rights_verified:false,customer_delivery_enabled:false};
}
async function getBounded(url,fetchImpl,accept){
 let response;
 try{response=await fetchImpl(url,{method:"GET",redirect:"error",
  headers:{accept},signal:AbortSignal.timeout(9000)})}
 catch{return {state:"NETWORK_UNAVAILABLE",body:null}}
 if([401,403,429].includes(response.status))return {state:"DENIED_NO_RETRY",body:null};
 if(response.status!==200||(response.url&&response.url!==url))
   return {state:"HTTP_UNAVAILABLE",body:null};
 if(Number(response.headers?.get?.("content-length")??0)>MAX_BYTES||!response.body)
   return {state:"SOURCE_BODY_UNAVAILABLE",body:null};
 const reader=response.body.getReader(),chunks=[];let total=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;
    if(total>MAX_BYTES)return {state:"SOURCE_BODY_OVERSIZED",body:null};
    chunks.push(value);
  }
 }catch{return {state:"SOURCE_READ_FAILED",body:null}}
 finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 try{
  const bytes=new Uint8Array(total);let off=0;
  for(const c of chunks){bytes.set(c,off);off+=c.byteLength}
  return {state:"FETCHED",body:new TextDecoder("utf-8",{fatal:true}).decode(bytes)};
 }catch{return {state:"INVALID_UTF8",body:null}}
}
function parseGdelt(body,now){
 const matches=body.trim().split(/\r?\n/gu).slice(0,6).map(line=>
  /^(\d{3,12})\s+(https?:\/\/data\.gdeltproject\.org\/gdeltv2\/(\d{14})\.(export|gkg|mentions)\.CSV\.zip)$/iu.exec(line.trim())).filter(Boolean);
 const records=[];
 for(const m of matches){
  const stamp=m[3],published=new Date(Date.UTC(Number(stamp.slice(0,4)),
   Number(stamp.slice(4,6))-1,Number(stamp.slice(6,8)),Number(stamp.slice(8,10)),
   Number(stamp.slice(10,12)),Number(stamp.slice(12,14))));
  if(!Number.isFinite(published.getTime())||published.toISOString().replace(/[-:TZ.]/gu,"").slice(0,14)!==stamp||
     published.getTime()>now.getTime()+300000||now.getTime()-published.getTime()>72*3600000)
    continue;
  const bytes=Number(m[1]);if(!Number.isSafeInteger(bytes)||bytes<100)continue;
  records.push(candidate("gdelt_v2_15m","gdelt_"+m[4].toLowerCase()+"_batch_bytes",
   published.toISOString(),bytes,now));
 }
 return records;
}
function parseWorldBank(body,now){
 let data;try{data=JSON.parse(body)}catch{throw Error("WDI_JSON_INVALID")}
 if(!Array.isArray(data)||!Array.isArray(data[1])||data[1].length>70)
   throw Error("WDI_SCHEMA_INVALID");
 const valid=new Set(["US","CN","IN","DE","GB"]);
 return data[1].flatMap(row=>{
  if(!valid.has(row?.country?.id)||row?.indicator?.id!=="NY.GDP.MKTP.KD.ZG"||
    !/^20(?:2[3-6])$/u.test(row.date??"")||
    typeof row.value!=="number"||!Number.isFinite(row.value)||
    Math.abs(row.value)>200)return [];
  return [candidate("world_bank_wdi","wdi_gdp_growth_"+row.country.id.toLowerCase(),
    row.date,row.value,now)];
 }).slice(0,25);
}
function parseEcb(body,now){
 const lines=body.trim().split(/\r?\n/gu);
 if(lines.length<2||lines.length>20)throw Error("ECB_CSV_UNEXPECTED");
 const heads=lines[0].split(",").map(x=>x.replace(/"/gu,"").trim().toUpperCase());
 const time=heads.indexOf("TIME_PERIOD"),value=heads.indexOf("OBS_VALUE");
 if(time<0||value<0)throw Error("ECB_CSV_SCHEMA_INVALID");
 return lines.slice(1).flatMap(line=>{
  // No implicit parsing of quoted comma fields; reject instead of shifting columns.
  if(/"/u.test(line))return [];
  const cells=line.split(",");
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(cells[time]??"")||
     !/^\d{1,4}(?:\.\d{1,7})?$/u.test(cells[value]??""))return [];
  const rate=Number(cells[value]);
  if(rate<=0||rate>1000)return [];
  return [candidate("ecb_data","ecb_usd_eur_spot",cells[time],rate,now)];
 }).slice(-2);
}
function parseEurostat(body,now){
 let obj;try{obj=JSON.parse(body)}catch{throw Error("EUROSTAT_JSON_INVALID")}
 const dimensions=obj?.id;
 if(!Array.isArray(dimensions)||!dimensions.includes("time")||
   !obj?.dimension?.time?.category?.index||!obj?.value||
   typeof obj.value!=="object"||Array.isArray(obj.value))
  throw Error("EUROSTAT_SCHEMA_INVALID");
 const time=obj.dimension.time.category.index;
 const entries=Object.entries(time).filter(([k,v])=>
   /^\d{4}-\d{2}$/u.test(k)&&Number.isInteger(v)&&v>=0);
 if(!entries.length||entries.length>80)throw Error("EUROSTAT_PERIOD_INVALID");
 const timeIndex=dimensions.indexOf("time");
 const size=obj.size;
 if(!Array.isArray(size)||size.length!==dimensions.length||
   size.some(x=>!Number.isInteger(x)||x<1||x>100)||size.reduce((n,x)=>n*x,1)>150)
  throw Error("EUROSTAT_DIMENSIONS_TOO_LARGE");
 // Query must resolve all non-time dimensions to exactly one point.
 if(size.some((x,i)=>i!==timeIndex&&x!==1))
  throw Error("EUROSTAT_NOT_SINGLE_SERIES");
 const records=[];
 for(const [period,index] of entries){
  const p=size.slice(timeIndex+1).reduce((n,x)=>n*x,1);
  const pos=index*p,v=obj.value[String(pos)];
  if(typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<500)
    records.push(candidate("eurostat_data","eurostat_ea20_hicp_annual_pct",period,v,now));
 }
 return records.sort((a,b)=>b.observation_period.localeCompare(a.observation_period)).slice(0,3);
}
const PARSERS={gdelt_v2_15m:parseGdelt,world_bank_wdi:parseWorldBank,
 ecb_data:parseEcb,eurostat_data:parseEurostat};
export async function collectCorridorOfficialReferences({now=new Date(),fetchImpl=fetch,
 observePortwatch=observePortwatchDaily,force=false}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   typeof fetchImpl!=="function"||typeof observePortwatch!=="function"||
   typeof force!=="boolean")throw Error("CORRIDOR_OFFICIAL_INPUT_INVALID");
 const checks=[],observations=[];
 for(const id of OFFICIAL_CORRIDOR_ADAPTER_IDS){
  if(!force&&!isDue(id,now)){
   checks.push({id,state:"NOT_DUE_SOURCE_NATIVE_CADENCE",observations:0});
   continue;
  }
  if(id==="imf_portwatch"){
   try{
    const value=await observePortwatch({now,fetchImpl});
    const ready=(value.routes??[]).filter(x=>x.observation_state==="DAILY_REFERENCE_OBSERVED");
    const batch=ready.flatMap(x=>{
      if(!/^[-a-z0-9_]{3,45}$/u.test(x.corridor_id)||
         !/^\d{4}-\d{2}-\d{2}$/u.test(x.latest_observation_day??"")||
         !Number.isFinite(x.consecutive_day_change_pct))return [];
      return [candidate(id,"portwatch_daily_transit_pct_change",
        x.latest_observation_day,x.consecutive_day_change_pct,now,
        {corridor_ids:[x.corridor_id]})];
    });
    observations.push(...batch);
    checks.push({id,state:batch.length?"OFFICIAL_REFERENCE_OBSERVED":"NO_CURRENT_REFERENCE_OBSERVATION",
      observations:batch.length});
   }catch{checks.push({id,state:"OFFICIAL_REFERENCE_UNAVAILABLE",observations:0})}
   continue;
  }
  const source=await getBounded(API[id],fetchImpl,id==="ecb_data"?"text/csv":"application/json,text/plain");
  if(source.body===null){checks.push({id,state:source.state,observations:0});continue}
  try{
   const records=PARSERS[id](source.body,now);
   observations.push(...records);
   checks.push({id,state:records.length?"OFFICIAL_REFERENCE_OBSERVED":"NO_CURRENT_REFERENCE_OBSERVATION",
    observations:records.length});
  }catch{checks.push({id,state:"OFFICIAL_REFERENCE_SCHEMA_UNVERIFIED",observations:0})}
 }
 if(checks.length!==5||observations.length>60||
    new Set(observations.map(x=>x.id)).size!==observations.length)
   throw Error("CORRIDOR_OFFICIAL_PARITY_FAILED");
 return Object.freeze({schema:"geomacro.corridor-official-reference-intake.v1",
  channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),source_checks:checks,
  observation_count:observations.length,observations,
  publisher_clock_verified_as_event_time:false,independent_event_verified:false,
  website_intelligence_writes:0,commercial_rights_verified:false,
  paid_output_authorized:false});
}
