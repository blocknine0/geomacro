/** Corridor-only optional authenticated source observations.
 * Credential values are read from GitHub production secrets only.
 * No raw article, report, or protected provider response is persisted.
 * Evidence remains context-only, never signed GRO, customer or PREDGE.
 */
import {createHash} from "node:crypto";
import {observeApprovedReliefWeb} from "../ops/observe-approved-reliefweb-live.mjs";
const HOUR=3600000,MAX_BYTES=256*1024;
export const CREDENTIAL_CORRIDOR_IDS=Object.freeze([
 "fred_api","reliefweb_v2","cryptocompare_news","freightos_fbx"
]);
const cryptoNewsUrl="https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
const fredUrl="https://api.stlouisfed.org/fred/series/observations";
const keyOk=k=>typeof k==="string"&&/^[a-zA-Z0-9_-]{20,200}$/u.test(k);
const appOk=k=>typeof k==="string"&&/^[A-Za-z][A-Za-z0-9_.-]{7,100}$/u.test(k)&&k!=="geomacro.live";
function observation(source_id,metric_id,period,numeric_value,now){
 if(!/^[a-z0-9_]{4,60}$/u.test(metric_id)||typeof numeric_value!=="number"||
   !Number.isFinite(numeric_value)||Math.abs(numeric_value)>1e9)
  throw Error("CORRIDOR_CREDENTIAL_METRIC_INVALID");
 const id=createHash("sha256").update([source_id,metric_id,period,
  String(numeric_value)].join("\x1f")).digest("hex");
 return {id,source_id,metric_id,observation_period:period,numeric_value,
  observed_at:now.toISOString(),source_native_publication_at:null,
  source_observation_is_not_live_event:true,corridor_ids:[],
  context_only:true,independently_verified_event:false,
  commercial_rights_verified:false,customer_delivery_enabled:false};
}
async function boundedJson(url,options,fetchImpl){
 let response;
 try{response=await fetchImpl(url,{method:options.method??"GET",
   redirect:"error",cache:"no-store",headers:options.headers,
   ...(options.body?{body:options.body}:{}),signal:AbortSignal.timeout(9000)})}
 catch{return {state:"PROVIDER_NETWORK_UNAVAILABLE"}}
 if([401,403,429].includes(response.status))
  return {state:response.status===429?"PROVIDER_QUOTA_DENIED":"PROVIDER_ACCESS_DENIED"};
 if(response.status!==200||response.url&&response.url!==url)
  return {state:"PROVIDER_HTTP_UNAVAILABLE"};
 if(!response.body||
   Number(response.headers?.get?.("content-length")??0)>MAX_BYTES)
  return {state:"PROVIDER_RESPONSE_OVERSIZED"};
 const reader=response.body.getReader(),parts=[];let len=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;
   len+=value.byteLength;
   if(len>MAX_BYTES)return {state:"PROVIDER_RESPONSE_OVERSIZED"};
   parts.push(value);
  }
 }catch{return {state:"PROVIDER_READ_UNAVAILABLE"}}
 finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 try{
  const bytes=new Uint8Array(len);let n=0;
  for(const part of parts){bytes.set(part,n);n+=part.byteLength}
  return {state:"OK",data:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))};
 }catch{return {state:"PROVIDER_RESPONSE_INVALID_JSON"}}
}
function parseFred(data,series,now){
 if(!Array.isArray(data?.observations)||data.observations.length>5)
  throw Error("FRED_RESPONSE_INVALID");
 for(const row of data.observations){
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(row?.date??"")||
    row.date>now.toISOString().slice(0,10))continue;
  const value=Number(row.value);
  if(typeof row.value!=="string"||row.value==="."||!Number.isFinite(value)||
    value<0||value>10000)continue;
  return observation("fred_api",series==="DGS10"?
    "fred_dgs10_yield_percent":"fred_wti_usd_per_barrel",row.date,value,now);
 }
 return null;
}
function parseNews(data,now){
 if(data?.Response==="Error"||!Array.isArray(data?.Data)||data.Data.length>200)
  throw Error("CRYPTOCOMPARE_RESPONSE_INVALID");
 const ids=new Set();
 for(const row of data.Data){
  const timestamp=row?.published_on;
  const id=String(row?.id??row?.ID??"");
  if(!/^[a-zA-Z0-9_-]{2,90}$/u.test(id)||ids.has(id)||
   !Number.isSafeInteger(timestamp)||timestamp*1000>now.getTime()||
   now.getTime()-timestamp*1000>24*HOUR)continue;
  ids.add(id);
 }
 return observation("cryptocompare_news",
  "cryptocompare_24h_news_sample_count",now.toISOString(),
  ids.size,now);
}
export async function collectCredentialCorridorContext({
 now=new Date(),fetchImpl=fetch,keys=process.env,
 observeReliefWeb=observeApprovedReliefWeb,force=false
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
  typeof fetchImpl!=="function"||!keys||typeof keys!=="object"||
  typeof observeReliefWeb!=="function")throw Error("CORRIDOR_CREDENTIAL_INPUT_INVALID");
 const checks=[],observations=[],add=(id,state,items=[])=>{
  checks.push({id,state,observations:items.length});
  observations.push(...items);
 };
 const slot=now.getUTCHours(),minute=now.getUTCMinutes();
 const fredKey=keys.GEOMACRO_FRED_API_KEY;
 if(!keyOk(fredKey))add("fred_api","PROVIDER_API_AUTH_REQUIRED");
 else if(!force&&(![0,6,12,18].includes(slot)||minute>=30))
  add("fred_api","NOT_DUE_SOURCE_NATIVE_CADENCE");
 else{
  const records=[];let fail=null;
  for(const series of ["DGS10","DCOILWTICO"]){
   const u=new URL(fredUrl);
   u.searchParams.set("series_id",series);
   u.searchParams.set("api_key",fredKey);
   u.searchParams.set("file_type","json");
   u.searchParams.set("sort_order","desc");
   u.searchParams.set("limit","5");
   const res=await boundedJson(u.href,{headers:{Accept:"application/json"}},fetchImpl);
   if(res.state!=="OK"){fail=res.state;break}
   try{
    const parsed=parseFred(res.data,series,now);
    if(parsed)records.push(parsed);
   }catch{fail="PROVIDER_RESPONSE_SCHEMA_UNVERIFIED";break}
  }
  add("fred_api",fail??(records.length?"OFFICIAL_REFERENCE_OBSERVED":"NO_CURRENT_REFERENCE_OBSERVATION"),fail?[]:records);
 }
 const appname=keys.GEOMACRO_RELIEFWEB_APPNAME;
 if(!appOk(appname))add("reliefweb_v2","PROVIDER_API_AUTH_REQUIRED");
 else if(!force&&(slot%2!==0||minute>=30))
  add("reliefweb_v2","NOT_DUE_SOURCE_NATIVE_CADENCE");
 else{
  try{
   const item=await observeReliefWeb({appname,now,fetchImpl});
   if(item.status!=="LIVE_METADATA_TRANSPORT")
    add("reliefweb_v2",item.status==="ACCESS_DENIED_OR_QUOTA"?
      "PROVIDER_ACCESS_DENIED":"PROVIDER_RESPONSE_UNVERIFIED");
   else if(!Number.isInteger(item.sampled_original_reports_within_24h)||
      item.sampled_original_reports_within_24h<0||
      item.sampled_original_reports_within_24h>80)
    add("reliefweb_v2","PROVIDER_RESPONSE_SCHEMA_UNVERIFIED");
   else add("reliefweb_v2","OFFICIAL_REFERENCE_OBSERVED",[
     observation("reliefweb_v2","reliefweb_native_24h_reports_sample_count",
      now.toISOString(),item.sampled_original_reports_within_24h,now)
   ]);
  }catch{add("reliefweb_v2","PROVIDER_RESPONSE_UNVERIFIED")}
 }
 const ccKey=keys.GEOMACRO_CRYPTOCOMPARE_API_KEY;
 if(!keyOk(ccKey))add("cryptocompare_news","PROVIDER_API_AUTH_REQUIRED");
 else if(!force&&(minute>=30||slot%1!==0))
  add("cryptocompare_news","NOT_DUE_SOURCE_NATIVE_CADENCE");
 else{
  const res=await boundedJson(cryptoNewsUrl,{headers:{
   Accept:"application/json",Authorization:"Apikey "+ccKey
  }},fetchImpl);
  if(res.state!=="OK")add("cryptocompare_news",res.state);
  else try{add("cryptocompare_news","OFFICIAL_REFERENCE_OBSERVED",
      [parseNews(res.data,now)])}
   catch{add("cryptocompare_news","PROVIDER_RESPONSE_SCHEMA_UNVERIFIED")}
 }
 // Free/no-paid provider requirement: refuse FBX automatically even when credentials exist.
 add("freightos_fbx","PROVIDER_ENTITLEMENT_DISABLED_NO_PAID_PROVIDER");
 if(checks.length!==4||observations.length>5||
    observations.some(x=>x.commercial_rights_verified!==false||
      x.independently_verified_event!==false))
   throw Error("CORRIDOR_CREDENTIAL_PARITY_INVALID");
 return Object.freeze({schema:"geomacro.corridor-credential-context-intake.v1",
  channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
  source_checks:checks,observation_count:observations.length,observations,
  website_intelligence_writes:0,commercial_rights_verified:false,
  paid_output_authorized:false,credential_values_written:false});
}
