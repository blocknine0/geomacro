#!/usr/bin/env node
/**
 * No-funds outside-in ECB reference-FX acceptance.
 * Read production Ask SSE and the public ECB series independently. No numbers,
 * upstream body, URLs, tokens or user prompts are logged as telemetry.
 * Never use the observation for a signed/commercial GRO.
 */
import {inspectAskSse} from "./verify-live-ask-sse.mjs";

const BASE = String(process.env.GEOMACRO_BASE_URL ?? "https://geomacro.live").replace(/\/$/u,"");
const ORIGIN = new URL(BASE).origin;
const ECB = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&lastNObservations=6";
const QUESTION = "EUR/USD exchange rate";
const DAY_MS=86_400_000;
function requireProof(condition,code){if(!condition)throw Error(code)}
function exactDay(s,now){
 requireProof(/^\d{4}-\d{2}-\d{2}$/u.test(s),"ASK_ECB_NATIVE_DATE_INVALID");
 const date=Date.parse(s+"T00:00:00Z");
 requireProof(Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===s&&
   date<=now.getTime()&&now.getTime()-date<=14*DAY_MS,
   "ASK_ECB_NATIVE_DATE_STALE_OR_FUTURE");
 return date;
}
export function parseVerifiedEcbReferenceCsv(body,now=new Date()){
 requireProof(typeof body==="string"&&body.length>40&&body.length<=128_000,
   "ASK_ECB_REFERENCE_SIZE_INVALID");
 const lines=body.replace(/\r\n/gu,"\n").split("\n").filter(Boolean);
 const header=lines.findIndex(line=>line.startsWith("FREQ,")&&line.includes("TIME_PERIOD")&&line.includes("OBS_VALUE"));
 requireProof(header>=0,"ASK_ECB_REFERENCE_HEADER_INVALID");
 const cols=lines[header].split(",");
 const idx=Object.fromEntries(["FREQ","CURRENCY","CURRENCY_DENOM","EXR_TYPE","EXR_SUFFIX",
   "TIME_PERIOD","OBS_VALUE"].map(k=>[k,cols.indexOf(k)]));
 requireProof(Object.values(idx).every(k=>k>=0),"ASK_ECB_REFERENCE_HEADER_MISSING");
 const observations=[];
 for(const line of lines.slice(header+1,header+21)){
   // Exact original ECB csvdata lane: field positions are fixed by its
   // header, not inferred from response shape or browser retrieval time.
   const fields=line.split(",");
   if(fields.length<cols.length)continue;
   if(fields[idx.FREQ]!=="D"||fields[idx.CURRENCY]!=="USD"||
      fields[idx.CURRENCY_DENOM]!=="EUR"||fields[idx.EXR_TYPE]!=="SP00"||
      fields[idx.EXR_SUFFIX]!=="A")continue;
   const day=fields[idx.TIME_PERIOD],value=Number(fields[idx.OBS_VALUE]);
   if(!Number.isFinite(value)||value<=0)continue;
   try{exactDay(day,now);}catch{continue}
   observations.push({day,value});
 }
 observations.sort((a,b)=>b.day.localeCompare(a.day));
 requireProof(observations.length>0,"ASK_ECB_REFERENCE_NO_VALID_OBSERVATION");
 return observations[0];
}
export async function probeEcbAsk(fetchImpl=fetch,now=new Date()){
 requireProof(ORIGIN===BASE&&ORIGIN.startsWith("https://"),"ASK_ECB_SITE_ORIGIN_INVALID");
 const common={redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(22_000)};
 const [ask,reference]=await Promise.all([
   fetchImpl(BASE+"/api/ask/v2/turn",{
     ...common,method:"POST",headers:{
       Origin:ORIGIN,Accept:"text/event-stream","Content-Type":"application/json",
       "Cache-Control":"no-store","User-Agent":"Geomacro-Ask-ECB-NoFunds-Acceptance/1.0",
     },body:JSON.stringify({question:QUESTION,history:[]}),
   }),
   fetchImpl(ECB,{...common,method:"GET",headers:{Accept:"text/csv"}}),
 ]);
 requireProof(ask.status===200,"ASK_ECB_PRODUCT_HTTP_"+ask.status);
 requireProof(reference.status===200&&!reference.redirected,"ASK_ECB_ORIGINAL_HTTP_"+reference.status);
 requireProof(Number(ask.headers.get("content-length")||0)<=96_000,
   "ASK_ECB_SSE_BODY_SIZE_INVALID");
 requireProof(Number(reference.headers.get("content-length")||0)<=128_000,
   "ASK_ECB_REFERENCE_BODY_SIZE_INVALID");
 const rawAsk=await ask.text(),rawEcb=await reference.text();
 requireProof(rawAsk.length<=96_000,"ASK_ECB_SSE_OVERSIZE");
 const result=inspectAskSse(rawAsk,ask.headers.get("content-type")??"");
 const answer=result.answer;
 requireProof(answer&&answer.insufficient_evidence===false&&
   answer.source_identity_exposed===false&&answer.durable_live_storage_write===false&&
   answer.signed_gro_generated===false&&answer.independent_same_event_verification===false&&
   answer.gri===null&&answer.data_mode==="ephemeral_live"&&
   Array.isArray(answer.evidence)&&answer.evidence.length>0,
   "ASK_ECB_OFFICIAL_REFERENCE_NOT_VERIFIED");
 const serialized=JSON.stringify(answer);
 for(const token of ["source_url","raw_payload","https://","http://","api.worldbank.org","data-api.ecb.europa.eu"]){
   requireProof(!serialized.includes(token),"ASK_ECB_RAW_UPSTREAM_LEAK");
 }
 const summary=String(answer.summary??"");
 const found=/^ECB's latest available daily reference gives 1 EUR = (\d+(?:\.\d+)?) USD on (\d{4}-\d{2}-\d{2})\.$/u.exec(summary);
 requireProof(!!found,"ASK_ECB_DAILY_RATE_MISSING_OR_MISLABELED");
 const parsedDay=found[2],observed=Number(found[1]);
 requireProof(Number.isFinite(observed)&&observed>0,"ASK_ECB_OBSERVED_RATE_INVALID");
 exactDay(parsedDay,now);
 requireProof(/not live executable FX prices/i.test(String(answer.why_it_matters??""))&&
   /ECB statistics/i.test(String(answer.geomacro_view??"")),
   "ASK_ECB_NOT_DISTINGUISHED_FROM_SPOT_FX");
 const source=parseVerifiedEcbReferenceCsv(rawEcb,now);
 requireProof(source.day===parsedDay,"ASK_ECB_SOURCE_DATE_MISMATCH");
 requireProof(Math.abs(source.value-observed)<0.000001,
   "ASK_ECB_SOURCE_RATE_MISMATCH");
 return {
   ok:true,schema:"geomacro.ask-ecb-live-nofunds-acceptance.v1",
   checked_at:now.toISOString(),product_sse_verified:true,independent_ecb_day_rate_matched:true,
   reference_date_verified:true,non_executable_fx_notice:true,
   progress_events:result.progress_events,
   no_signed_gro_or_payment:true,raw_source_logged:false,source_url_exposed:false,
 };
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 try{console.log(JSON.stringify(await probeEcbAsk()));}
 catch(error){console.error("ASK_ECB_LIVE_FAILED:"+(error instanceof Error?error.message:"unknown"));process.exitCode=2;}
}
