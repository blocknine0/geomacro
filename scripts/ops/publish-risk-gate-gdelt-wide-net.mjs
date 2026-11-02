#!/usr/bin/env node
/** Bounded 15-minute GDELT Event export -> CAMEO wide-net -> private D1.
 * Source ZIP MD5 checked by existing GDELT reader before parsing.
 * Producer never stores full event rows, publisher text, or makes risk scores.
 */
import {createHash,createHmac} from "node:crypto";
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {readGdeltStaticArchive} from "../lib/gdelt-gkg-bulk-discovery.mjs";
import {summarizeGdeltRiskEvents,GDELT_RISK_EVENT_SCHEMA}
 from "../../lib/risk-gate-gdelt-event-wide-net.mjs";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
const sha=x=>createHash("sha256").update(x).digest("hex");
export async function publishGdeltRiskEventWideNet({
 rootToken,fetchImpl=fetch,now=new Date(),
 readArchive=readGdeltStaticArchive,endpoint=ENDPOINT
}={}){
 if(typeof rootToken!=="string"||rootToken.trim().length<32||
   typeof fetchImpl!=="function"||typeof readArchive!=="function"||
   !(now instanceof Date)||!Number.isFinite(now.getTime())||endpoint!==ENDPOINT)
   throw Error("RG_GDELT_PRODUCTION_INPUT_INVALID");
 // Strictly bounded pinned ZIP: existing readArchive enforces GDELT host,
 // manifest clock, md5 and compressed/uncompressed byte limits.
 const {decoded,manifest,zipped}=await readArchive({now,kind:"events"});
 if(typeof decoded!=="string"||!Buffer.isBuffer(zipped)||
   !manifest?.batch_at||manifest.expected_bytes!==zipped.length||
   createHash("md5").update(zipped).digest("hex")!==manifest.expected_md5)
   throw Error("RG_GDELT_ARCHIVE_MANIFEST_MISMATCH");
 const source=summarizeGdeltRiskEvents(decoded,manifest.batch_at,now.getTime());
 const archive_sha256=sha(zipped);
 const items=source.candidates.map(c=>{
  if(typeof c.source_url!=="string")throw Error("RG_GDELT_CANDIDATE_NO_ORIGINAL");
  const source_url_sha256=sha(c.source_url);
  return {
   id:sha(["gdelt_v2_15m",c.gdelt_event_id,c.gdelt_batch_at,
    source_url_sha256].join("\x1f")),
   gdelt_event_id:c.gdelt_event_id,cameo_code:c.cameo_code,
   cameo_root:c.cameo_root,gdelt_index_at:c.gdelt_index_at,
   gdelt_batch_at:c.gdelt_batch_at,action_geo_fips:c.action_geo_fips,
   corridor_hints:c.corridor_hints,source_url_sha256,archive_sha256,
   source_evidence_verified:false,event_verified:false,
   commercial_rights_verified:false,signed_gro_generated:false,
   chargeable:false
  };
 });
 const packet={
  schema:GDELT_RISK_EVENT_SCHEMA,
  checked_at:now.toISOString(),batch_at:manifest.batch_at,
  provider:"gdelt_v2_15m",source_event_verification:"INDEX_ONLY",
  commercial_rights_verified:false,customer_debit_enabled:false,predge_writes:0,
  archive_sha256,items
 };
 const bearer="Bearer "+createHmac("sha256",rootToken.trim())
  .update("geomacro-control-plane-v1").digest("hex");
 let response;
 for(let attempt=0;attempt<5;attempt++){
  try{response=await fetchImpl(endpoint+"/v1/internal/risk-gate/gdelt-event-index",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{Authorization:bearer,"Content-Type":"application/json"},
   body:JSON.stringify(packet),signal:AbortSignal.timeout(15000)
  })}catch{throw Error("RG_GDELT_D1_NETWORK_UNAVAILABLE")}
  if(response.status===200)break;
  if(![404,405,503].includes(response.status)||attempt===4)
    throw Error("RG_GDELT_D1_PUT_HTTP_"+response.status);
  await new Promise(done=>setTimeout(done,(attempt+1)*5000));
 }
 let ack;try{ack=await response.json()}catch{throw Error("RG_GDELT_D1_ACK_UNPARSEABLE")}
 if(ack.ok!==true||ack.schema!=="geomacro.risk-gate-gdelt-d1-acceptance.v1"||
  ack.shortlisted!==items.length||ack.exact_d1_readback!==items.length||
  ack.source_zip_integrity_proof!==archive_sha256||
  ack.verified_event_count!==0||ack.signed_gro_generated!==false||
  ack.chargeable!==false||ack.customer_credits_debited!==0||
  ack.risk_gate_paid_delivery_enabled!==false||ack.retention_hours!==72||
  ack.website_intelligence_writes!==0||ack.predge_writes!==0)
   throw Error("RG_GDELT_D1_PROVENANCE_READBACK_INVALID");
 const get=await fetchImpl(endpoint+"/v1/internal/risk-gate/gdelt-event-index?limit=40",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:bearer},signal:AbortSignal.timeout(15000)
 });
 if(get.status!==200)throw Error("RG_GDELT_D1_GET_HTTP_"+get.status);
 let observed;try{observed=await get.json()}catch{throw Error("RG_GDELT_D1_GET_UNPARSEABLE")}
 if(observed.ok!==true||observed.provider!=="gdelt_v2_15m"||
  !Array.isArray(observed.entries)||observed.count!==observed.entries.length||
  observed.independent_event_verified!==false||
  observed.chargeable!==false||observed.customer_debit_enabled!==false)
  throw Error("RG_GDELT_D1_GET_INVALID");
 return {
  schema:"geomacro.risk-gate-gdelt-wide-net-production-acceptance.v1",
  checked_at:now.toISOString(),batch_at:manifest.batch_at,
  zipped_archive_sha256:archive_sha256,
  rows_scanned:source.rows_scanned,cameo_shortlisted:source.cameo_shortlisted,
  geolocated_strategic_route_candidates:source.route_hint_count,
  d1_shortlist_records_verified:ack.exact_d1_readback,
  readback_valid:true,source_records_for_verification_only:true,
  verified_events:0,source_event_time_confirmed:false,
  signed_gro_generated:false,paid_gate_enabled:false,
  credits_debited:0,chargeable:false,predge_writes:0
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
   throw Error("RG_GDELT_MAIN_ONLY");
  const receipt=await publishGdeltRiskEventWideNet({
   rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/risk-gate-gdelt-wide-net.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
 }catch(e){console.error("::error::"+String(e?.message??"RG_GDELT_UNAVAILABLE").slice(0,120));
  process.exitCode=2}
}
