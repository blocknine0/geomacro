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
import {createHash,createHmac} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {checkD1Headroom,HEADROOM_HOLD_CODE}
 from "./check-d1-headroom.mjs";
import {runShadowBillableProbe}
 from "./verify-d1-publisher-billable-shadow.mjs";
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
  status:"HOLD",started_at:new Date().toISOString(),
  ordered_ids:STEP3_MIGRATIONS.map(x=>x.id),
  applied:[],verified:[],backup_bookmark_sha256:null,
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
    !existsSync(HOLD_FILE)||
    run("git",["status","--porcelain"]).length>0)
  fail("OWNER_APPROVAL_SHA_OR_HOLD_IDENTITY_UNVERIFIED");
}
function runnerConfig(privateDir,dbId,migrationsDir){
 const config=join(privateDir,"wrangler-step3.jsonc");
 writeFileSync(config,JSON.stringify({
  name:"geomacro-step3-protected-db-only",
  compatibility_date:"2026-10-03",
  d1_databases:[{binding:"DB",database_name:"geomacro-control-plane",
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
function migrateOne(privateDir,config,manifest,report){
 const temp=mkdtempSync(join(privateDir,"single-"+manifest.id+"-"));
 const source=readFileSync(manifest.file,"utf8");
 if(digest(source)!==manifest.sql_sha256)
  fail("MIGRATION_FILE_CHANGED_SINCE_REVIEW");
 const filePath=join(temp,manifest.filename);
 writeFileSync(filePath,source,{mode:0o600});
 const singleConfig=runnerConfig(temp,process.env.D1_DATABASE_ID,temp);
 const args=["d1","migrations","list","DB","--remote"];
 const toApply=parsePending(wrangler(singleConfig,args),manifest.filename);
 const at=new Date().toISOString();
 if(toApply){
  wrangler(singleConfig,["d1","migrations","apply","DB","--remote"],240000);
  report.production_sql_mutated=true;
  report.applied.push({id:manifest.id,filename:manifest.filename,
   sha256:manifest.sql_sha256,at});
  save(report);
 }
 if(parsePending(wrangler(singleConfig,args),manifest.filename))
  fail("MIGRATION_HISTORY_PENDING_AFTER_APPLY");
 checkIndexAndSchema(config,manifest,report);
 counterParity(config,manifest.id);
 return {id:manifest.id,applied_now:toApply,
  migration_history_and_schema_valid:true};
}
async function verifyHmacNewPointers(config,env){
 const total=q(config,
  "SELECT COUNT(*) AS n FROM phase2h_raw_object_refs_v1",{maxRows:1}).rows[0]?.n;
 if(!Number.isSafeInteger(total)||total<0)fail("POINTER_COUNT_UNVERIFIED");
 if(total===0)return {
  state:"NOT_APPLICABLE_NO_POPULATED_PRODUCTION_R2_POINTERS",
  verified_count:0,all_hmac_and_r2_bytes_verified:false};
 if(total>50)fail("POINTER_HMAC_BATCH_NOT_BOUNDED");
 const rows=q(config,"SELECT record_id,raw_sha256 FROM phase2h_raw_object_refs_v1 "+
  "ORDER BY record_id LIMIT 51",{maxRows:51}).rows;
 if(rows.length!==total)fail("POINTER_HMAC_ID_SET_INCOMPLETE");
 const root=env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
 if(typeof root!=="string"||root.length<32)
  fail("OWNER_PRIVATE_R2_VERIFIER_AUTH_UNAVAILABLE");
 const bearer=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 let verified=0;
 for(const row of rows){
  const url="https://geomacro-control-plane.daspallab202391.workers.dev"+
   "/v1/internal/phase2h-raw-object-ref?record_id="+row.record_id;
  const res=await fetch(url,{redirect:"error",method:"GET",
   headers:{Authorization:"Bearer "+bearer,"Cache-Control":"no-store"},
   signal:AbortSignal.timeout(12000)});
  if(res.status!==200||res.redirected)fail("PROTECTED_POINTER_HMAC_R2_HTTP_FAILED");
  const data=await res.json().catch(()=>null);
  if(data?.ok!==true||
     data.schema!=="geomacro.phase2h.private-r2-reference-readback.v1"||
     data.pointer_and_object_verified!==true||
     data.legacy_fallback!==false||
     data?.record?.record_id!==row.record_id||
     data?.record?.raw_sha256!==row.raw_sha256||
     data.paid_eligible!==false||data.b2_archive_verified!==false)
    fail("PROTECTED_POINTER_HMAC_SHA_R2_MISMATCH");
  verified++;
 }
 return {state:"PASS_PROVIDER_WORKER_HMAC_SHA_R2_READBACK",
  verified_count:verified,all_hmac_and_r2_bytes_verified:verified===total};
}
export async function applyStep3Migrations({env=process.env}={}){
 const state=receipt(),manifests=step3SqlManifests();
 state.source_migrations=manifests.map(x=>({id:x.id,sql_sha256:x.sql_sha256}));
 save(state);
 if(!existsSync(HOLD_FILE))fail("RELEASE_HOLD_FILE_MISSING");
 try{
  approved(env);
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
  const time=JSON.parse(wrangler(config,
   ["d1","time-travel","info","DB","--json"]));
  const bookmark=time.bookmark??time.result?.bookmark;
  if(typeof bookmark!=="string"||!/^[0-9a-f-]{20,100}$/iu.test(bookmark))
   fail("D1_TIME_TRAVEL_BOOKMARK_UNVERIFIED");
  // Private rollback capability; NEVER committed, uploaded to artifacts or
  // sent to a log. Cloudflare Time Travel bookmarks are auto-generated.
  const bookmarkPath=join(base,"pre-step3-bookmark.private.json");
  writeFileSync(bookmarkPath,JSON.stringify({
   captured_at_utc:new Date().toISOString(),
   database_uuid:env.D1_DATABASE_ID,bookmark
  })+"\n",{mode:0o600});
  state.backup_bookmark_sha256=digest(bookmark);
  state.private_backup_bookmark_path=bookmarkPath;
  save(state);
  await refreshedGate(state,"AFTER_BACKUP_BEFORE_FIRST_MIGRATION");
  for(const step of manifests){
   await refreshedGate(state,"BEFORE_"+step.id);
   // Exact order 0204 -> 0211 -> 0212 -> 0213. No wildcard apply.
   migrateOne(base,config,step,state);
   compareImmutableBaseline(state.original_immutable_sample_sha256,
    baseline(config));
   await refreshedGate(state,"AFTER_"+step.id);
  }
  state.post_migration_hmac=await verifyHmacNewPointers(config,env);
  state.post_migration_readback_explicit_PASS=
   state.verified.length===4&&
   state.post_migration_hmac.all_hmac_and_r2_bytes_verified===true;
  state.status=state.post_migration_readback_explicit_PASS?"PASS":"HOLD";
  state.code=state.post_migration_readback_explicit_PASS?
   "STEP3_FOUR_MIGRATIONS_SCHEMA_AND_HMAC_READBACK_PASS":
   "STEP3_POINTER_HMAC_R2_PROOF_NOT_AVAILABLE";
  // Never remove HOLD or mark a PR as mergeable, even after PASS.
  save(state);
  if(state.status!=="PASS")fail("FINAL_PROTECTED_READBACK_HELD");
  return state;
 }catch(e){
  state.status="HOLD";state.code=/^(?:STEP3_|MIGRATION_)[A-Z0-9_]+$/u.test(e?.message??"")?
   e.message:"STEP3_PROVIDER_EXECUTION_UNVERIFIED";
  state.hold_file_untouched=existsSync(HOLD_FILE);
  state.post_migration_readback_explicit_PASS=false;
  save(state);
  return state;
 }
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
  console.error("Usage: --plan | --apply");process.exitCode=2;
 }
}
