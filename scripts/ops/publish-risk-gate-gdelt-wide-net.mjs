#!/usr/bin/env node
/** Bounded 15-minute GDELT Event export -> CAMEO wide-net -> private D1.
 * Source ZIP MD5 checked by existing GDELT reader before parsing.
 * Producer never stores full event rows, publisher text, or makes risk scores.
 */
import {createHash,createHmac} from "node:crypto";
import {createB2Client} from "./b2-s3-client.mjs";
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {readGdeltStaticArchive} from "../lib/gdelt-gkg-bulk-discovery.mjs";
import {summarizeGdeltRiskEvents,GDELT_RISK_EVENT_SCHEMA}
 from "../../lib/risk-gate-gdelt-event-wide-net.mjs";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
const sha=x=>createHash("sha256").update(x).digest("hex");
export async function publishGdeltRiskEventWideNet({
 rootToken,fetchImpl=fetch,now=new Date(),
 readArchive=readGdeltStaticArchive,b2Client,endpoint=ENDPOINT
}={}){
 if(typeof rootToken!=="string"||rootToken.trim().length<32||
   typeof fetchImpl!=="function"||typeof readArchive!=="function"||
   !b2Client||typeof b2Client.put!=="function"||
   typeof b2Client.get!=="function"||
   !(now instanceof Date)||!Number.isFinite(now.getTime())||endpoint!==ENDPOINT)
   throw Error("RG_GDELT_PRODUCTION_INPUT_INVALID");
 // GitHub push workflows and Control Plane deployment run independently.
 // Wait for the NEW authenticated exact schema before source/B2 activity.
 // This prevents old Worker 422 during cutover and burns no B2 quota.
 const bearer="Bearer "+createHmac("sha256",rootToken.trim())
  .update("geomacro-control-plane-v1").digest("hex");
 let backendReady=false;
 for(let attempt=0;attempt<15;attempt++){
  let ready;
  try{
   ready=await fetchImpl(endpoint+"/v1/internal/risk-gate/gdelt-continuity",{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:bearer},signal:AbortSignal.timeout(15000)
   });
  }catch{
   if(attempt===14)throw Error("RG_GDELT_WORKER_DEPLOY_NOT_READY");
   await new Promise(resolve=>setTimeout(resolve,4000));continue;
  }
  if(ready.status===401||ready.status===403)
   throw Error("RG_GDELT_WORKER_DEPLOY_AUTH_DENIED");
  if(ready.status===200){
   let body=null;
   try{body=await ready.json()}catch{}
   if(body?.ok===true&&
      body.schema==="geomacro.risk-gate-gdelt-continuity.v1"){
    backendReady=true;break;
   }
  }
  if(attempt===14)break;
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 if(!backendReady)throw Error("RG_GDELT_WORKER_DEPLOY_NOT_READY");
 // Strictly bounded pinned ZIP: existing readArchive enforces GDELT host,
 // manifest clock, md5 and compressed/uncompressed byte limits.
 const {decoded,manifest,zipped}=await readArchive({now,kind:"events",max404Fallbacks:4});
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
 // B2 stores ONLY derived bounded, private structured evidence index:
 // original event URLs and raw GDELT ZIP bytes are not stored.
 // This uses two quota-governed B2 requests: PUT then exact GET readback.
 const b2Snapshot={
  schema:"geomacro.gdelt-event-b2-d1-archive.v2",
  provider:"gdelt_v2_15m",batch_at:manifest.batch_at,
  gdelt_zip_archive_sha256:archive_sha256,
  rows_scanned:source.rows_scanned,cameo_shortlisted:source.cameo_shortlisted,
  archived_cameo_event_references:source.archive_candidate_count,
  index_country_fips_counts:source.index_country_fips_counts,
  d1_hot_sample_count:items.length,
  source_event_verification:"INDEX_ONLY",
  commercial_rights_verified:false,customer_delivery_authorized:false,
  independent_event_verified:false,source_publication_time_verified:false,
  archive_truncated:source.archive_truncated,
  // GDELT source index across all CAMEO-qualified rows, not just D1 sample;
  // URL hashes only. Absence of URL means unusable for source verification.
  event_index:source.archive_candidates.map(c=>({
   gdelt_event_id:c.gdelt_event_id,cameo_code:c.cameo_code,
   cameo_root:c.cameo_root,gdelt_index_at:c.gdelt_index_at,
   action_geo_fips:c.action_geo_fips,corridor_hints:c.corridor_hints,
   source_url_sha256:c.source_url===null?null:sha(c.source_url)
  })),
  d1_selected_item_hashes:items.map(x=>x.id)
 };
 if(b2Snapshot.event_index.length!==source.cameo_shortlisted||
    source.archive_truncated!==false)
  throw Error("RG_GDELT_B2_ARCHIVE_INCOMPLETE");
 const b2Bytes=Buffer.from(JSON.stringify(b2Snapshot),"utf8");
 if(b2Bytes.length>16000000)
  throw Error("RG_GDELT_B2_SNAPSHOT_TOO_LARGE");
 const b2Hash=sha(b2Bytes);
 const b2Key="geomacro-evidence/v1/private/gdelt-event-wide-net/"+
  manifest.batch_at.replace(/\D/gu,"").slice(0,12)+"/"+b2Hash+".json";
 await b2Client.put(b2Key,b2Bytes);
 const b2Got=Buffer.from(await b2Client.get(b2Key));
 if(sha(b2Got)!==b2Hash||!b2Got.equals(b2Bytes))
  throw Error("RG_GDELT_B2_EXACT_READBACK_FAILED");
 packet.b2_archive_key=b2Key;
 packet.b2_manifest_sha256=b2Hash;
 packet.b2_exact_readback_verified=true;
 packet.b2_archived_event_count=source.archive_candidate_count;
 packet.b2_archive_complete=true;

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
  ack.b2_archive_key!==b2Key||ack.b2_manifest_sha256!==b2Hash||
  ack.b2_exact_readback_verified!==true||
  ack.b2_archived_event_count!==source.archive_candidate_count||
  ack.batch_receipt_verified!==true||
  ack.verified_event_count!==0||ack.signed_gro_generated!==false||
  ack.chargeable!==false||ack.customer_credits_debited!==0||
  ack.risk_gate_paid_delivery_enabled!==false||ack.retention_hours!==72||
  ack.website_intelligence_writes!==0||ack.predge_writes!==0)
   throw Error("RG_GDELT_D1_PROVENANCE_READBACK_INVALID");
 // The newest global batch may advance while this batch is completing.
 // Independently read the exact immutable B2+D1 receipt by batch ID.
 const exactUrl=endpoint+"/v1/internal/risk-gate/gdelt-batch-receipt?batch_at="+
  encodeURIComponent(manifest.batch_at);
 const exactResponse=await fetchImpl(exactUrl,{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:bearer},signal:AbortSignal.timeout(15000)
 });
 if(exactResponse.status!==200)
  throw Error("RG_GDELT_EXACT_BATCH_READBACK_HTTP_"+exactResponse.status);
 const exactReceipt=await exactResponse.json();
 if(exactReceipt.ok!==true||
  exactReceipt.schema!=="geomacro.risk-gate-gdelt-exact-batch-receipt.v1"||
  exactReceipt.exact_batch_receipt_verified!==true||
  exactReceipt.batch_at!==manifest.batch_at||
  exactReceipt.archive_sha256!==archive_sha256||
  exactReceipt.b2_archive_key!==b2Key||
  exactReceipt.b2_manifest_sha256!==b2Hash||
  exactReceipt.b2_archived_event_count!==source.archive_candidate_count||
  exactReceipt.d1_hot_sample_count!==items.length||
  exactReceipt.independent_event_verified!==false||
  exactReceipt.signed_gro_generated!==false||
  exactReceipt.chargeable!==false)
  throw Error("RG_GDELT_EXACT_BATCH_RECEIPT_MISMATCH");
 // Still require the global source lane to be genuinely fresh; a later
 // independently verified 15-minute batch is not a false failure.
 const status=await fetchImpl(endpoint+"/v1/internal/risk-gate/gdelt-continuity",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:bearer},signal:AbortSignal.timeout(15000)
 });
 if(status.status!==200)throw Error("RG_GDELT_CONTINUITY_HTTP_"+status.status);
 const latest=await status.json();
 const latestAt=Date.parse(String(latest?.last_verified_batch_at??""));
 const currentAt=Date.parse(manifest.batch_at);
 const sameBatch=latest.last_verified_batch_at===manifest.batch_at;
 if(latest.schema!=="geomacro.risk-gate-gdelt-continuity.v1"||
  latest.ok!==true||latest.healthy!==true||
  !Number.isFinite(latestAt)||latestAt<currentAt||
  (sameBatch&&(latest.last_b2_manifest_sha256!==b2Hash||
    latest.last_b2_archived_events!==source.archive_candidate_count)))
   throw Error("RG_GDELT_FRESHNESS_READBACK_MISMATCH");
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
  b2_archive_key:b2Key,b2_manifest_sha256:b2Hash,
  b2_exact_readback:true,
  rows_scanned:source.rows_scanned,cameo_shortlisted:source.cameo_shortlisted,
  geolocated_strategic_route_candidates:source.route_hint_count,
  b2_archived_cameo_event_references:source.archive_candidate_count,
  b2_archive_complete:source.archive_truncated===false,
  batch_freshness_verified:true,
  d1_hot_sample_count:items.length,
  event_index_country_count:source.index_country_fips_counts.length,
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
  if(process.env.GITHUB_ACTIONS!=="true"||
    process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="gdelt_v2_event_sync"||
    process.env.B2_REQUEST_BUDGET!=="4"||
    !process.env.B2_KEY_ID||!process.env.B2_APPLICATION_KEY||
    !process.env.CLOUDFLARE_API_TOKEN||
    !process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.D1_DATABASE_ID)
   throw Error("RG_GDELT_B2_D1_GOVERNANCE_REQUIRED");
  const b2=createB2Client({
   endpointUrl:"https://s3.us-east-005.backblazeb2.com",
   accessKey:process.env.B2_KEY_ID,
   secretKey:process.env.B2_APPLICATION_KEY,
   bucket:"geomacro-private-archive"
  });
  const receipt=await publishGdeltRiskEventWideNet({
   rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN,b2Client:b2
  });
  writeFileSync("artifacts/direct-corridor-intake/risk-gate-gdelt-wide-net.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
 }catch(e){console.error("::error::"+String(e?.message??"RG_GDELT_UNAVAILABLE").slice(0,120));
  process.exitCode=2}
}
