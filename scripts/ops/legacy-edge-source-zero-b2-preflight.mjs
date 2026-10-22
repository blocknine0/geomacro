#!/usr/bin/env node
/**
 * Old Supabase pre-deletion edge function READ-ONLY source audit.
 * Zero Backblaze calls, zero production writes/deletions and no private
 * source bytes or tokens ever printed, persisted or uploaded to artifacts.
 */
import {createHash} from "node:crypto";
import {classifyDeployedSourceBody} from "./legacy-edge-source-body-format.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
const REF="ldpwajisioljyjtojvfx";
const OUTPUT="artifacts/legacy-exit/legacy-edge-source-readonly-preflight.json";
const NAMES=Object.freeze([
 "live-gdelt-ingest","live-structure-intelligence","live-flash-ingest",
 "live-flash-corroborate","public-risk-indices","public-early-warning",
 "gro-archive-read","gro-archive-maintain","raw-snapshot-read",
 "archive-verify-read",
]);
const report={
 schema:"geomacro.legacy-edge-source-readonly-preflight.v1",
 source_project:REF,checked_at:new Date().toISOString(),
 deployed_source_bodies_accessible:0,deployed_source_body_bytes_fetched:0,
 edge_sources_fully_accessible:false,independent_private_b2_backup_verified:false,
 source_supabase_writes:0,source_supabase_deletes:0,b2_requests:0,
 b2_deletes:0,payments:0,old_supabase_deletion_authorized:false,
 status:"BLOCKED_NO_DELETION",
};
function save(reason) {
 report.reason=reason;
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report));
}
function fail(code) {save(code);process.exitCode=3;}
function classify(response,prefix) {
 if(!response)return prefix+"_NETWORK_OR_TIMEOUT";
 if(response.status===401)return prefix+"_UNAUTHENTICATED";
 if(response.status===403)return prefix+"_PERMISSION_DENIED";
 if(response.status===404)return prefix+"_NOT_FOUND";
 if(response.status===429)return prefix+"_RATE_LIMITED";
 if(!response.ok)return prefix+"_OTHER_HTTP_FAILURE";
 return null;
}
async function get(url,token) {
 try{return await fetch(url,{method:"GET",headers:{
  authorization:"Bearer "+token,accept:"application/json, application/zip, */*"},
  redirect:"error",signal:AbortSignal.timeout(20_000)})
 }catch{return null}
}
async function main() {
 const token=String(process.env.SUPABASE_LEGACY_EDGE_READ_TOKEN||
  process.env.SUPABASE_ACCESS_TOKEN||"").trim();
 if(process.env.SUPABASE_PROJECT_ID!==REF||!token)
  return fail("OLD_EDGE_READONLY_MANAGEMENT_CREDENTIAL_MISSING");
 const root="https://api.supabase.com/v1/projects/"+REF+"/functions";
 const first=await get(root,token);
 const error=classify(first,"DEPLOYED_EDGE_LIST");
 if(error)return fail(error);
 let list;
 try{list=await first.json()}catch{return fail("DEPLOYED_EDGE_LIST_JSON_INVALID")}
 if(!Array.isArray(list)||list.length!==NAMES.length||
    new Set(list.map(f=>f.slug)).size!==NAMES.length||
    list.some(f=>!NAMES.includes(f.slug)))
  return fail("DEPLOYED_EDGE_LIST_MANIFEST_DRIFT");
 if(list.some(f=>f.status!=="ACTIVE"||
    !Number.isSafeInteger(f.version)||f.version<=0||
    typeof f.ezbr_sha256!=="string"||!/^[a-f0-9]{64}$/.test(f.ezbr_sha256)))
  return fail("DEPLOYED_EDGE_VERSION_METADATA_INVALID");
 for(const slug of NAMES){
  const result=await get(root+"/"+encodeURIComponent(slug)+"/body",token);
  const reason=classify(result,"DEPLOYED_EDGE_BODY");
  if(reason)return fail(reason);
  const claimed=Number(result.headers.get("content-length")||0);
  if(claimed>3_000_000)return fail("DEPLOYED_EDGE_BODY_OVER_SIZE_LIMIT");
  let body;
  try{body=Buffer.from(await result.arrayBuffer())}
  catch{return fail("DEPLOYED_EDGE_BODY_UNREADABLE")}
  const classification=classifyDeployedSourceBody(body,result.headers.get("content-type")||"");
  if(!classification.restorable){
   report.unrecognized_first_body_format=classification.kind;
   return fail("DEPLOYED_EDGE_BODY_FORMAT_INVALID");
  }
  report.validated_first_body_format??=classification.kind;
  // Content is intentionally never logged, copied into report or persisted.
  createHash("sha256").update(body).digest("hex");
  report.deployed_source_bodies_accessible++;
  report.deployed_source_body_bytes_fetched+=body.length;
 }
 if(report.deployed_source_bodies_accessible!==10)
  return fail("DEPLOYED_EDGE_BODY_SET_INCOMPLETE");
 report.edge_sources_fully_accessible=true;
 report.status="ALL_TEN_DEPLOYED_EDGE_SOURCES_READABLE_NO_B2_ARCHIVE_CLAIM";
 save("B2_ARCHIVE_AND_LIVE_EDGE_CUTOVER_STILL_NOT_VERIFIED");
}
try{await main()}catch{fail("OLD_EDGE_PREFLIGHT_FAILED_CLOSED")}
