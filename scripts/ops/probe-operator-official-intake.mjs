#!/usr/bin/env node
/**
 * Bounded read-only probes for three DISTINCT public official metadata datasets
 * from the operator's 76-source intake. These are contextual inputs and never
 * country-risk certification, corroborated events, GRO or paid intelligence.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT = "artifacts/expanded-official-source/operator-official-intake.json";
const MAX_RESPONSE_BYTES = 512 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
export const OPERATOR_PUBLIC_PROBES = Object.freeze([
  Object.freeze({
    id:"usgs_quakes",domain:"geopolitics",publisher:"U.S. Geological Survey",
    url:"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    kind:"USGS_EARTHQUAKE_HAZARD_CONTEXT",
  }),
  Object.freeze({
    id:"treasury_fiscaldata",domain:"macro",publisher:"U.S. Treasury FiscalData",
    url:"https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=4",
    kind:"US_TREASURY_MONTHLY_INTEREST_RATES",
  }),
  Object.freeze({
    id:"federal_register",domain:"rare_earth",publisher:"U.S. Federal Register",
    url:"https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=critical%20minerals&order=newest&per_page=10",
    kind:"US_CRITICAL_MINERALS_POLICY_DOCUMENT_DISCOVERY",
  }),
]);

async function fetchBoundedJson(source, fetchImpl) {
  let response;
  try {
    response=await fetchImpl(source.url,{method:"GET",redirect:"error",headers:{accept:"application/json"},
      signal:AbortSignal.timeout(10000)});
  } catch {
    return {state:"TRANSPORT_UNAVAILABLE",count:0};
  }
  if (response.status===401||response.status===403||response.status===429) {
    return {state:"AUTH_OR_QUOTA_DENIED",count:0};
  }
  if(!response.ok) return {state:"HTTP_DEGRADED",count:0};
  if(Number(response.headers.get("content-length")||0)>MAX_RESPONSE_BYTES)
    return {state:"RESPONSE_OVERSIZED",count:0};
  if(!response.body) return {state:"RESPONSE_EMPTY",count:0};
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE_BYTES){await reader.cancel();return {state:"RESPONSE_OVERSIZED",count:0};}
      chunks.push(Buffer.from(value));
    }
  }catch{return {state:"RESPONSE_INVALID",count:0};}
  finally{reader.releaseLock();}
  try {return {state:"HTTP_OK",body:JSON.parse(Buffer.concat(chunks).toString("utf8"))};}
  catch{return {state:"RESPONSE_INVALID",count:0};}
}
function countShape(source,body,now){
  if(source.id==="usgs_quakes"){
    if(body?.type!=="FeatureCollection"||!Array.isArray(body.features))return null;
    const n=body.features.length;
    const recent=body.features.filter(x=>{
      const ms=x?.properties?.time;
      return typeof ms==="number"&&Number.isFinite(ms)&&ms<=now.getTime()&&ms>=now.getTime()-DAY_MS;
    }).length;
    return {sampled_metadata_records:n,native_reference_dates_in_24h:recent,
      precision:"USGS_EVENT_TIME_NOT_ARTICLE_PUBLISH_TIME"};
  }
  if(source.id==="treasury_fiscaldata"){
    if(!Array.isArray(body?.data))return null;
    return {sampled_metadata_records:body.data.length,
      native_reference_dates_in_24h:null,
      precision:"MONTHLY_DATA_REFERENCE_DATE_NOT_NEAR_REALTIME_PUBLICATION"};
  }
  if(source.id==="federal_register"){
    if(!Array.isArray(body?.results))return null;
    const today=now.toISOString().slice(0,10);
    const publishedToday=body.results.filter(x=>x?.publication_date===today).length;
    return {sampled_metadata_records:body.results.length,
      native_reference_dates_in_24h:null,published_on_utc_calendar_date:publishedToday,
      precision:"DATE_ONLY_PUBLICATION_NOT_MINUTE_FRESHNESS"};
  }
  return null;
}
export async function probeOperatorOfficialIntake({fetchImpl=fetch,now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("OPERATOR_INTAKE_CLOCK_INVALID");
  const receipts=[];
  for(const source of OPERATOR_PUBLIC_PROBES){
    const result=await fetchBoundedJson(source,fetchImpl);
    const shape=result.state==="HTTP_OK"?countShape(source,result.body,now):null;
    receipts.push({
      id:source.id,domain:source.domain,source_name:source.publisher,
      scope:source.kind,
      state:result.state!=="HTTP_OK"?result.state:shape?"LIVE_PRIVATE_METADATA":"RESPONSE_SHAPE_INVALID",
      api_requests:1,
      sampled_metadata_records:shape?.sampled_metadata_records??0,
      native_reference_dates_in_24h:shape?.native_reference_dates_in_24h??null,
      published_on_utc_calendar_date:shape?.published_on_utc_calendar_date??null,
      timestamp_precision:shape?.precision??null,
      independent_event_corroboration:false,
      source_rights_for_commercial_event_unverified:true,
      signed_gro:false,commercial_eligible:false,
    });
  }
  return {
    schema:"geomacro.operator-three-domain-official-context.v1",
    checked_at:now.toISOString(),
    state:receipts.every(x=>x.state==="LIVE_PRIVATE_METADATA")?"ALL_THREE_CONTEXT_TRANSPORTS_LIVE":"CONTEXT_TRANSPORTS_DEGRADED",
    sources:receipts,
    total_http_requests:receipts.reduce((n,x)=>n+x.api_requests,0),
    raw_data_stored:false,supabase_requests:0,d1_requests:0,b2_requests:0,
    paid_calls:0,three_domain_scored_intelligence_verified:false,
  };
}
async function main(){
  const proof=await probeOperatorOfficialIntake();
  mkdirSync(dirname(OUTPUT),{recursive:true});
  writeFileSync(OUTPUT,JSON.stringify(proof,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(proof));
  if(proof.state!=="ALL_THREE_CONTEXT_TRANSPORTS_LIVE")process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  await main().catch(()=>{
    console.error("OPERATOR_OFFICIAL_CONTEXT_PROBE_FAILED");
    process.exitCode=3;
  });
