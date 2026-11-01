#!/usr/bin/env node
/**
 * Zero-funds, read-only production acceptance for the optional signed Predge
 * pilot route. Anonymous probes make no D1 quota reservations or writes.
 * With the protected research Bearer a single authenticated readback is
 * verified against the pinned active Ed25519 key.
 *
 * PUBLIC MODE: node scripts/ops/verify-predge-pilot-v2-live.mjs
 * SIGNED MODE: PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE set in protected runner.
 */
import {verifySignedPilotCheck} from "../../workers/control-plane/src/predge-pilot-news-context-v2.mjs";
const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
const FAIL_PREFIX="PREDGE_V2_LIVE_";
function check(value,code){if(!value)throw Error(FAIL_PREFIX+code);}
async function load(fetchImpl,url,init={}){
  const response=await fetchImpl(url,{...init,redirect:"error",signal:AbortSignal.timeout(20000)});
  let body=null;
  try{body=await response.json();}catch{/* non-json must fail below */}
  return {status:response.status,body,headers:response.headers};
}
export async function verifyPredgePilotV2Live({base=BASE,fetchImpl=fetch,researchToken=null,expectedSha=null,now=Date.now()}={}){
  check(/^https:\/\/[a-z0-9.-]+$/i.test(base),"INVALID_ORIGIN");
  const health=await load(fetchImpl,base+"/health");
  check(health.status===200&&health.body?.ok===true,"HEALTH_NOT_OK");
  const sha=health.body?.deployed_source_sha;
  check(typeof sha==="string"&&/^[a-f0-9]{40}$/.test(sha),"DEPLOY_SHA_UNKNOWN");
  if(expectedSha)check(sha===expectedSha,"DEPLOY_SOURCE_SHA_MISMATCH");
  const headers={authorization:"Bearer "+"f".repeat(64)};
  const publicProbe=await load(fetchImpl,base+"/v1/pilot/check",{headers});
  check(publicProbe.status===401&&publicProbe.body?.error==="PILOT_CHECK_UNAUTHORIZED"&&
    publicProbe.body?.execution_authorized===false&&
    publicProbe.body?.chargeable===false,"PILOT_AUTH_BOUNDARY");
  const adminProbe=await load(fetchImpl,base+"/v1/internal/predge-pilot-news-context-publish",{
    method:"PUT",headers:{...headers,"content-type":"application/json"},body:"{}"});
  check(adminProbe.status===401&&adminProbe.body?.error==="OWNER_UNAUTHORIZED",
    "OWNER_AUTH_BOUNDARY");
  const legacy=await load(fetchImpl,base+"/v1/partner/predge/derived-structural-72h",{
    headers});
  check(legacy.status===401&&legacy.body?.error==="PREDGE_RESEARCH_UNAUTHORIZED",
    "EXISTING_RESEARCH_AUTH_REGRESSION");
  const result={schema:"geomacro.predge-v2-production-no-funds-acceptance.v1",
    production_revision:sha,anonymous_route_denied:true,
    owner_publish_denied:true,existing_research_auth_preserved:true,
    no_funds:true,live_signed_readback:"NOT_TESTED_NO_PROTECTED_TOKEN"};
  if(researchToken!==null){
    check(/^[a-f0-9]{64}$/.test(researchToken)&&researchToken!=="f".repeat(64),
      "PROTECTED_TOKEN_INVALID");
    const signed=await load(fetchImpl,base+"/v1/pilot/check",{
      headers:{authorization:"Bearer "+researchToken}});
    // 503 is an honest not-ready state, never report successful live sign.
    check(signed.status===200&&signed.body?.ok===true,"SIGNED_SAMPLE_NOT_LIVE_"+signed.status);
    await verifySignedPilotCheck(signed.body,{now});
    check(signed.body.risk_gate?.decision==="PAUSE"&&
      signed.body.execution_authorized===false&&signed.body.chargeable===false,
      "UNSAFE_SIGNED_ADVISORY");
    result.live_signed_readback="VERIFIED";
    result.signed_payload_hash=signed.body.integrity.payload_hash;
    result.expiry=signed.body.expires_at;
    result.delivered_counts=signed.body.risk_gate.news_context.delivered_counts;
  }
  return result;
}
if(process.argv[1]?.endsWith("verify-predge-pilot-v2-live.mjs")){
  verifyPredgePilotV2Live({
    base:process.env.GEOMACRO_CONTROL_PLANE_URL??BASE,
    researchToken:process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE??null,
    expectedSha:process.env.GEOMACRO_EXPECTED_SOURCE_SHA??null,
  }).then(v=>console.log(JSON.stringify(v))).catch(e=>{
    console.error(String(e.message).replace(/[^A-Z0-9_]/gi,"_").slice(0,150));
    process.exitCode=1;
  });
}
