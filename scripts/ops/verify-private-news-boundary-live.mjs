#!/usr/bin/env node
// Zero-D1-query anonymous negative production proof: never send credentials,
// never log returned bodies, raw sources, reviewer metadata or verification.
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const PATHS=["/v1/public/intelligence-publications",
 "/v1/internal/intelligence-publications"];
export async function verifyPrivateNewsBoundaryLive({fetchImpl=fetch}={}){
 let denials=0;
 for(const path of PATHS){
  const response=await fetchImpl(ORIGIN+path,{method:"GET",
   redirect:"error",cache:"no-store",
   headers:{Accept:"application/json","Cache-Control":"no-cache"},
   signal:AbortSignal.timeout(12000)});
  if(response.status!==404||response.redirected)
   throw Error("PRIVATE_NEWS_PUBLIC_ACCESS_NOT_DENIED");
  if(Number(response.headers.get("content-length")??0)>250)
   throw Error("PRIVATE_NEWS_DENIAL_OVERSIZE");
  const body=await response.text();
  if(body.length>250)throw Error("PRIVATE_NEWS_DENIAL_OVERSIZE");
  let doc;
  try{doc=JSON.parse(body)}catch{throw Error("PRIVATE_NEWS_DENIAL_INVALID")}
  if(doc.ok!==false||doc.error!=="NOT_FOUND"||
   Object.keys(doc).sort().join(",")!=="error,ok")
   throw Error("PRIVATE_NEWS_DENIAL_INVALID");
  denials++;
 }
 return {schema:"geomacro.private-news-proof-public-denial.v1",
   verified:denials===2,anonymous_routes_denied:denials,
   canonical_d1_sql_issued:0,original_refs_logged:0,
   private_review_verdicts_logged:0,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await verifyPrivateNewsBoundaryLive()))}
 catch{console.error("PRIVATE_NEWS_PROOF_BOUNDARY_LIVE_UNVERIFIED");process.exitCode=2}
}
