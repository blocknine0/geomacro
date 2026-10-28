#!/usr/bin/env node
/**
 * Outside-in, zero-D1-query privacy SLO, not a news/content auditor.
 * No access tokens, payments, source URLs, reviewer records, or PREDGE code.
 * Fail hard on any public/private proof route reopening. Never log bodies.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {verifyPrivateNewsBoundaryLive} from "./verify-private-news-boundary-live.mjs";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const ROUTE="/v1/internal/intelligence-publications";
const BAD_BEARER="f".repeat(64);
async function rejected(fetchImpl,method,headers={}){
 const response=await fetchImpl(ORIGIN+ROUTE,{
  method,redirect:"error",cache:"no-store",
  headers:{Accept:"application/json",...headers},
  signal:AbortSignal.timeout(12_000),
 });
 if(response.status!==404||response.redirected===true)
  throw Error("PRODUCTION_PRIVATE_NEWS_ROUTE_EXPOSED");
 const raw=await response.text();
 if(raw.length>240)throw Error("PRODUCTION_PRIVATE_NEWS_DENIAL_OVERSIZE");
 let doc;
 try{doc=JSON.parse(raw)}catch{throw Error("PRODUCTION_PRIVATE_NEWS_DENIAL_INVALID")}
 if(doc.ok!==false||doc.error!=="NOT_FOUND"||
    Object.keys(doc).sort().join(",")!=="error,ok")
   throw Error("PRODUCTION_PRIVATE_NEWS_DENIAL_INVALID");
 return true;
}
export async function verifyPrivateNewsProductionGuard({fetchImpl=fetch}={}){
 const anonymous=await verifyPrivateNewsBoundaryLive({fetchImpl});
 if(!anonymous.verified||anonymous.anonymous_routes_denied!==2)
   throw Error("PRODUCTION_PRIVATE_NEWS_ANONYMOUS_ROUTE_EXPOSED");
 await rejected(fetchImpl,"GET",{Authorization:"Bearer "+BAD_BEARER});
 await rejected(fetchImpl,"POST",{"Content-Type":"application/json"});
 return Object.freeze({
  schema:"geomacro.production-private-news-security-slo.v1",
  anonymous_paths_denied:2,invalid_bearers_denied:1,
  non_get_denied:1,authenticated_owner_proof_not_accessed:true,
  owner_credentials_used:false,canonical_d1_queries:0,
  original_refs_exposed:false,verification_verdicts_exposed:false,
  predge_endpoint_accessed:false,source_ingestion_modified:false,
  real_payments:0,verified:true
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await verifyPrivateNewsProductionGuard()))}
 catch{console.error("PRODUCTION_PRIVATE_NEWS_SECURITY_SLO_UNVERIFIED");process.exitCode=2}
}
