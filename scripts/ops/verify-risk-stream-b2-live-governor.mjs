#!/usr/bin/env node
// A production-account D1 governor parity probe; never mutates B2, D1 or quotas.
// A DNS-failed legacy vanity hostname may fall back ONLY to the pinned real
// control-plane Worker (NOT the isolated shadow Worker, whose D1 is different).
import {lookup} from "node:dns/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";

export const PRIMARY_GOVERNOR="https://api.geomacro.live";
export const PINNED_CONTROL_PLANE="https://geomacro-control-plane.daspallab202391.workers.dev";
const path="/v1/b2-quota/status";
const retryableCodes=new Set(["ENOTFOUND","EAI_AGAIN","ENETUNREACH","ECONNREFUSED","ETIMEDOUT","ECONNRESET"]);
const required=["total","GET","PUT","HEAD","NATIVE_AUTH"];
function errorCode(e){return String(e?.code||e?.cause?.code||"")}
function retryable(e){
 return retryableCodes.has(errorCode(e))||
   /^(?:B2_LIVE_QUOTA_HTTP_404|B2_LIVE_QUOTA_HTTP_502|B2_LIVE_QUOTA_HTTP_503|B2_LIVE_QUOTA_HTTP_504)$/u.test(e?.message||"");
}
async function readEndpoint(base,{bearer,fetchImpl}){
 const r=await fetchImpl(base+path,{headers:{Authorization:"Bearer "+bearer},
   signal:AbortSignal.timeout(15000),redirect:"error",cache:"no-store"});
 if(!r.ok)throw Error("B2_LIVE_QUOTA_HTTP_"+r.status);
 const live=await r.json();
 const day=new Date().toISOString().slice(0,10);
 if(live?.ok!==true||live.schema!=="geomacro.b2-account-quota-status.v1"||
    live.day_utc!==day||!live.used||!live.limits||
    required.some(k=>live.limits[k]!==B2_DAILY_LIMITS[k]||
      !Number.isSafeInteger(live.used[k])||live.used[k]<0||
      live.used[k]>B2_DAILY_LIMITS[k]))
  throw Error("HOT50_B2_LIVE_GOVERNOR_POLICY_DRIFT");
 return {schema:"geomacro.shadow-b2-governor-parity.v1",
   status:"D1_SHARED_GOVERNOR_MATCH",day_utc:day,
   limits:B2_DAILY_LIMITS,used:live.used,mode:"PRIVATE_R2_ONLY",
   expected_b2_network_ops_for_shadow:0,
   provider_backblaze_telemetry_independently_verified:false,
   commercial_release_authorized:false};
}

export async function verifyLiveGovernor({bearer=process.env.GEOMACRO_STREAM_ADMIN_BEARER,
  lookupImpl=lookup,fetchImpl=fetch}={}){
 if(typeof bearer!=="string"||bearer.length<32)throw Error("B2_LIVE_ADMIN_AUTH_UNAVAILABLE");
 let primaryFailure=null;
 try{
  // Resolve before sending the bearer to the vanity domain. Network DNS
  // failures are not proof of governor drift or permission to bypass parity.
  await lookupImpl(new URL(PRIMARY_GOVERNOR).hostname);
  const report=await readEndpoint(PRIMARY_GOVERNOR,{bearer,fetchImpl});
  return {...report,verified_route:"PRIMARY_CUSTOM_DOMAIN",dns_fallback_used:false};
 }catch(e){
  if(!retryable(e))throw e;
  primaryFailure=errorCode(e)||String(e.message||"").slice(0,60);
 }
 // This is the reviewed production control-plane route, never a caller
 // supplied hostname and never the shadow D1. The same schema, day, limits
 // and authenticated D1 values must pass on the fallback.
 const report=await readEndpoint(PINNED_CONTROL_PLANE,{bearer,fetchImpl});
 return {...report,verified_route:"PINNED_CONTROL_PLANE_WORKERS_DEV",
   dns_fallback_used:true,primary_failure:primaryFailure};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await verifyLiveGovernor()))}
 catch(e){console.error(String(e?.message||e));process.exitCode=1}
}
