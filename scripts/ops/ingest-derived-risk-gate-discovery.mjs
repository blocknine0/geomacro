#!/usr/bin/env node
/**
 * GeoMacro Step 2: every 20-minute main-only cycle consumes the five existing
 * D1-backed ingestion lanes and persists RIGHTS-UNVERIFIED discovery signals.
 * No new publisher GET, raw publisher text, payment, score or GRO signing.
 * Each page is rechecked and atomically committed by the protected Worker.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {deriveControlPlaneRootToken}
 from "./derive-control-plane-root-token.mjs";
import {DERIVED_DISCOVERY_BRIDGE_SCHEMA,DERIVED_DISCOVERY_LANES}
 from "../../workers/control-plane/src/derived-risk-gate-discovery-bridge.mjs";
import {reviewDerivedRiskGateBatch}
 from "../lib/official-original-issuer-rights.mjs";

const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const PATH="/v1/internal/risk-gate/derived-discovery";
const PAGE_CAP=250; // 25,000 metadata-only records per lane per tick
const SHA=/^[a-f0-9]{64}$/u;
const CATS=["geopolitics","macro","rare_earth"];
const mainOnly=process.env.GITHUB_ACTIONS==="true"&&
 process.env.GITHUB_REPOSITORY==="blocknine0/geomacro"&&
 process.env.GITHUB_REF==="refs/heads/main"&&
 ["schedule","workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME);
if(!mainOnly)throw Error("DERIVED_DISCOVERY_PROTECTED_MAIN_ONLY");
const token=deriveControlPlaneRootToken(
 process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN);
const headers={
 "Authorization":"Bearer "+token,"Accept":"application/json",
 "Cache-Control":"no-store",
};
const stats=Object.fromEntries(DERIVED_DISCOVERY_LANES.map(lane=>[lane,{
 scanned:0,admitted:0,pages:0,retention_gaps:0,
 categories:Object.fromEntries(CATS.map(c=>[c,0])),
}]));
async function call(method,url,body){
 const r=await fetch(url,{method,redirect:"error",cache:"no-store",
  headers:method==="POST"?{...headers,"Content-Type":"application/json"}:headers,
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(20000)});
 if(r.status!==200)throw Error("DERIVED_DISCOVERY_PROTECTED_"+method+"_HTTP_"+r.status);
 const raw=await r.text();
 if(raw.length>60000)throw Error("DERIVED_DISCOVERY_OVERSIZE_RECEIPT");
 let value;try{value=JSON.parse(raw)}catch{
  throw Error("DERIVED_DISCOVERY_INVALID_RECEIPT");
 }
 if(value?.ok!==true||value.schema!==DERIVED_DISCOVERY_BRIDGE_SCHEMA)
  throw Error("DERIVED_DISCOVERY_UNVERIFIED_RECEIPT");
 return value;
}
function assertPage(page,lane){
 if(page.lane!==lane||!Array.isArray(page.records)||page.records.length>100||
    page.rights_verified!==false||page.original_text_included!==false||
    page.commercialEligible!==false||page.paidDeliveryAuthorized!==false||
    !SHA.test(page.page_sha256)||!Number.isFinite(Date.parse(page.checked_at))||
    typeof page.has_more!=="boolean")
  throw Error("DERIVED_DISCOVERY_PAGE_CONTRACT_FAILED");
 const ids=new Set();
 for(const r of page.records){
  if(!SHA.test(r?.original_ref)||!SHA.test(r.source_sha)||
     typeof r.first_seen_at!=="string"||
     !Number.isFinite(Date.parse(r.first_seen_at))||
     typeof r.observed_clock!=="string"||
     !CATS.includes(r.category)||ids.has(r.original_ref))
   throw Error("DERIVED_DISCOVERY_UNTRUSTED_SOURCE_ROW");
  ids.add(r.original_ref);
 }
 if(page.has_more&&page.records.length!==100)
  throw Error("DERIVED_DISCOVERY_BROKEN_PAGE");
 if(page.records.length===0&&page.next_cursor!==null)
  throw Error("DERIVED_DISCOVERY_EMPTY_CURSOR_INVALID");
 if(page.records.length>0&&
    (!page.next_cursor||!(lane==="website_intelligence"?
      /^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(page.next_cursor.cursor_ref):
      SHA.test(page.next_cursor.cursor_ref))))
  throw Error("DERIVED_DISCOVERY_CURSOR_INVALID");
}
function review(page,lane){
 // This runner has no original-item use-term proof or independent fact audit.
 // Deliberately pass NO inferred rights flags or fabricated event/score.
 const input=page.records.map(r=>({
   sourceId:lane==="gdelt_cameo"?
     "gdelt_project_event_metadata":"ingested_private_"+lane,
   countryIso3:r.country_iso3??undefined,
 }));
 const result=reviewDerivedRiskGateBatch(input);
 if(result.scanned!==input.length||result.candidates.length!==0||
    result.reviews.length!==input.length||
    result.reviews.some(r=>r.status!=="HOLD_SOURCE_ACCESS_OR_EXPRESSION"||
      r.commercialEligible!==false||r.storeRawText!==false||
      r.publishOriginalArticle!==false||r.paidDeliveryAuthorized!==false))
  throw Error("DERIVED_DISCOVERY_RIGHTS_POLICY_CHANGED");
 return page.records.map((r,i)=>({
  original_ref:r.original_ref,
  status:result.reviews[i].status,
  commercialEligible:false,
 }));
}
async function run(){
 for(const lane of DERIVED_DISCOVERY_LANES){
  let finished=false;
  for(let pageNo=0;pageNo<PAGE_CAP;pageNo++){
   const page=await call("GET",ROOT+PATH+"?lane="+lane);
   assertPage(page,lane);
   const total=stats[lane];
   total.pages++;
   if(page.coverage_gap_detected)total.retention_gaps++;
   if(!page.records.length){finished=true;break;}
   const reviewed=review(page,lane);
   const ack=await call("POST",ROOT+PATH,{
    schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,lane,
    page_sha256:page.page_sha256,checked_at:page.checked_at,
    next_cursor:page.next_cursor,reviewed,
   });
   if(ack.lane!==lane||ack.admitted!==page.records.length||
      ack.d1_atomic_readback_verified!==true||
      ack.cursor_advanced!==true||ack.commercialEligible!==false||
      ack.paidDeliveryAuthorized!==false)
    throw Error("DERIVED_DISCOVERY_D1_ACK_MISMATCH");
   total.scanned+=page.records.length;
   total.admitted+=ack.admitted;
   for(const x of page.records)total.categories[x.category]++;
   if(!page.has_more){finished=true;break;}
  }
  if(!finished)throw Error("DERIVED_DISCOVERY_LANE_PAGE_CAP_EXCEEDED_"+lane);
 }
 const pruned=await call("POST",ROOT+PATH,{
  schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,operation:"PRUNE_DISCOVERY_72H",
 });
 if(pruned.pruned_retention_hours!==72||pruned.expired_rows_remaining!==0||
    pruned.raw_archives_modified!==false||pruned.commercialEligible!==false)
  throw Error("DERIVED_DISCOVERY_PRUNE_UNVERIFIED");
 const summary={
  schema:"geomacro.derived-risk-discovery-20m-cycle.v1",
  ok:true,root_admin_only:true,
  original_content_exported:false,independent_event_verified:false,
  commercial_activation:false,paid_delivery:false,signed_gro:false,
  new_publisher_fetches:0,discovery_retention_hours:72,
  categories_covered:CATS,
  all_lanes_processed:true,
  per_lane:stats,
 };
 const output=process.env.GEOMACRO_DERIVED_DISCOVERY_SUMMARY_PATH;
 if(output){
  const p=resolve(output);
  mkdirSync(dirname(p),{recursive:true});
  writeFileSync(p,JSON.stringify(summary,null,2)+"\n",{mode:0o600});
 }
 console.log(JSON.stringify(summary));
}
run().catch(error=>{
 // Print bounded error codes only, never URLs/bodies/private source identity.
 const value=String(error?.message??"FAILED");
 const safe=/^[A-Z][A-Z0-9_]{3,100}$/u.test(value)?value:
  "DERIVED_DISCOVERY_UNEXPECTED_FAILURE";
 console.error(safe);
 process.exitCode=1;
});
