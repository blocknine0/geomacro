#!/usr/bin/env node
/**
 * Read-only 3-domain production source SLO canary: one pinned public D1 GET.
 * Designed for the EXISTING hourly quota observatory; no new cron, credentials,
 * cache busting, new D1/B2 writes, PREDGE calls or accepted paid output.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {evaluateProductionSourceContinuity} from "../lib/production-source-continuity-evaluator.mjs";

const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-continuity";
const OUTPUT="artifacts/d1-launch-hourly/source-continuity.json";
const LIMIT=750000;
export async function observeProductionSourceContinuity({fetchImpl=fetch,now=new Date()}={}){
 const basic={schema:"geomacro.production-source-continuity-observation.v1",
   observed_at:now.toISOString(), endpoint:"FIRST_PARTY_CANONICAL_D1_CONTINUITY",
   health:"NOT_VERIFIED",upstream_sla_guaranteed:false,
   all_three_paid_signed_categories_verified:false,
   predge_changed:false,paid_delivery_activated:false,source_content_logged:false,
   http_status:null,reason:null,categories:null};
 try{
  const response=await fetchImpl(ENDPOINT,{method:"GET",redirect:"error",
   headers:{Accept:"application/json","Cache-Control":"no-cache"},
   signal:AbortSignal.timeout(11000)});
  basic.http_status=response.status;
  if(response.status!==200)throw Error(response.status===503?
    "D1_QUOTA_OR_CONTINUITY_503":"SOURCE_CONTINUITY_HTTP_UNAVAILABLE");
  if(response.headers.get("content-type")?.includes("application/json")!==true)
    throw Error("SOURCE_CONTINUITY_CONTENT_TYPE_INVALID");
  if(Number(response.headers.get("content-length")||0)>LIMIT)
    throw Error("SOURCE_CONTINUITY_BODY_TOO_LARGE");
  const body=await response.text();
  if(body.length>LIMIT)throw Error("SOURCE_CONTINUITY_BODY_TOO_LARGE");
  const checked=evaluateProductionSourceContinuity(JSON.parse(body),{now});
  return {...basic,...checked,
    health:checked.all_three_source_checks_current?"THREE_DOMAIN_SOURCE_CHECKS_CURRENT":
      "DEGRADED_SOME_SOURCE_CHECKS_STALE",
    reason:checked.all_three_source_checks_current?null:"SOURCE_CHECK_FRESHNESS_GAP"};
 }catch(error){
  const code=String(error?.message??"SOURCE_CONTINUITY_NETWORK_ERROR");
  return {...basic,health:"SOURCE_READBACK_UNAVAILABLE",
    reason:/^(?:D1_QUOTA_OR_CONTINUITY_503|SOURCE_CONTINUITY_[A-Z_]+)$/u.test(code)?code:
      "SOURCE_CONTINUITY_NETWORK_OR_CONTRACT_ERROR"};
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const receipt=await observeProductionSourceContinuity();
 mkdirSync("artifacts/d1-launch-hourly",{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({health:receipt.health,reason:receipt.reason,
   status:receipt.http_status,category_states:receipt.categories?
     Object.fromEntries(Object.entries(receipt.categories).map(([key,v])=>[key,v.status])):null,
   upstream_sla_guaranteed:false,paid_delivery_activated:false}));
 if(receipt.health!=="THREE_DOMAIN_SOURCE_CHECKS_CURRENT"){
   console.log("::warning title=Source continuity not fully current::"+receipt.health);
   // Keep D1 quota evidence observer independent; fail-closed report is archived.
   if(process.argv.includes("--strict"))process.exitCode=2;
 }
}
