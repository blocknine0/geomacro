import test from "node:test";
import assert from "node:assert/strict";
import {verifyPredgePilotV2Live} from "../ops/verify-predge-pilot-v2-live.mjs";
const SHA="a".repeat(40),BASE="https://control.example";
const healthy={ok:true,deployed_source_sha:SHA};
const denyPilot={ok:false,error:"PILOT_CHECK_UNAUTHORIZED",
  execution_authorized:false,chargeable:false};
const denyAdmin={ok:false,error:"OWNER_UNAUTHORIZED",
  execution_authorized:false,chargeable:false};
const denyLegacy={ok:false,error:"PREDGE_RESEARCH_UNAUTHORIZED",
  execution_authorized:false,chargeable:false};
function fetcher(override={}){
 const responses={"/health":[200,healthy],"/v1/pilot/check":[401,denyPilot],
  "/v1/internal/predge-pilot-news-context-publish":[401,denyAdmin],
  "/v1/partner/predge/derived-structural-72h":[401,denyLegacy],...override};
 const calls=[];
 const fn=async(url,init)=>{
  calls.push({url,method:init.method??"GET",auth:init.headers?.authorization});
  const response=responses[new URL(url).pathname];
  assert.ok(response,"Unexpected url: "+url);
  return new Response(JSON.stringify(response[1]),{status:response[0],
    headers:{"content-type":"application/json"}});
 };
 return {fn,calls};
}
test("proves dedicated pilot route and existing credential boundary without spending quota",async()=>{
 const {fn,calls}=fetcher();
 const result=await verifyPredgePilotV2Live({base:BASE,fetchImpl:fn,expectedSha:SHA});
 assert.equal(result.live_signed_readback,"NOT_TESTED_NO_PROTECTED_TOKEN");
 assert.equal(result.anonymous_route_denied,true);
 assert.equal(result.owner_publish_denied,true);
 assert.equal(result.existing_research_auth_preserved,true);
 assert.equal(calls.length,4);
 assert.equal(calls.some(x=>x.method==="PUT"&&x.auth==="Bearer "+"f".repeat(64)),true);
});
test("rejects old deployments or an unknown health revision",async()=>{
 const old=fetcher({"/v1/pilot/check":[404,{error:"NOT_FOUND"}]});
 await assert.rejects(verifyPredgePilotV2Live({base:BASE,fetchImpl:old.fn}),
  /PREDGE_V2_LIVE_PILOT_AUTH_BOUNDARY/);
 const unknown=fetcher({"/health":[200,{ok:true}]});
 await assert.rejects(verifyPredgePilotV2Live({base:BASE,fetchImpl:unknown.fn}),
  /PREDGE_V2_LIVE_DEPLOY_SHA_UNKNOWN/);
 const {fn}=fetcher();
 await assert.rejects(verifyPredgePilotV2Live({base:BASE,fetchImpl:fn,expectedSha:"b".repeat(40)}),
  /PREDGE_V2_LIVE_DEPLOY_SOURCE_SHA_MISMATCH/);
});
test("authenticated signed check must be 200 and independently verified, never a fake success",async()=>{
 const token="a".repeat(64),{fn}=fetcher({"/v1/pilot/check":[503,{
  ok:false,error:"SIGNED_PILOT_SAMPLE_NOT_PUBLISHED",execution_authorized:false}]});
 await assert.rejects(verifyPredgePilotV2Live({
  base:BASE,fetchImpl:fn,researchToken:token}),/PREDGE_V2_LIVE_PILOT_AUTH_BOUNDARY/);
 // Distinguish invalid anonymous response from valid anonymous + missing signed artifact.
 const original=fetcher().fn;
 const wrapped=async(url,init)=>{
  if(url.endsWith("/v1/pilot/check")&&init.headers?.authorization==="Bearer "+token)
   return new Response(JSON.stringify({ok:false,error:"SIGNED_PILOT_SAMPLE_NOT_PUBLISHED"}),
    {status:503,headers:{"content-type":"application/json"}});
  return original(url,init);
 };
 await assert.rejects(verifyPredgePilotV2Live({
  base:BASE,fetchImpl:wrapped,researchToken:token}),
  /PREDGE_V2_LIVE_SIGNED_SAMPLE_NOT_LIVE_503/);
});
