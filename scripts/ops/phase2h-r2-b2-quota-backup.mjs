#!/usr/bin/env node
/**
 * Main-only, protected, B2-independent private R2 archival continuity.
 * Canonical originals are fetched ONLY through existing authenticated
 * Phase2H D1-only export. Only MINIMAL DERIVED Risk Gate facts are stored
 * using Brotli quality 11 + AES-256-GCM in existing private R2, then GET,
 * authenticated decrypt and byte equality are required. HMAC-bound cursor
 * makes each UTC-hour compact bundle discoverable without enumeration.
 *
 * A verified R2 backup NEVER implies B2 ACK, full B2 object inventory,
 * paid-source rights, migration completion, Worker promotion or HOLD release.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {deriveControlPlaneRootToken}
 from "./derive-control-plane-root-token.mjs";
import {validPrivateRawNews}
 from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
import {shadowR2ObjectUrl}
 from "../lib/d1-step3-shadow-pointer-seed.mjs";
import {verifyPermanentRiskColdR2Lifecycle}
 from "../lib/phase2h-risk-minimum-r2-lifecycle.mjs";
import {
 PHASE2H_R2_BACKUP_PREFIX,PHASE2H_R2_CURSOR_KEY,phase2hBackupSourceRows,
 openPhase2hBackupCursor,sealPhase2hBackupCursor,
 sealPhase2hR2Backup,openPhase2hR2Backup,
 } from "../lib/phase2h-b2-r2-backup.mjs";
import {minimumRiskFactsFromOriginals,minimumFactId,minimumFactClock}
 from "../lib/phase2h-risk-gate-minimum-facts.mjs";

const SHA=/^[a-f0-9]{40}$/u;
const BUCKET=/^[a-z0-9][a-z0-9-]{2,62}$/u;
const LIMIT=25;
const MAX_BODY=600_000;
const NOW_BACKUP_ENDPOINT=
 "https://geomacro-control-plane.daspallab202391.workers.dev";
const repo="blocknine0/geomacro";
const fail=s=>{throw Error("PHASE2H_R2_BACKUP_"+s)};
const sha=b=>createHash("sha256").update(b).digest("hex");
const redacted=e=>{
 const message=String(e?.message??"");
 return /^PHASE2H_R2_BACKUP_[A-Z0-9_]{3,100}$/u.test(message)?
  message:"PHASE2H_R2_BACKUP_PROVIDER_OR_INTEGRITY_UNKNOWN";
};
function admission(env,now){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!==repo||
    env.GITHUB_REF!=="refs/heads/main"||
    !["schedule","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)||
    !SHA.test(env.GITHUB_SHA??"")||
    !BUCKET.test(env.GEOMACRO_D1_RECOVERY_R2_BUCKET??"")||
    env.GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED!=="YES"||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32||
    !Number.isFinite(now?.getTime?.()))
  fail("EXACT_MAIN_PRIVATE_BUCKET_GUARD_REQUIRED");
 return true;
}
async function exactMain(env,fetchImpl){
 const token=String(env.GITHUB_TOKEN??"");
 if(token.length<20)fail("GITHUB_TOKEN_REQUIRED");
 let response;
 try{response=await fetchImpl(
  "https://api.github.com/repos/"+repo+"/branches/main",{
  method:"GET",redirect:"error",headers:{
   Authorization:"Bearer "+token,
   Accept:"application/vnd.github+json"
  },signal:AbortSignal.timeout(15000)})}
 catch{fail("GITHUB_MAIN_PROVIDER_UNAVAILABLE")}
 if(!response||response.status!==200||response.redirected)
  fail("GITHUB_MAIN_NOT_VERIFIED");
 let body;
 try{body=await response.json()}catch{fail("GITHUB_MAIN_INVALID")}
 if(body?.commit?.sha!==env.GITHUB_SHA||body?.name!=="main")
  fail("EXACT_MAIN_MOVED");
 return true;
}
async function privateBucket(env,fetchImpl){
 const url="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/r2/buckets/"+
  env.GEOMACRO_D1_RECOVERY_R2_BUCKET;
 let res;
 try{res=await fetchImpl(url,{
  method:"GET",redirect:"error",
  headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN},
  signal:AbortSignal.timeout(15000)
 })}catch{fail("R2_PRIVATE_BUCKET_PROVIDER_UNAVAILABLE")}
 if(res?.status!==200||res.redirected)fail("R2_PRIVATE_BUCKET_NOT_VERIFIED");
 let body;try{body=await res.json()}catch{fail("R2_BUCKET_JSON_INVALID")}
 if(body?.success!==true||
    body.result?.name!==env.GEOMACRO_D1_RECOVERY_R2_BUCKET)
  fail("R2_PRIVATE_BUCKET_IDENTITY_MISMATCH");
 // Public exposure is independently checked in the protected workflow.
 return true;
}
async function readExport(env,fetchImpl,cursor){
 const params=new URLSearchParams({limit:String(LIMIT)});
 if(cursor){
  params.set("archive_cursor_clock",cursor.last_clock);
  params.set("archive_cursor_id",cursor.last_id);
 }
 const token=deriveControlPlaneRootToken(
  env.GEOMACRO_COMMERCE_LEDGER_TOKEN);
 let res;
 try{res=await fetchImpl(
  NOW_BACKUP_ENDPOINT+"/v1/internal/phase2h-raw-archive-export-v2?"+params,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token},
   signal:AbortSignal.timeout(15000)
  })}catch{fail("ORIGINAL_EXPORT_PROVIDER_UNAVAILABLE")}
 if(res?.status!==200||res.redirected)
  fail("ORIGINAL_EXPORT_NOT_200");
 let body;try{body=await res.json()}catch{fail("ORIGINAL_EXPORT_JSON_INVALID")}
 if(body?.ok!==true||
    body.schema!=="geomacro.phase2h.private-raw-archive-export-v2.v1"||
    !Array.isArray(body.rows)||body.rows.length>LIMIT||
    body.scanned_count>LIMIT||
    !Number.isSafeInteger(body.scanned_count)||
    typeof body.scan_complete!=="boolean"||
    body.paid_eligible!==false||body.rights_verified!==false||
    body.raw_public_delivery!==false||body.payments!==0)
  fail("ORIGINAL_EXPORT_SCHEMA_UNVERIFIED");
 if(body.rows.length!==body.scanned_count-
    body.rejected_unverified_or_expired_count)
  fail("ORIGINAL_EXPORT_REJECTIONS_NOT_RECONCILED");
 const now=Date.now();
 for(const row of body.rows){
  // This is the same original/5-part validator used by the live Worker.
  try{await validPrivateRawNews(row,now,false)}
  catch{fail("AUTHENTICATED_ORIGINAL_INVALID")}
 }
 return body;
}
async function r2Call(method,key,env,fetchImpl,body){
 if(!["GET","PUT"].includes(method)||!key.startsWith(
   PHASE2H_R2_BACKUP_PREFIX))
  fail("R2_OBJECT_SCOPE_INVALID");
 if(method==="PUT"&&(!Buffer.isBuffer(body)||body.length<1||
    body.length>MAX_BODY))fail("R2_PUT_LIMIT_INVALID");
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_D1_RECOVERY_R2_BUCKET,key);
 let r;try{r=await fetchImpl(url,{
  method,redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
   ...(method==="PUT"?{"Content-Type":"application/octet-stream"}:{})},
  ...(method==="PUT"?{body}:{}),
  signal:AbortSignal.timeout(20000)
 })}catch{fail("R2_PROVIDER_UNAVAILABLE")}
 if(r?.redirected)fail("R2_PROVIDER_REDIRECT");
 if(method==="GET"&&r?.status===404)return null;
 if(r?.status!==200&&r?.status!==201&&
    !(method==="PUT"&&r?.status===204))
  fail("R2_HTTP_NOT_SUCCESS");
 if(method==="PUT"){
  let reply;
  try{reply=await r.json()}catch{fail("R2_PUT_RECEIPT_INVALID")}
  if(reply?.success!==true||
     reply.result?.key!==undefined&&reply.result.key!==key||
     reply.result?.size!==undefined&&
      Number(reply.result.size)!==body.length)
   fail("R2_PUT_ACK_UNVERIFIED");
  return true;
 }
 const arr=Buffer.from(await r.arrayBuffer());
 if(arr.length<1||arr.length>MAX_BODY)
  fail("R2_READBACK_BODY_INVALID");
 return arr;
}
export async function backupPhase2hPrivateOriginals({
 env=process.env,now=new Date(),fetchImpl=fetch,
 readExportImpl=readExport,storage=r2Call,validateBucket=privateBucket,
 validateLifecycle=verifyPermanentRiskColdR2Lifecycle
}={}){
 admission(env,now);
 await exactMain(env,fetchImpl);
 await validateBucket(env,fetchImpl);
 const lifecycle=await validateLifecycle({env,fetchImpl});
 if(lifecycle?.status!=="PROVIDER_NO_COLD_PREFIX_AUTO_DELETE_RULES"||
    lifecycle?.no_matching_auto_deletion!==true)
  fail("COLD_R2_LIFECYCLE_NOT_PROVEN_PERMANENT");
 const secretB64=env.GEOMACRO_D1_RECOVERY_AES256_KEY_B64;
 const state=await storage("GET",PHASE2H_R2_CURSOR_KEY,env,fetchImpl);
 const cursor=state?openPhase2hBackupCursor({body:state,secretB64}):null;
 if(cursor){
  // Prove previous cursor still addresses exactly a genuinely readable
  // AES-GCM object before advancing the canonical D1 keyset.
  const old=await storage("GET",cursor.object_key,env,fetchImpl);
  if(!old||sha(old)!==cursor.object_sha256)
   fail("PRIOR_BACKUP_PHYSICAL_POINTER_MISSING");
  const verified=openPhase2hR2Backup({
   body:old,secretB64,expectedHour:cursor.hour,
   expectedSha:cursor.source_sha
  });
  if(minimumFactId(verified.records.at(-1))!==cursor.last_id||
     minimumFactClock(verified.records.at(-1))!==cursor.last_clock)
   fail("PRIOR_BACKUP_KEYSET_CURSOR_DIVERGED");
 }
 const answer=await readExportImpl(env,fetchImpl,cursor);
 if(answer.rows.length===0){
  return Object.freeze({
   status:"HOLD_NO_VERIFIED_ORIGINALS_AVAILABLE_FOR_BACKUP",
   backed_up_originals:0,existing_cursor_verified:cursor!==null,
   b2_ack_verified:false,b2_inventory_proven:false,canary_hold_removed:false
  });
 }
 const source=phase2hBackupSourceRows(answer.rows,now);
 const expectedFacts=minimumRiskFactsFromOriginals(source);
 const plan=sealPhase2hR2Backup({
  rows:source,now,sourceSha:env.GITHUB_SHA,secretB64
 });
 const found=await storage("GET",plan.key,env,fetchImpl);
 let archivedSourceSha=env.GITHUB_SHA;
 if(found){
  // A previous immutable main may have archived this SAME hour. Verify
  // actual AEAD, exact derived fact rows and frozen source provenance;
  // never rewrite just because a later, independently reviewed main merged.
  const old=openPhase2hR2Backup({
   body:found,secretB64,expectedHour:plan.hour
  });
  if(JSON.stringify(old.records)!==JSON.stringify(expectedFacts))
   fail("EXISTING_HOUR_MINIMUM_FACTS_CHANGED");
  archivedSourceSha=old.source_sha;
 }else{
  // At most ONE bundle PUT per UTC-hour, after authenticated original export.
  await exactMain(env,fetchImpl);
  await storage("PUT",plan.key,env,fetchImpl,plan.body);
 }
 const physical=await storage("GET",plan.key,env,fetchImpl);
 const trustedBytes=found??plan.body;
 const trustedSha=sha(trustedBytes);
 if(!physical||sha(physical)!==trustedSha||
    !physical.equals(trustedBytes))
  fail("INDEPENDENT_PRIVATE_R2_READBACK_MISMATCH");
 const restored=openPhase2hR2Backup({
  body:physical,secretB64,expectedHour:plan.hour,
  expectedSha:archivedSourceSha
 });
 if(restored.records.length!==answer.rows.length||
    restored.full_private_originals_retained!==false||
    JSON.stringify(restored.records)!==JSON.stringify(expectedFacts))
  fail("RESTORED_MINIMUM_RISK_FACTS_MISMATCH");
 const next=sealPhase2hBackupCursor({
  sourceSha:archivedSourceSha,hour:plan.hour,
  objectKey:plan.key,objectSha:trustedSha,
  lastClock:plan.last_record.ingested_at,
  lastId:plan.last_record.record_id,
  cycleComplete:answer.scan_complete,secretB64
 });
 await exactMain(env,fetchImpl);
 await storage("PUT",PHASE2H_R2_CURSOR_KEY,env,fetchImpl,next);
 const verify=await storage("GET",PHASE2H_R2_CURSOR_KEY,env,fetchImpl);
 if(!verify||!verify.equals(next))
  fail("CURSOR_WRITE_READBACK_UNVERIFIED");
 const checked=openPhase2hBackupCursor({body:verify,secretB64});
 if(checked.object_sha256!==trustedSha||
    checked.object_key!==plan.key)
  fail("CURSOR_BACKUP_LINKAGE_INVALID");
 return Object.freeze({
  schema:"geomacro.phase2h.r2-minimum-risk-facts-brotli11-receipt.v2",
  status:"PASS_PRIVATE_R2_BROTLI11_DERIVED_RISK_GATE_BACKUP",
  utc_hour:plan.hour,object_key:plan.key,
  object_sha256:trustedSha,compressed_cipher_bytes:physical.length,
  retained_derived_fact_rows:restored.records.length,
  full_originals_stored_long_term:false,
  compression:"BROTLI_QUALITY_11",
  provider_private_r2_put_readback:true,
  hmac_cursor_readback:true,
  provider_no_cold_prefix_auto_delete_verified:true,
  original_sha256_links_preserved:true,canonical_source_verified:true,
  independent_corroboration_verified:false,risk_gate_certified:false,
  d1_original_rows_mutated:0,raw_public_delivery:false,
  b2_requests:0,b2_ack_verified:false,b2_inventory_proven:false,
  canary_hold_removed:false,paid_eligible:false,payments_authorized:false
 });
}
if(process.argv[1]&&import.meta.url===
 pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==2)fail("UNREVIEWED_CLI_ARGS");
  const receipt=await backupPhase2hPrivateOriginals();
  mkdirSync("artifacts/release",{recursive:true,mode:0o700});
  writeFileSync("artifacts/release/phase2h-r2-b2-quota-backup.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
  if(!receipt.provider_private_r2_put_readback)process.exitCode=3;
 }catch(e){
  console.error(JSON.stringify({status:"HOLD",code:redacted(e),
   private_originals_logged:false,b2_parity_claimed:false,
   canary_hold_unchanged:true,paid_delivery_authorized:false}));
  process.exitCode=3;
 }
}
