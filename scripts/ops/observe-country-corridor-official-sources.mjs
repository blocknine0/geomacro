#!/usr/bin/env node
// New country/corridor companion: 3 distinct official no-key source probes.
// Read-only PRIVATE provider metadata, never scoring/ingestion or source-rights approval.
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {pathToFileURL} from "node:url";

const OUTPUT="artifacts/expanded-official-source/country-corridor-official-context.json";
const MAX_BYTES=512*1024;
export const COUNTRY_CORRIDOR_PROBES=Object.freeze([
 Object.freeze({
  id:"marad_advisories",domain:"geopolitics",country_iso3:["USA"],
  source_name:"U.S. Maritime Alert and Advisory System (MARAD-hosted)",
  url:"https://www.maritime.dot.gov/msci/maritime-security-communications-industry-msci-web-portal",
  media:"official_html",proof_scope:"U.S. maritime-security alert portal availability; NOT current incident extraction"
 }),
 Object.freeze({
  id:"ukr_nbu",domain:"macro_fx",country_iso3:["UKR"],
  source_name:"National Bank of Ukraine",
  url:"https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangeNew?json&valcode=USD",
  media:"nbu_official_json",proof_scope:"Official UAH/USD reference FX rate; NOT live streaming prices"
 }),
 Object.freeze({
  id:"jpn_jogmec",domain:"critical_minerals",country_iso3:["JPN"],
  source_name:"Japan Organization for Metals and Energy Security (JOGMEC)",
  url:"https://www.jogmec.go.jp/english/news/release/2026.html",
  media:"official_html",proof_scope:"Official 2026 resources/minerals release index availability; NOT verified new minerals event"
 }),
]);
async function boundedRequest(source,fetchImpl){
 let response;
 try{
  response=await fetchImpl(source.url,{method:"GET",redirect:"error",
   headers:{accept:source.media==="nbu_official_json"?"application/json":"text/html"},
   signal:AbortSignal.timeout(9000)});
 }catch{return {state:"TRANSPORT_UNAVAILABLE"};}
 if([401,403,429].includes(response.status))return {state:"DENIED_OR_QUOTA"};
 if(!response.ok)return {state:"HTTP_DEGRADED"};
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)
  return {state:"RESPONSE_OVERSIZED"};
 if(!response.body)return {state:"RESPONSE_EMPTY"};
 const chunks=[],reader=response.body.getReader();let size=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>MAX_BYTES){await reader.cancel();return {state:"RESPONSE_OVERSIZED"};}
   chunks.push(Buffer.from(value));
  }
 }catch{return {state:"RESPONSE_INVALID"};}
 finally{reader.releaseLock();}
 return {state:"BODY_OBSERVED",body:Buffer.concat(chunks).toString("utf8")};
}
function validate(source,body){
 if(source.media==="nbu_official_json"){
  let data;
  try{data=JSON.parse(body)}catch{return null;}
  if(!Array.isArray(data)||data.length<1)return null;
  const rows=data.filter(x=>x&&x.cc==="USD"&&typeof x.rate==="number"&&
   Number.isFinite(x.rate)&&x.rate>0&&/^\d{2}\.\d{2}\.\d{4}$/.test(x.exchangedate));
  return rows.length?{metadata_count:rows.length,data_kind:"PUBLISHED_OFFICIAL_REFERENCE_RATE_NOT_REALTIME_STREAM"}:null;
 }
 if(!/^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b/iu.test(body.slice(0,1500)))return null;
 if(source.id==="jpn_jogmec"&&!/JOGMEC|Japan Organization for Metals and Energy Security/iu.test(body))return null;
 if(source.id==="marad_advisories"&&!/Maritime Security|MSCI|Maritime Alert/iu.test(body))return null;
 return {metadata_count:0,data_kind:"OFFICIAL_HTML_TRANSPORT_ONLY_NO_EVENT_OR_ARTICLE_EXTRACTION"};
}
export async function observeCountryCorridorOfficialSources({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("COUNTRY_CORRIDOR_CLOCK_INVALID");
 const sources=[];
 for(const s of COUNTRY_CORRIDOR_PROBES){
  const observed=await boundedRequest(s,fetchImpl);
  const parsed=observed.state==="BODY_OBSERVED"?validate(s,observed.body):null;
  sources.push({
   id:s.id,domain:s.domain,country_iso3:s.country_iso3,source_name:s.source_name,
   proof_scope:s.proof_scope,transport_state:observed.state==="BODY_OBSERVED"?
    parsed?"PRIVATE_OFFICIAL_METADATA_OBSERVED":"PROVIDER_SHAPE_UNVERIFIED":observed.state,
   http_requests:1,metadata_count:parsed?.metadata_count??0,
   published_data_kind:parsed?.data_kind??null,
   source_rights_for_paid_use_verified:false,independent_event_corroboration:false,
   geocoded_country_event_verified:false,corridor_route_flow_verified:false,
   signed_gro:false,commercial_eligible:false,raw_data_stored:false
  });
 }
 return {schema:"geomacro.country-corridor-3domain-private-observation.v1",
  checked_at:now.toISOString(),
  status:sources.every(x=>x.transport_state==="PRIVATE_OFFICIAL_METADATA_OBSERVED")?
    "ALL_THREE_OFFICIAL_CONTEXT_SOURCES_REACHABLE":"OFFICIAL_CONTEXT_DEGRADED",
  sources,api_requests:3,supabase_requests:0,d1_requests:0,b2_requests:0,
  x402_payment_attempts:0,original_report_content_stored:false,
  country_and_corridor_scores_certified:false,signed_intelligence_generated:false};
}
async function main(){
 const receipt=await observeCountryCorridorOfficialSources();
 mkdirSync(dirname(OUTPUT),{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 if(receipt.status!=="ALL_THREE_OFFICIAL_CONTEXT_SOURCES_REACHABLE")process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 await main().catch(()=>{console.error("COUNTRY_CORRIDOR_PRIVATE_PROBE_ERROR");process.exitCode=3;});
}
