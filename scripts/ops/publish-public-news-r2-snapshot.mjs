#!/usr/bin/env node
/** Bounded zero-new-source D1-origin public news -> R2 snapshot producer.
 * Called only from already-quota-admitted canonical GitHub fastlane.
 * No private source, B2, commercial/Predge or payment access.
 */
import {createHmac} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {validatePublicNewsR2Bundle,PUBLIC_NEWS_R2_MAX_BYTES}
  from "../../workers/control-plane/src/public-news-r2-offload.mjs";

const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const MAX_HTTP_BYTES=850000;
async function read(path,fetchImpl){
  let response;
  try{response=await fetchImpl(ROOT+path,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json","Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(12_000)
  })}catch{throw Error("R2_SOURCE_D1_READ_UNAVAILABLE")}
  if(!response?.ok||response.redirected||Number(response.headers.get("content-length")||0)>MAX_HTTP_BYTES)
    throw Error("R2_SOURCE_D1_READ_UNAVAILABLE");
  const raw=await response.text();
  if(raw.length>MAX_HTTP_BYTES)throw Error("R2_SOURCE_D1_OVERSIZE");
  try{return JSON.parse(raw)}catch{throw Error("R2_SOURCE_D1_CONTRACT_INVALID")}
}
export async function buildPublicNewsR2Snapshot({fetchImpl=fetch,now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("R2_SOURCE_CLOCK_INVALID");
  // Read the deployed SHA *before* exact native-time D1 projections.
  const health=await read("/health",fetchImpl);
  if(health?.ok!==true||!/^[a-f0-9]{40}$/.test(String(health.deployed_source_sha??"")))
    throw Error("R2_SOURCE_WORKER_SHA_UNVERIFIED");
  const pages={};
  for(const offset of [0,250,500]){
    const path="/v1/public/website-derived-news-immediate"+
      (offset?"?offset="+offset:"");
    const page=await read(path,fetchImpl);
    pages[String(offset)]=page;
    if(page?.has_more===false)break;
  }
  const machine=await read("/v1/public/derived-structural-72h",fetchImpl);
  const value={schema:"geomacro.public-source-neutral-r2-bundle.v1",
    produced_at:now.toISOString(),
    origin_deployed_source_sha:health.deployed_source_sha,
    pages,machine};
  // Pure local validation (including article original clocks & ID parity).
  const metrics=validatePublicNewsR2Bundle(value,now.getTime());
  if(new TextEncoder().encode(JSON.stringify(value)).length>PUBLIC_NEWS_R2_MAX_BYTES)
    throw Error("R2_SOURCE_BUNDLE_OVERSIZE");
  return {value,metrics};
}
export async function publishPublicNewsR2Snapshot({
  fetchImpl=fetch,env=process.env,now=new Date()
}={}){
  const token=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
  if(token.length<32)throw Error("R2_SOURCE_AUTH_NOT_CONFIGURED");
  const {value,metrics}=await buildPublicNewsR2Snapshot({fetchImpl,now});
  const control=createHmac("sha256",token).update("geomacro-control-plane-v1").digest("hex");
  let resp;
  try{resp=await fetchImpl(ROOT+"/v1/public-news-r2-snapshot",{
    method:"PUT",redirect:"error",
    headers:{Authorization:"Bearer "+control,"Content-Type":"application/json"},
    body:JSON.stringify(value),signal:AbortSignal.timeout(15000)
  })}catch{throw Error("R2_SOURCE_PUBLISH_UNAVAILABLE")}
  if(!resp?.ok||resp.redirected)throw Error("R2_SOURCE_PUBLISH_UNAVAILABLE");
  const result=await resp.json().catch(()=>null);
  if(result?.ok!==true||
     result.schema!=="geomacro.public-source-neutral-r2-receipt.v1"||
     result.r2_exact_readback_verified!==true||
     result.stored_records!==metrics.total||
     result.source_neutral_items!==metrics.neutral||
     !/^[a-f0-9]{64}$/.test(String(result.sha256??"")))
    throw Error("R2_SOURCE_PUBLISH_READBACK_INVALID");
  // Only aggregate counts and hashes. Never print a source signal.
  return {schema:"geomacro.public-news-r2-publisher-receipt.v1",
    source_neutral_items:metrics.neutral,stored_records:metrics.total,
    sha256:result.sha256,kv_pointer_updated:result.kv_pointer_updated,
    source_original_clock_preserved:true,d1_writes:0,b2_requests:0,
    new_upstream_reads:0,payments:0};
}
if(process.argv[1]&&resolve(process.argv[1])===pathToFileURL(import.meta.url).pathname){
  try{console.log(JSON.stringify(await publishPublicNewsR2Snapshot()))}
  catch{console.error("PUBLIC_NEWS_R2_SNAPSHOT_PUBLISH_UNAVAILABLE");process.exitCode=2}
}
