#!/usr/bin/env node
// Daily 195x3 actual country-original evidence vs WEBSITE D1 derived news.
// One GET to existing hosted API; ZERO official-source fanout, writes, signing
// or money. Unlike route catalogs, empty/gaps remain empty and observable.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {reconcileCountry195Publication}
 from "../lib/reconcile-country-195-publication.mjs";
const URL="https://geomacro.live/api/v1/intelligence/query?view=country-coverage-195x3";
async function getBoundedJson(fetchImpl){
 const response=await fetchImpl(URL,{method:"GET",redirect:"error",
  headers:{Accept:"application/json"},cache:"no-store",
  signal:AbortSignal.timeout(20_000)});
 if(response.status!==200||!response.body)
  throw Error("COUNTRY_195_WEBSITE_GRID_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")??0)>900_000)
  throw Error("COUNTRY_195_WEBSITE_GRID_OVERSIZE");
 const reader=response.body.getReader();const parts=[];let n=0;
 try{for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   n+=value.length;
   if(n>900_000)throw Error("COUNTRY_195_WEBSITE_GRID_OVERSIZE");
   parts.push(value);
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const buf=new Uint8Array(n);let i=0;
 for(const p of parts){buf.set(p,i);i+=p.length;}
 try{return JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(buf));}
 catch{throw Error("COUNTRY_195_WEBSITE_GRID_JSON_INVALID");}
}
export async function readLiveCountryPublicationReconciliation({
 fetchImpl=fetch,now=new Date(),rolling
}={}){
 if(!rolling||typeof rolling!=="object")
  throw Error("COUNTRY_195_SOURCE_PROOF_ARTIFACT_REQUIRED");
 return reconcileCountry195Publication({
  rolling,website:await getBoundedJson(fetchImpl),now
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
    throw Error("COUNTRY_195_PROTECTED_MAIN_REQUIRED");
  const rolling=JSON.parse(readFileSync(
    "artifacts/country-195/rolling-proof-summary.v1.json","utf8"));
  const report=await readLiveCountryPublicationReconciliation({rolling});
  mkdirSync("artifacts/country-195",{recursive:true,mode:0o700});
  writeFileSync("artifacts/country-195/live-195x3-source-website-reconciliation.json",
    JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({
   schema:report.schema,verified_source_probe_cells_last_24h:
     report.verified_source_probe_cells_last_24h,
   website_country_mentioned_cells_last_72h:
     report.website_country_mentioned_cells_last_72h,
   source_and_journal_overlap_cells:report.source_and_journal_overlap_cells,
   unprobed_or_stale_source_cells:report.unprobed_or_stale_source_cells,
   domain_totals:report.domain_totals,
   current_signed_195x3_verified:false,payments:0
  }));
 }catch{
  console.error("::error::COUNTRY_195_ACTUAL_SOURCE_VS_WEBSITE_READBACK_UNAVAILABLE");
  process.exitCode=3;
 }
}
