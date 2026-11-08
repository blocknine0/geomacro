#!/usr/bin/env node
/**
 * GeoMacro Step3: protected, exact-SHA, sequential D1 migration executor.
 * --plan: zero provider calls, no mutations. --apply: explicitly authorized,
 * provider-metered Cloudflare shadow proof + UTC headroom + Time Travel
 * bookmark BEFORE ANY production migration. Every step is re-gated.
 *
 * The HOLD file is a positive invariant; this code NEVER removes it, merges
 * a PR, deploys Workers, restores DB, disables sources, or alters payments.
 * A failed step stops, retains prior successful migrations and requires a
 * separately reviewed restore decision. No automatic destructive restore.
 */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {checkD1Headroom,HEADROOM_HOLD_CODE}
 from "./check-d1-headroom.mjs";
import {runShadowBillableProbe}
 from "./verify-d1-publisher-billable-shadow.mjs";
import {captureDurableD1Checkpoint,signStep3StatusReceipt}
 from "../lib/d1-step3-recovery-checkpoint.mjs";
import {inspectPointerProofCount,verifyRealPhase2hPointerRows}
 from "../lib/d1-step3-crypto-proof.mjs";
import {seedShadowArchivedPointer}
 from "../lib/d1-step3-shadow-pointer-seed.mjs";
import {
 createStep3LedgerSQL,readStep3LedgerSQL,
 verifyStep3LedgerRows,step3LedgerStartSQL,
 step3LedgerStatusSQL,sha256MigrationSet,decideResume
} from "../lib/d1-step3-migration-ledger.mjs";
import {STEP3_MIGRATIONS,step3SqlManifests,
 step3SizeProbeSQL,validateStep3SizeProbe,step3SchemaSQL,
 verifyStep3Schema,verifyStep3Integrity,verifyStep3Explain,
 compareImmutableBaseline} from "../lib/d1-step3-migration-contract.mjs";

const ROOT="artifacts/release",LOG=ROOT+"/d1-step3-migration-execution.json";
const HOLD_FILE="config/d1-hotspot-v2-canary.hold";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const fail=code=>{throw Error("STEP3_"+code)};
const digest=x=>createHash("sha256").update(x).digest("hex");
const isIndex=n=>n.startsWith("idx_");
const readOnly=n=>/^[a-z][a-z0-9_]{1,75}$/u.test(n);
const getHash=()=>execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const receipt=()=>{
 mkdirSync(ROOT,{recursive:true,mode:0o700});
 return {schema:"geomacro.step3.migrations-execution.v1",
  status:"NOT_YET_VERIFIED",started_at:new Date().toISOString(),
  ordered_ids:STEP3_MIGRATIONS.map(x=>x.id),
  applied:[],verified:[],backup_bookmark_sha256:null,
  recovery_checkpoint_verified:false,migration_ledger_verified:false,
  pointer_crypto_proof:"NOT_YET_VERIFIED",
  no_real_provider_rehearsal_claimed:true,
  production_sql_mutated:false,production_release_authorized:false,
  hold_file_untouched:true,pr_3725_merged:false,pr_3726_merged:false,
  commercial_signer_disabled:false,ingestion_disabled:false,
  b2_archive_disabled:false,shadow_test_proven:false,
  post_migration_readback_explicit_PASS:false};
};
const save=v=>{mkdirSync(ROOT,{recursive:true,mode:0o700});
 writeFileSync(LOG,JSON.stringify(v,null,2)+"\n",{mode:0o600})};
const run=(cmd,args,timeout=150000)=>{
 try{return execFileSync(cmd,args,{encoding:"utf8",
  maxBuffer:4_000_000,timeout,stdio:["ignore","pipe","pipe"],
  env:{...process.env,CI:"true"}}).trim();}
 catch{fail("PROVIDER_OR_COMMAND_UNAVAILABLE")}
};
function approved(env){
 if(env.GEOMACRO_STEP3_APPLY!=="APPROVE_ONLY_0204_0211_0212_0213"||
    env.GEOMACRO_STEP3_RECOVERY_V2_APPROVED!=="YES"||
    !UUID.test(env.D1_DATABASE_ID??"")||
    !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    env.D1_DATABASE_ID.toLowerCase()===
     env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()||
    env.GEOMACRO_D1_SHADOW_TARGET_APPROVED!=="YES"||
    !/^[a-f0-9]{32}$/iu.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20||
    !SHA.test(env.GEOMACRO_STEP3_EXACT_SHA??"")||
    env.GEOMACRO_STEP3_EXACT_SHA!==getHash()||
    !existsSync(HOLD_FILE))
  fail("OWNER_APPROVAL_SHA_OR_HOLD_IDENTITY_UNVERIFIED");
 // The runner writes its own offline/attempt report in artifacts/release.
 // Ignore ONLY those receipts; any other tracked/untracked source mutation
 // invalidates the exact-SHA migration approval.
 const dirty=run("git",["status","--porcelain","--untracked-files=all"])
  .split("\n").filter(Boolean).filter(s=>
   !/^artifacts\/release\//u.test(s.slice(3)));
 if(dirty.length)fail("SOURCE_TREE_DIRTY_EXACT_SHA_UNVERIFIED");
}
function runnerConfig(privateDir,dbId,migrationsDir){
 const config=join(privateDir,"wrangler-step3.jsonc");
 writeFileSync(config,JSON.stringify({
  name:"geomacro-step3-protected-db-only",
  compatibility_date:"2026-10-03",
  d1_databases:[{binding:"DB",
   database_name:dbId===process.env.GEOMACRO_D1_SHADOW_DATABASE_ID?
    "geomacro-d1-publisher-shadow":"geomacro-control-plane",
   database_id:dbId,migrations_dir:migrationsDir}]
 }),{mode:0o600});
 return config;
}
function wrangler(config,args,timeout=150000){
 return run("npx",["-y","wrangler@4.136.3",...args,"--config",config],timeout);
}
export function parseStep3WranglerQuery(raw,{maxRows=60}={}){
 let data;try{data=JSON.parse(raw)}catch{fail("D1_QUERY_JSON_INVALID")}
 if(!Array.isArray(data)||data.length!==1||data[0]?.success!==true||
    !Array.isArray(data[0].results)||data[0].results.length>maxRows||
    !Number.isSafeInteger(data[0].meta?.rows_read)||
    data[0].meta.rows_read<0||data[0].meta.rows_written!==0)
  fail("D1_READBACK_NATIVE_META_UNVERIFIED");
 return {rows:data[0].results,readRows:data[0].meta.rows_read};
}
function q(config,sql,{maxRows=60}={}){
 return parseStep3WranglerQuery(wrangler(config,[
  "d1","execute","DB","--remote","--json","--command",sql]),{maxRows});
}
function writeD1Sql(config,sql){
 let data;
 try{data=JSON.parse(wrangler(config,[
  "d1","execute","DB","--remote","--json","--command",sql]));}
 catch{fail("LEDGER_PROVIDER_MUTATION_UNVERIFIED")}
 if(!Array.isArray(data)||data.length!==1||data[0]?.success!==true||
    !Number.isSafeInteger(data[0]?.meta?.rows_read)||
    !Number.isSafeInteger(data[0]?.meta?.rows_written)||
    data[0].meta.rows_read<0||data[0].meta.rows_written<0)
  fail("LEDGER_NATIVE_BILLABLE_META_UNVERIFIED");
 return {rows_read:data[0].meta.rows_read,
  rows_written:data[0].meta.rows_written};
}
function ensureLedger(config,manifests,report){
 const meta=writeD1Sql(config,createStep3LedgerSQL());
 const physical=q(config,
  "SELECT type,name,sql FROM sqlite_schema WHERE name='_geomacro_migration_ledger'",
  {maxRows:1}).rows;
 if(physical.length!==1||physical[0]?.type!=="table"||
    typeof physical[0]?.sql!=="string"||
    !physical[0].sql.includes("sql_sha256")||
    !physical[0].sql.includes("duration_ms"))
  fail("LEDGER_SCHEMA_READBACK_FAILED");
 const rows=q(config,readStep3LedgerSQL(),{maxRows:4}).rows;
 const map=verifyStep3LedgerRows(rows,manifests);
 report.migration_ledger_verified=true;
 report.migration_ledger_provider_ddl_rows=meta;
 save(report);
 return map;
}
async function refreshedGate(report,stage){
 const x=await checkD1Headroom();
 report.latest_headroom={stage,status:x.status,code:x.code,
  day:x.day_utc,rows_read:x.observed_rows_read,
  rows_written:x.observed_rows_written,
  read_remaining:x.remaining_rows_read,
  write_remaining:x.remaining_rows_written};
 save(report);
 if(x.status!=="PASS")throw Error(HEADROOM_HOLD_CODE);
 return x;
}
function boundedInputs(config,step,report){
 if(!step.sizeTables.length)return;
 const sql=step3SizeProbeSQL(step.sizeTables);
 const r=q(config,sql,{maxRows:1});
 const x=validateStep3SizeProbe(step.sizeTables,r.rows);
 report.bounded_inputs??=[];
 report.bounded_inputs.push({...x,migration:step.id,
  provider_rows_read:r.readRows});
 save(report);
}
function baseline(config){
 const r=q(config,"SELECT record_id,raw_sha256 FROM phase2h_private_raw_news "+
  "ORDER BY record_id ASC LIMIT 25",{maxRows:25});
 if(r.rows.some(x=>!/^[a-f0-9]{64}$/u.test(x.record_id??"")||
    !/^[a-f0-9]{64}$/u.test(x.raw_sha256??"")))fail("LEGACY_BASELINE_INVALID");
 // Only hash the immutable ID/SHA sample; no private originals are logged.
 return digest(JSON.stringify(r.rows));
}
const explainSQL=Object.freeze({
 idx_private_osint_country_category_clock_v2:
  "SELECT item_id FROM private_osint_news_25h INDEXED BY idx_private_osint_country_category_clock_v2 WHERE country_iso3='USA' AND category='geopolitics' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 1",
 idx_private_osint_check_category_status_v2:
  "SELECT source_ref FROM private_osint_source_checks_24h INDEXED BY idx_private_osint_check_category_status_v2 WHERE category='macro' ORDER BY checked_at DESC LIMIT 1",
 idx_website_derived_hot_order_v2:
  "SELECT id FROM website_derived_intelligence INDEXED BY idx_website_derived_hot_order_v2 ORDER BY published_at DESC,id DESC LIMIT 1",
 idx_private_osint_country_clock_v3:
  "SELECT item_id FROM private_osint_news_25h INDEXED BY idx_private_osint_country_clock_v3 WHERE country_iso3='USA' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 1",
 idx_website_derived_category_clock_v3:
  "SELECT id FROM website_derived_intelligence INDEXED BY idx_website_derived_category_clock_v3 WHERE category='macro' ORDER BY published_at DESC,id DESC LIMIT 1",
 idx_phase2h_ref_object_key_v1:
  "SELECT record_id FROM phase2h_raw_object_refs_v1 INDEXED BY idx_phase2h_ref_object_key_v1 WHERE object_key='step3-unmatched' ORDER BY object_key,bundle_index LIMIT 1",
 idx_phase2h_ref_country_category_clock_v1:
  "SELECT record_id FROM phase2h_raw_object_refs_v1 INDEXED BY idx_phase2h_ref_country_category_clock_v1 WHERE risk_country_iso3='USA' AND category='macro' ORDER BY original_published_at DESC,record_id DESC LIMIT 1",
 idx_phase2h_ref_ingest_clock_v1:
  "SELECT record_id FROM phase2h_raw_object_refs_v1 INDEXED BY idx_phase2h_ref_ingest_clock_v1 WHERE first_ingested_at>'2026-01-01' ORDER BY first_ingested_at,record_id LIMIT 1",
});
function checkIndexAndSchema(config,step,report){
 const rows=q(config,step3SchemaSQL(step.objects),{maxRows:30}).rows;
 const proof=verifyStep3Schema(step.objects,rows);
 const indices=[];
 for(const name of Object.keys(step.objects).filter(isIndex)){
  const sql=explainSQL[name];
  if(!sql)fail("INDEX_PLAN_NOT_DECLARED");
  const x=q(config,"EXPLAIN QUERY PLAN "+sql,{maxRows:15});
  indices.push(verifyStep3Explain(x.rows,name));
 }
 const integrity=[];
 for(const table of step.integrityTables){
  if(!readOnly(table))fail("INTEGRITY_TABLE_SCOPE_INVALID");
  // Physical SQLite table+associated index-tree integrity. If Cloudflare
  // disallows PRAGMA or full proof exceeds headroom, stop; do not claim PASS.
  const r=q(config,"PRAGMA integrity_check('"+table+"')",{maxRows:10});
  integrity.push(verifyStep3Integrity(r.rows,table));
 }
 const result={migration:step.id,...proof,indices,integrity};
 report.verified.push(result);save(report);
 return result;
}
function counterParity(config,id){
 if(id==="0211"){
  const sql="SELECT (SELECT COALESCE(SUM(committed_count),0) FROM "+
   "p0b_committed_day_totals) AS expected, "+
   "(SELECT COUNT(*) FROM ingestion_spool_queue "+
   "WHERE d1_committed_at IS NOT NULL) AS actual";
  const r=q(config,sql,{maxRows:1}).rows[0];
  if(!r||r.expected!==r.actual)fail("P0B_COMMITTED_COUNTER_PARITY_FAILED");
 }
 if(id==="0212"){
  const sql="SELECT (SELECT COALESCE(SUM(pending_count),0) FROM "+
   "phase2h_pending_hourly_v1) AS expected, "+
   "(SELECT COUNT(*) FROM phase2h_private_raw_news "+
   "WHERE b2_object_sha256 IS NULL) AS actual";
  const r=q(config,sql,{maxRows:1}).rows[0];
  if(!r||r.expected!==r.actual)fail("PHASE2H_HOURLY_COUNTER_PARITY_FAILED");
 }
}
function parsePending(singleText,filename){
 const occurrences=[...singleText.matchAll(/\b\d{4}_[A-Za-z0-9_-]+\.sql\b/gu)]
  .map(m=>m[0]);
 if(/no migrations to apply|no migrations found/iu.test(singleText)&&
    occurrences.length===0)return false;
 if(occurrences.length===0||occurrences.some(x=>x!==filename))
  fail("UNREVIEWED_OR_AMBIGUOUS_PENDING_MIGRATION");
 return true;
}
function migrateOne(privateDir,config,manifest,report,dbId,ledger){
 const temp=mkdtempSync(join(privateDir,"single-"+manifest.id+"-"));
 const source=readFileSync(manifest.file,"utf8");
 if(digest(source)!==manifest.sql_sha256)
  fail("MIGRATION_FILE_CHANGED_SINCE_REVIEW");
 const filePath=join(temp,manifest.filename);
 writeFileSync(filePath,source,{mode:0o600});
 const singleConfig=runnerConfig(temp,dbId,temp);
 const args=["d1","migrations","list","DB","--remote"];
 const pending=parsePending(wrangler(singleConfig,args),manifest.filename);
 const previous=ledger.get(manifest.id);
 let schemaVerified=false;
 if(!pending){
  // Native migration history alone is insufficient: verify exact objects,
  // indexes, foreign-key/index integrity and source counter parity.
  checkIndexAndSchema(config,manifest,report);
  counterParity(config,manifest.id);
  schemaVerified=true;
 }
 const action=decideResume({
  entry:previous,manifest,nativePending:pending,objectsVerified:schemaVerified});
 if(action.startsWith("HOLD_"))fail("LEDGER_"+action);
 const began=Date.now(),at=new Date().toISOString();
 if(!previous){
  writeD1Sql(config,step3LedgerStartSQL(manifest,at));
  // Verify D1 actual table write; a successful CLI exit is not an ACK.
  const created=q(config,readStep3LedgerSQL(),{maxRows:4}).rows;
  const map=verifyStep3LedgerRows(created,report.source_migrations);
  if(map.get(manifest.id)?.status!=="STARTED")
   fail("LEDGER_START_READBACK_FAILED");
 }
 if(action==="APPLY_REVIEWED_SQL"){
  wrangler(singleConfig,["d1","migrations","apply","DB","--remote"],240000);
  report.production_sql_mutated=report.operation_kind==="production";
  report.shadow_sql_mutated=report.operation_kind==="shadow";
  report.applied.push({id:manifest.id,filename:manifest.filename,
   sha256:manifest.sql_sha256,at});
  save(report);
  if(parsePending(wrangler(singleConfig,args),manifest.filename))
   fail("MIGRATION_HISTORY_PENDING_AFTER_APPLY");
  writeD1Sql(config,step3LedgerStatusSQL(manifest,"APPLIED",
   new Date().toISOString(),Date.now()-began));
  checkIndexAndSchema(config,manifest,report);
  counterParity(config,manifest.id);
 }else if(action==="SKIP_VERIFIED"){
  // Already schema verified above; no duplicate DDL.
 }else if(!["REVALIDATE_ONLY","RECONCILE_COMPLETED",
    "RECONCILE_HISTORY_WITHOUT_LEDGER"].includes(action))
  fail("LEDGER_RESUME_ACTION_UNRECOGNIZED");
 if(action!=="SKIP_VERIFIED"){
  writeD1Sql(config,step3LedgerStatusSQL(manifest,"VERIFIED",
   new Date().toISOString(),Date.now()-began));
 }
 const after=q(config,readStep3LedgerSQL(),{maxRows:4}).rows;
 const verified=verifyStep3LedgerRows(after,report.source_migrations)
  .get(manifest.id);
 if(verified?.status!=="VERIFIED"||
    verified.sql_sha256!==manifest.sql_sha256)
  fail("LEDGER_FINAL_D1_READBACK_UNVERIFIED");
 ledger.set(manifest.id,verified);
 report.ledger_stages??=[];
 report.ledger_stages.push({migration_id:manifest.id,
  status:verified.status,checksum:verified.sql_sha256,
  duration_ms:verified.duration_ms,resume_action:action});
 save(report);
 return {id:manifest.id,applied_now:action==="APPLY_REVIEWED_SQL",
  migration_history_and_schema_valid:true,ledger_status:"VERIFIED"};
}
async function verifyHmacNewPointers(config,env){
 // 10 real R2 pointers max. Never COUNT the full growing pointer table.
 const sql="SELECT record_id,category,original_published_at,"+
  "first_ingested_at,raw_sha256,object_sha256,object_key,"+
  "bundle_bytes,record_sha256,record_bytes,bundle_index,signed_at,"+
  "pointer_hmac_sha256,risk_country_iso3,storage_backend "+
  "FROM phase2h_raw_object_refs_v1 ORDER BY record_id ASC LIMIT 11";
 const result=q(config,sql,{maxRows:11});
 if(result.rows.length>10)
  return {status:"NOT_YET_VERIFIED",
   code:"POINTER_PROOF_PAGE_EXCEEDS_BOUNDED_BUDGET",
   all_hmac_and_r2_bytes_verified:false};
 const empty=inspectPointerProofCount(result.rows);
 if(empty)return {...empty,all_hmac_and_r2_bytes_verified:false};
 const proof=await verifyRealPhase2hPointerRows({rows:result.rows,env});
 return {...proof,
  all_hmac_and_r2_bytes_verified:
   proof.cryptographic_readback_verified===true};
}
export async function applyStep3Migrations({env=process.env}={}){
 const state=receipt(),manifests=step3SqlManifests();
 state.operation_kind="production";
 state.source_migrations=manifests.map(x=>({id:x.id,sql_sha256:x.sql_sha256}));
 if(!existsSync(HOLD_FILE))fail("RELEASE_HOLD_FILE_MISSING");
 try{
  approved(env);
  save(state);
  await refreshedGate(state,"BEFORE_SHADOW_BILLABLE_WORK");
  const shadow=await runShadowBillableProbe({env});
  if(shadow.status!=="PASS_NATIVE_PROVIDER_ROWS"||
     !shadow.identical_retry_zero_billable_rows_written||
     !shadow.batch_write_matches_single_changed_record_delta)
   fail("SHADOW_NATIVE_DELTA_PROOF_HOLD");
  state.shadow_test_proven=true;
  state.shadow_receipt_path=
   "artifacts/release/d1-publisher-shadow-billable-rows.json";
  save(state);
  await refreshedGate(state,"AFTER_SHADOW_BEFORE_PRODUCTION_BACKUP");
  const base=mkdtempSync(join(tmpdir(),"geomacro-step3-private-"));
  const config=runnerConfig(base,env.D1_DATABASE_ID,base);
  const list=JSON.parse(wrangler(config,["d1","list","--json"]));
  const found=list.filter(x=>x.name==="geomacro-control-plane"&&
   x.uuid?.toLowerCase()===env.D1_DATABASE_ID.toLowerCase());
  if(found.length!==1)fail("CANONICAL_PRODUCTION_DATABASE_ID_UNVERIFIED");
  const info=JSON.parse(wrangler(config,["d1","info","DB","--json"]));
  if(info?.version!=="production")fail("D1_TIME_TRAVEL_BACKEND_NOT_PRODUCTION");
  for(const manifest of manifests)boundedInputs(config,manifest,state);
  state.original_immutable_sample_sha256=baseline(config);
  const migrationSha=sha256MigrationSet(manifests);
  const checkpoint=await captureDurableD1Checkpoint({
   env,dbId:env.D1_DATABASE_ID,migrationSha});
  if(checkpoint.status!=="PASS_REAL_PROVIDER_R2_BYTE_READBACK"||
     checkpoint.private_r2_encrypted_readback_verified!==true||
     checkpoint.signed_manifest_readback_verified!==true)
   fail("RECOVERY_CHECKPOINT_NOT_DURABLE");
  state.recovery_checkpoint_verified=true;
  state.recovery_checkpoint={
   encrypted_bytes:checkpoint.encrypted_byte_length,
   encrypted_object_key:checkpoint.object_key,
   signed_manifest_object_key:checkpoint.manifest_object_key,
   encrypted_sha256:checkpoint.manifest_sha256,
   recovery_public_key_sha256:checkpoint.key_id_sha256,
   migration_sha256:checkpoint.migration_sha256
  };
  state.backup_bookmark_sha256=checkpoint.bookmark_sha256;
  save(state);
  await refreshedGate(state,"AFTER_DURABLE_R2_BACKUP_BEFORE_FIRST_DDL");
  const ledger=ensureLedger(config,manifests,state);
  await refreshedGate(state,"AFTER_LEDGER_BEFORE_MIGRATIONS");
  for(const step of manifests){
   await refreshedGate(state,"BEFORE_"+step.id);
   migrateOne(base,config,step,state,env.D1_DATABASE_ID,ledger);
   compareImmutableBaseline(state.original_immutable_sample_sha256,
    baseline(config));
   await refreshedGate(state,"AFTER_"+step.id);
  }
  state.post_migration_hmac=await verifyHmacNewPointers(config,env);
  state.post_migration_readback_explicit_PASS=
   state.verified.length===4&&state.recovery_checkpoint_verified===true&&
   state.migration_ledger_verified===true&&
   state.post_migration_hmac.all_hmac_and_r2_bytes_verified===true&&
   state.post_migration_hmac.b2_physical_parity==="PASS_REAL_B2_BYTE_READBACK";
  state.status=state.post_migration_readback_explicit_PASS?"PASS":"NOT_YET_VERIFIED";
  state.code=state.post_migration_readback_explicit_PASS?
   "STEP3_FOUR_MIGRATIONS_SCHEMA_AND_HMAC_READBACK_PASS":
   "STEP3_POINTER_HMAC_R2_AND_B2_PARITY_NOT_YET_VERIFIED";
  // Never remove HOLD or mark a PR as mergeable, even after PASS.
  save(state);
  if(state.status!=="PASS")fail("FINAL_PROTECTED_READBACK_HELD");
  return state;
 }catch(e){
  state.status="NOT_YET_VERIFIED";state.code=/^(?:STEP3_|MIGRATION_)[A-Z0-9_]+$/u.test(e?.message??"")?
   e.message:"STEP3_PROVIDER_EXECUTION_UNVERIFIED";
  state.hold_file_untouched=existsSync(HOLD_FILE);
  state.post_migration_readback_explicit_PASS=false;
  save(state);
  return state;
 }
}
/**
 * Real shadow-only native Cloudflare D1 sequence.
 * Requires a representative shadow dataset (never clones private prod rows).
 * Finishes NOT_YET_VERIFIED until two actually deployed shadow-bound Worker
 * versions have completed authenticated legacy/new read/write/rollback tests.
 */
export async function rehearseStep3Shadow({env=process.env}={}){
 const report=receipt(),manifests=step3SqlManifests();
 report.operation_kind="shadow";
 report.source_migrations=manifests.map(x=>({
  id:x.id,sql_sha256:x.sql_sha256
 }));
 report.schema="geomacro.step3.shadow-rehearsal.v1";
 report.status="NOT_YET_VERIFIED";
 report.code="STEP3_SHADOW_PROVIDER_REHEARSAL_NOT_STARTED";
 report.legacy_worker_rollback_verified=false;
 report.new_worker_hydration_verified=false;
 report.b2_physical_parity_verified=false;
 report.production_sql_mutated=false;
 const path="artifacts/release/step3-shadow-rehearsal-receipt.json";
 const write=()=>{
  mkdirSync(ROOT,{recursive:true,mode:0o700});
  let output;
  try{
   output=signStep3StatusReceipt(report,env.SIGNING_JWK);
  }catch{
   // Missing signing key must not turn a partial rehearsal into PASS.
   report.status="NOT_YET_VERIFIED";
   report.code="STEP3_SHADOW_STATUS_RECEIPT_SIGNER_UNVERIFIED";
   output={schema:"geomacro.step3.unsigned-not-verified.v1",
    receipt:report,attestation:null};
  }
  writeFileSync(path,JSON.stringify(output,null,2)+"\\n",{mode:0o600});
 };
 try{
  if(env.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
     env.GEOMACRO_D1_SHADOW_TARGET_APPROVED!=="YES"||
     !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
     env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()===
      (env.D1_DATABASE_ID??"").toLowerCase()||
     !SHA.test(env.GEOMACRO_STEP3_EXACT_SHA??"")||
     env.GEOMACRO_STEP3_EXACT_SHA!==getHash()||
     !existsSync(HOLD_FILE))
   fail("SHADOW_REHEARSAL_EXACT_APPROVAL_MISSING");
  await refreshedGate(report,"SHADOW_BEFORE_PROVIDER_WRITES");
  const base=mkdtempSync(join(tmpdir(),"geomacro-step3-shadow-"));
  const shadow=env.GEOMACRO_D1_SHADOW_DATABASE_ID;
  const config=runnerConfig(base,shadow,base);
  const list=JSON.parse(wrangler(config,["d1","list","--json"]));
  const matching=list.filter(x=>x.uuid?.toLowerCase()===shadow.toLowerCase()&&
   /^geomacro-d1-publisher-shadow(?:-[a-z0-9-]+)?$/u.test(x.name??""));
  if(matching.length!==1)fail("SHADOW_REAL_DATABASE_ID_NOT_MATCHED");
  report.real_shadow_database_identity_verified=true;
  for(const m of manifests)boundedInputs(config,m,report);
  report.original_immutable_sample_sha256=baseline(config);
  const checkpoint=await captureDurableD1Checkpoint({
   env,dbId:shadow,migrationSha:sha256MigrationSet(manifests)
  });
  if(checkpoint.status!=="PASS_REAL_PROVIDER_R2_BYTE_READBACK")
   fail("SHADOW_RECOVERY_CHECKPOINT_READBACK_FAILED");
  report.recovery_checkpoint_verified=true;
  report.backup_bookmark_sha256=checkpoint.bookmark_sha256;
  report.recovery_checkpoint={
   encrypted_object_key:checkpoint.object_key,
   signed_manifest_object_key:checkpoint.manifest_object_key,
   manifest_sha256:checkpoint.manifest_sha256
  };
  write();
  await refreshedGate(report,"SHADOW_AFTER_BACKUP_BEFORE_DDL");
  const ledger=ensureLedger(config,manifests,report);
  for(const m of manifests){
   await refreshedGate(report,"SHADOW_BEFORE_"+m.id);
   migrateOne(base,config,m,report,shadow,ledger);
   compareImmutableBaseline(report.original_immutable_sample_sha256,
    baseline(config));
   await refreshedGate(report,"SHADOW_AFTER_"+m.id);
  }
  report.migrations_0204_0211_0212_0213_provider_verified=
   report.verified.length===4;
  await refreshedGate(report,"SHADOW_BEFORE_REAL_ARCHIVED_POINTER_SEED");
  report.real_archived_pointer_seed=await seedShadowArchivedPointer({
   env,readD1:async sql=>q(config,sql,{maxRows:1}).rows,
   writeD1:async sql=>writeD1Sql(config,sql)
  });
  if(report.real_archived_pointer_seed?.status!==
     "PASS_REAL_SHADOW_ARCHIVED_ORIGINAL_POINTER_STAGING_ONLY")
   fail("SHADOW_REAL_ARCHIVED_POINTER_NOT_VERIFIED");
  write();
  // Dedicated shadow hostname only. Never use api.geomacro.live as a
  // surrogate proof for an isolated shadow-bound D1 Worker.
  const shadowHost=env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST;
  if(typeof shadowHost!=="string"||
     !/^geomacro-step3-shadow\.[a-z0-9-]+\.workers\.dev$/u.test(shadowHost))
   fail("SHADOW_WORKER_BOUND_ORIGIN_UNVERIFIED");
  report.post_migration_hmac=await verifyHmacNewPointers(config,{
   ...env,GEOMACRO_STEP3_VERIFIED_WORKER_HOST:shadowHost
  });
  // An HTTP response from the production Worker cannot prove that the
  // shadow Worker bound to this D1 can survive rolling back. Do not forge.
  report.code="STEP3_SHADOW_DUAL_WORKER_ROLLBACK_AND_B2_NOT_YET_VERIFIED";
  report.status="NOT_YET_VERIFIED";
 }catch(e){
  report.status="NOT_YET_VERIFIED";
  report.code=/^(?:STEP3_|MIGRATION_)[A-Z0-9_]+$/u.test(e?.message??"")?
    e.message:"STEP3_SHADOW_REAL_PROVIDER_REHEARSAL_NOT_VERIFIED";
 }finally{
  report.hold_file_untouched=existsSync(HOLD_FILE);
  report.production_sql_mutated=false;
  report.post_migration_readback_explicit_PASS=false;
  write();
 }
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const flags=process.argv.slice(2);
 if(flags.length===1&&flags[0]==="--plan"){
  const result=receipt(),ms=step3SqlManifests();
  result.status="PLAN_ONLY_NO_PROVIDER_ACCESS";
  result.source_migrations=ms.map(x=>({id:x.id,file:x.file,sha256:x.sql_sha256,
   size_tables:x.sizeTables,integrity_tables:x.integrityTables,
   expected_schema_objects:Object.keys(x.objects)}));
  save(result);
  console.log(JSON.stringify({status:result.status,ordered_ids:result.ordered_ids,
   report:LOG,production_mutated:false,bookmark_created:false}));
 }else if(flags.length===1&&flags[0]==="--rehearse-shadow"){
  const result=await rehearseStep3Shadow();
  console.log(JSON.stringify({status:result.status,code:result.code,
   report:"artifacts/release/step3-shadow-rehearsal-receipt.json",
   real_shadow_database_identity_verified:
    result.real_shadow_database_identity_verified===true,
   production_sql_mutated:false,hold_file_untouched:result.hold_file_untouched}));
  if(result.status!=="PASS")process.exitCode=3;
 }else if(flags.length===1&&flags[0]==="--apply"){
  const result=await applyStep3Migrations();
  console.log(JSON.stringify({status:result.status,code:result.code,
   verified_migrations:result.verified.length,
   applied_migrations:result.applied.map(x=>x.id),
   shadow_test_proven:result.shadow_test_proven,
   backup_bookmark_sha256:result.backup_bookmark_sha256,
   post_migration_readback_explicit_PASS:
    result.post_migration_readback_explicit_PASS,
   hold_file_untouched:result.hold_file_untouched,
   report:LOG}));
  if(result.status!=="PASS")process.exitCode=3;
 }else{
  console.error("Usage: --plan | --rehearse-shadow | --apply");process.exitCode=2;
 }
}
