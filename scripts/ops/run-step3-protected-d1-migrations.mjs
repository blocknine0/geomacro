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
import {checkD1PaidMonthlyHeadroom,D1_PAID_HEADROOM_HOLD}
 from "../lib/d1-workers-paid-monthly-governor.mjs";
import {runShadowBillableProbe}
 from "./verify-d1-publisher-billable-shadow.mjs";
import {captureDurableD1Checkpoint,signStep3StatusReceipt}
 from "../lib/d1-step3-recovery-checkpoint.mjs";
import {summarizeD1BackendMetadata}
 from "./step3-d1-native-backend-readonly.mjs";
import {admitSignedStep3ShadowReceipt}
 from "../lib/d1-step3-receipt-admission.mjs";
import {assessStep3ProductionFinal}
 from "../lib/d1-step3-production-final-acceptance.mjs";
import {inspectPointerProofCount,verifyRealPhase2hPointerRows}
 from "../lib/d1-step3-crypto-proof.mjs";
import {seedShadowArchivedPointer}
 from "../lib/d1-step3-shadow-pointer-seed.mjs";
import {shadowArchivedSourceQuery,verifyRealShadowB2Parity,
 verifyRealShadowDualWorkers} from "../lib/d1-step3-real-shadow-proofs.mjs";
import {
 createStep3LedgerSQL,readStep3LedgerSQL,
 verifyStep3LedgerRows,step3LedgerStartSQL,
 step3LedgerStatusSQL,sha256MigrationSet,decideResume
} from "../lib/d1-step3-migration-ledger.mjs";
import {auditStep3AllIndexes,admitStep30204SupportedIntegrity}
 from "../lib/d1-step3-supported-integrity.mjs";
import {auditStep30213EmptyRefStructure}
 from "../lib/d1-step3-0213-empty-reference-proof.mjs";
import {auditStep30212ExactHourlyCounter}
 from "../lib/d1-step3-0212-hourly-counter-integrity.mjs";
import {auditStep30212AllRawSourceIndexes}
 from "../lib/d1-step3-0212-source-index-integrity.mjs";
import {auditStep30211WithoutRowidCounter}
 from "../lib/d1-step3-0211-counter-integrity.mjs";
import {auditStep30211SpoolSource}
 from "../lib/d1-step3-0211-spool-integrity.mjs";
import {STEP3_MIGRATIONS,step3SqlManifests,
 step3SizeProbeSQL,validateStep3SizeProbe,step3NativeHistorySQL,
 classifyStep3NativeHistory,step30212PendingSourcePreflightSQL,
 validateStep30212PendingSourcePreflight,step3SchemaSQL,
 verifyStep3Schema,verifyStep3Explain,
 compareImmutableBaseline} from "../lib/d1-step3-migration-contract.mjs";

const ROOT="artifacts/release",LOG=ROOT+"/d1-step3-migration-execution.json";
const SIGNED_PRODUCTION_PATH=ROOT+"/step3-production-physical-pass.json";
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
// Provider command failures must be diagnosable without logging private SQL,
 // provider responses, credentials, account identifiers or command arguments.
export function classifyStep3ProviderCommand(cmd,args){
 if(cmd==="git")return "GIT_STATUS";
 if(cmd!=="npx"||!Array.isArray(args))return "OTHER_COMMAND";
 const i=args.indexOf("d1");
 const op=args[i+1],sub=args[i+2];
 if(i<0)return "OTHER_NPX";
 if(op==="execute")return "D1_EXECUTE";
 if(op==="migrations"&&sub==="list")return "D1_MIGRATION_LIST";
 if(op==="migrations"&&sub==="apply")return "D1_MIGRATION_APPLY";
 if(op==="migrations")return "D1_MIGRATION_OTHER";
 if(op==="list")return "D1_DATABASE_LIST";
 if(op==="info")return "D1_DATABASE_INFO";
 return "D1_OTHER";
}
export function classifyStep3ProviderExit(error){
 if(Number.isInteger(error?.status)&&error.status>=0&&error.status<=255)
  return "EXIT_"+error.status;
 if(error?.code==="ETIMEDOUT")return "TIMEOUT";
 if(typeof error?.signal==="string")return "SIGNAL";
 return "UNAVAILABLE";
}
const run=(cmd,args,timeout=150000)=>{
 try{return execFileSync(cmd,args,{encoding:"utf8",
  maxBuffer:4_000_000,timeout,stdio:["ignore","pipe","pipe"],
  env:{...process.env,CI:"true"}}).trim();}
 catch(e){fail("PROVIDER_"+classifyStep3ProviderCommand(cmd,args)+
   "_"+classifyStep3ProviderExit(e))}
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
 // Production original-pointer verification occurs AFTER schema migrations.
 // Fail before backup or any DDL if the genuine existing Worker credentials
 // are not supplied. A shadow-only bearer/HMAC must never be substituted.
 if(typeof env.CONTROL_PLANE_TOKEN!=="string"||
    env.CONTROL_PLANE_TOKEN.length<32||
    !/^[a-f0-9]{64}$/iu.test(env.PHASE2H_R2_REFERENCE_HMAC_KEY??""))
  fail("PRODUCTION_POINTER_AUTH_DEPENDENCIES_UNVERIFIED");
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
 const estimate=report.operation_kind==="production"?
   report.large_0212_production_cost_envelope:null;
 const x=await checkD1PaidMonthlyHeadroom({
  lane:report.operation_kind==="shadow"?"shadow":"migration",
  estimatedMigrationRowsRead:estimate?.estimated_rows_read??0,
  estimatedMigrationRowsWritten:estimate?.estimated_rows_written??0
 });
 report.latest_headroom={stage,status:x.status,code:x.code,
  day:x.day_utc,rows_read:x.observed_rows_read,
  rows_written:x.observed_rows_written,
  read_remaining:x.remaining_rows_read,
  write_remaining:x.remaining_rows_written};
 save(report);
 if(x.status!=="PASS")throw Error(D1_PAID_HEADROOM_HOLD);
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
 const mark=(phase,target)=>{report.last_verification_checkpoint={
   migration:step.id,phase,target:target??null};save(report);};
 mark("SCHEMA_READBACK");
 const rows=q(config,step3SchemaSQL(step.objects),{maxRows:30}).rows;
 const proof=verifyStep3Schema(step.objects,rows);
 const indices=[];
 for(const name of Object.keys(step.objects).filter(isIndex)){
  mark("INDEX_QUERY_PLAN_READBACK",name);
  const sql=explainSQL[name];
  if(!sql)fail("INDEX_PLAN_NOT_DECLARED");
  const x=q(config,"EXPLAIN QUERY PLAN "+sql,{maxRows:15});
  indices.push(verifyStep3Explain(x.rows,name));
 }
 const integrity=[];
 if(step.id==="0204"){
  // Cloudflare D1 physically rejects PRAGMA integrity_check('table').
  // Fresh, provider-metered 0204 D1-supported composite proof, not an
  // assertion of SQLite low-level physical-file integrity. This requires
  // all 12 named existing indexes, positive bounded key/row membership,
  // independent UNIQUE queries, quick_check and foreign_key_check.
  // Any missing, unsupported or unexpected index fails closed BEFORE the
  // migration ledger is allowed to change to VERIFIED.
  for(const table of step.integrityTables){
   mark("D1_SUPPORTED_QUICK_FK_ALL_INDEX_AND_UNIQUE_PROOF",table);
   if(!readOnly(table))fail("INTEGRITY_TABLE_SCOPE_INVALID");
   const p=auditStep3AllIndexes(table,(sql,maxRows)=>{
    const r=q(config,sql,{maxRows});
    report.composite_integrity_rows_read??=0;
    report.composite_integrity_rows_read+=r.readRows;
    if(report.composite_integrity_rows_read>100000)
     fail("SUPPORTED_0204_INDEX_AUDIT_READ_CAP_EXCEEDED");
    return r.rows;
   });
   integrity.push(p);
  }
  const accepted=admitStep30204SupportedIntegrity(integrity);
  report.supported_integrity_0204={...accepted,
   provenance:"FRESH_SAME_TARGET_REAL_PROVIDER_D1_READ_ONLY",
   complete_sqlite_file_integrity_not_claimed:true};
  save(report);
 }else if(step.id==="0211"){
  // D1 rejects table-scoped PRAGMA integrity_check. Verify 0211's actual
  // WITHOUT ROWID PK and exact per-UTC-day canonical counter distribution,
  // as well as every reviewed source index. Isolated Shadow legitimately has
  // zero spool originals: strictly certify only EMPTY schema and no counters,
  // never an actual original/B2/signed proof. The later independent B2/HMAC
  // and dual-Worker checks are still mandatory to sign Stage1/Stage2 PASS.
  const checked=(sql,maxRows)=>{
   const r=q(config,sql,{maxRows});
   report.counter_0211_rows_read??=0;
   report.counter_0211_rows_read+=r.readRows;
   // Full-volume SQLite-side set parity may touch every source row
   // for each of 7 indexes, but the backend's actual billed reads are
   // metered and capped. An unexpectedly costly query fails Stage 2.
   if(report.counter_0211_rows_read>3000000)
    fail("SUPPORTED_0211_COUNTER_AUDIT_READ_CAP_EXCEEDED");
   return r.rows;
  };
  mark("SUPPORTED_0211_WITHOUT_ROWID_P0B_DAILY_COUNTER");
  const counter=auditStep30211WithoutRowidCounter(checked);
  mark("SUPPORTED_0211_SEVEN_SPOOL_INDEXES");
  const spool=auditStep30211SpoolSource(checked);
  const actual=(counter.status===
    "PASS_D1_0211_WITHOUT_ROWID_PK_QUICK_FK_UNIQUE_COUNTER_PARITY"&&
    spool.status==="PASS_0211_NONEMPTY_SPOOL_ALL_SEVEN_INDEX_KEYS"&&
    counter.canonical_committed_rows>0);
  const empty=(counter.status==="OBSERVED_EMPTY_COUNTER_NO_NONVACUOUS_SOURCE"&&
    spool.status==="OBSERVED_EMPTY_SOURCE_ALL_SEVEN_INDEX_STRUCTURE"&&
    counter.canonical_committed_rows===0);
  if(!actual&&!empty)
   fail("0211_D1_SUPPORTED_COUNTER_AND_SPOOL_PROOF_UNVERIFIED");
  report.supported_integrity_0211={
   status:actual?"PASS_FRESH_NONEMPTY_D1_PROVIDER_COUNTER_SPOOL_PARITY":
    "PASS_EMPTY_SHADOW_STAGING_SCHEMA_AND_ZERO_COUNTERS_ONLY",
   proof_mode:actual?"NONEMPTY_CANONICAL":"EXPLICITLY_EMPTY_SOURCE_ONLY",
   real_originals_verified_by_this_step:actual,
   index_count:7,
   sqlite_full_integrity_check_claimed:false,
   b2_original_byte_readback_claimed:false,
   production_release_authorized:false
  };
  integrity.push(counter,spool);
  save(report);
 }else if(step.id==="0213"){
  // 0213 is additive reference-schema staging, not a B2/HMAC acceptance.
  // Immediately after apply the ref table is EMPTY by design. Verify every
  // reviewed index, PK, quick_check and FK without claiming real originals.
  // On idempotent resume, a nonempty table MUST pass complete bounded
  // source/index row/key parity; neither path substitutes for independently
  // signed pointer HMAC, R2 bytes, B2 archive or two Shadow Worker probes.
  const checked=(sql,maxRows)=>{
   const r=q(config,sql,{maxRows});
   report.refs_0213_rows_read??=0;
   report.refs_0213_rows_read+=r.readRows;
   if(report.refs_0213_rows_read>100000)
    fail("SUPPORTED_0213_REF_AUDIT_READ_CAP_EXCEEDED");
   return r.rows;
  };
  const src=checked(
   'SELECT EXISTS(SELECT 1 FROM "phase2h_raw_object_refs_v1" LIMIT 1) AS has_any',1);
  if(src.length!==1||Object.keys(src[0]??{}).join()!=="has_any"||
     ![0,1].includes(src[0].has_any))
   fail("0213_REF_PRESENCE_UNVERIFIED");
  const hasRows=src[0].has_any===1;
  mark("SUPPORTED_0213_EXACT_REF_SCHEMA_AND_INDEX_PROOF",
   "phase2h_raw_object_refs_v1");
  let ref;
  if(!hasRows){
   ref=auditStep30213EmptyRefStructure(checked);
   if(ref.status!=="OBSERVED_EMPTY_REFERENCE_STRUCTURAL_ONLY"||
      ref.index_schema_count!==4||ref.observed_rows!==0||
      ref.nonvacuous_original_bytes_verified!==false||
      ref.source_pointer_hmac_verified!==false)
    fail("0213_EMPTY_REVIEWED_REF_STRUCTURE_UNVERIFIED");
  }else{
   ref=auditStep3AllIndexes("phase2h_raw_object_refs_v1",checked);
   const expected=[
    "idx_phase2h_ref_object_key_v1",
    "idx_phase2h_ref_country_category_clock_v1",
    "idx_phase2h_ref_ingest_clock_v1",
    "sqlite_autoindex_phase2h_raw_object_refs_v1_1"
   ].sort();
   const actual=ref.index_proofs?.map(x=>x.index).sort();
   if(ref.status!=="PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF"||
      ref.total_existing_indexes!==4||
      JSON.stringify(actual)!==JSON.stringify(expected)||
      ref.index_proofs.some(x=>
       x.status!=="PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"||
       !Number.isSafeInteger(x.rows_compared)||x.rows_compared<1))
    fail("0213_NONEMPTY_REF_ALL_INDEX_KEY_PARITY_UNVERIFIED");
  }
  const again=checked(
   'SELECT EXISTS(SELECT 1 FROM "phase2h_raw_object_refs_v1" LIMIT 1) AS has_any',1);
  if(again.length!==1||again[0]?.has_any!==src[0].has_any)
   fail("0213_CONCURRENT_REF_TABLE_CHANGE");
  report.supported_integrity_0213={
   status:hasRows?"PASS_FRESH_NONEMPTY_REF_INDEX_KEYS_UNSIGNED":
    "PASS_EMPTY_REVIEWED_REF_STRUCTURE_ONLY",
   provider_read_only_proven:true,index_count:4,
   real_r2_hmac_pointer_verified_by_this_step:false,
   real_b2_original_readback_verified_by_this_step:false,
   independent_signing_and_worker_proof_required:true,
   full_sqlite_file_integrity_claimed:false,
   production_release_authorized:false,canary_promoted:false
  };
  integrity.push(ref);
  save(report);
 }else if(step.id==="0212"){
  // Independent full-scope D1-supported logical integrity:
  // 1) exact source category x UTC-hour pending counts including retained
  //    zero bins; 2) five full + TWO reviewed partial source index trees;
  // 3) all fourteen 0204+0212 existing OSINT/website index memberships.
  // This never substitutes for full SQLite file integrity, real original
  // source/HMAC, B2 bytes, independent R2 checkpoint, or two Worker probes.
  const checked=(sql,maxRows)=>{
   const r=q(config,sql,{maxRows});
   report.census_0212_rows_read??=0;
   report.census_0212_rows_read+=r.readRows;
   // Exhaustive D1-side set equality may scan large source/index trees;
   // never let an unbounded operation exhaust the monthly admission.
   if(report.census_0212_rows_read>3000000)
    fail("SUPPORTED_0212_CENSUS_AUDIT_READ_CAP_EXCEEDED");
   return r.rows;
  };
  mark("SUPPORTED_0212_EXACT_CATEGORY_UTC_HOUR_COUNTER_PARITY");
  const hourly=auditStep30212ExactHourlyCounter(checked);
  if(!["PASS_D1_0212_EXACT_HOURLY_COUNTER_AND_PK_INDEX_PARITY",
       "OBSERVED_EMPTY_HOURLY_COUNTER_AND_NO_PENDING_SOURCE"].includes(
       hourly.status)||hourly.canonical_source_group_by_exact!==true)
   fail("0212_HOURLY_COUNTER_OR_SOURCE_PARITY_UNVERIFIED");
  mark("SUPPORTED_0212_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_PROOFS");
  const source=auditStep30212AllRawSourceIndexes(checked);
  if(!["PASS_0212_ALL_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_KEYS",
       "OBSERVED_0212_SOURCE_EMPTY_OR_PARTIAL_PREDICATE_UNPOPULATED"].includes(
       source.status)||
     source.index_count!==7||source.full_index_count!==5||
     source.reviewed_partial_index_count!==2||
     source.two_exact_partial_predicates_observed!==true||
     source.no_unknown_partial_indexes!==true)
   fail("0212_SEVEN_SOURCE_INDEX_INTEGRITY_UNVERIFIED");
  if(hourly.original_pending_source_nonempty!==(
      source.partial_index_proof.qualified_rows_verified>0)||
     (hourly.original_pending_source_nonempty&&
      source.raw_source_has_rows!==true))
   fail("0212_SOURCE_PARTIAL_INDEX_AND_HOURLY_PENDING_CONTRADICTION");
  mark("SUPPORTED_0212_0204_PLUS_V3_FOURTEEN_INDEX_LINEAGE");
  const lineageTables=[
   "private_osint_news_25h","private_osint_source_checks_24h",
   "website_derived_intelligence"
  ];
  const lineageInputs=lineageTables.map(table=>
   auditStep3AllIndexes(table,checked));
  const lineage=admitStep30204SupportedIntegrity(lineageInputs);
  if(lineage.status!==
      "PASS_D1_SUPPORTED_0204_PLUS_0212_FOURTEEN_INDEX_LOGICAL_INTEGRITY"||
     lineage.existing_index_count!==14||
     lineage.all_0212_v3_additive_index_memberships_verified!==true||
     lineage.later_0212_ledger_verified!==false||
     lineage.production_release_authorized!==false)
   fail("0212_REVIEWED_V3_ADDITIVE_INDEX_LINEAGE_UNVERIFIED");
  report.supported_integrity_0212={
   status:source.fully_nonvacuous_data_memberships_proven&&
       hourly.original_pending_source_nonempty?
       "PASS_FRESH_NONEMPTY_0212_CENSUS_AND_ALL_TWENTY_TWO_INDEXES":
       "PASS_REVIEWED_0212_STRUCTURE_WITH_NO_NONVACUOUS_PENDING_CLAIM",
   exact_hour_bins_verified:true,
   index_count:22,full_source_indexes:5,partial_source_indexes:2,
   verified_0204_0212_lineage_indexes:14,
   pending_source_nonempty:hourly.original_pending_source_nonempty,
   partial_indexes_both_nonvacuous:
    source.partial_index_proof.nonvacuous_index_membership_proven,
   source_original_B2_byte_readback_claimed:false,
   source_rights_verified_by_this_step:false,
   sqlite_full_file_integrity_claimed:false,
   independent_pointer_HMAC_R2_B2_and_worker_proofs_required:true,
   production_release_authorized:false,canary_promoted:false
  };
  integrity.push(hourly,source,...lineageInputs);
  save(report);
 }else{
  fail("UNREVIEWED_STEP3_MIGRATION_INTEGRITY_ID");
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
 const mark=phase=>{report.last_migration_checkpoint={
  migration:manifest.id,phase};save(report);};
 mark("BEFORE_REVIEWED_MIGRATION");
 const temp=mkdtempSync(join(privateDir,"single-"+manifest.id+"-"));
 const source=readFileSync(manifest.file,"utf8");
 if(digest(source)!==manifest.sql_sha256)
  fail("MIGRATION_FILE_CHANGED_SINCE_REVIEW");
 const filePath=join(temp,manifest.filename);
 writeFileSync(filePath,source,{mode:0o600});
 const singleConfig=runnerConfig(temp,dbId,temp);
 const args=["d1","migrations","list","DB","--remote"];
 mark("BEFORE_NATIVE_PENDING_LIST");
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
  mark("BEFORE_NATIVE_APPLY");
  wrangler(singleConfig,["d1","migrations","apply","DB","--remote"],240000);
  report.production_sql_mutated=report.operation_kind==="production";
  report.shadow_sql_mutated=report.operation_kind==="shadow";
  report.applied.push({id:manifest.id,filename:manifest.filename,
   sha256:manifest.sql_sha256,at});
  save(report);
  mark("AFTER_APPLY_BEFORE_NATIVE_HISTORY_READ");
  if(parsePending(wrangler(singleConfig,args),manifest.filename))
   fail("MIGRATION_HISTORY_PENDING_AFTER_APPLY");
  mark("BEFORE_LEDGER_APPLIED_ACK");
  writeD1Sql(config,step3LedgerStatusSQL(manifest,"APPLIED",
   new Date().toISOString(),Date.now()-began));
  mark("BEFORE_SCHEMA_INDEX_AND_INTEGRITY_READBACK");
  checkIndexAndSchema(config,manifest,report);
  mark("BEFORE_COUNTER_PARITY");
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
 // Pair exactly one provider schema/index/integrity receipt with a real
 // D1 ledger row that has just been read back as VERIFIED.
 const matched=report.verified.filter(x=>x.migration===manifest.id);
 if(matched.length!==1)
  fail("SCHEMA_LEDGER_PROOF_PAIR_MISSING_OR_DUPLICATE");
 Object.assign(matched[0],{
  id:manifest.id,migration_history_and_schema_valid:true,
  ledger_status:"VERIFIED",ledger_sql_sha256:verified.sql_sha256
 });
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
 state.proof_scope="REAL_PROVIDER_PRODUCTION";
 state.reviewed_source_sha=getHash();
 state.migration_sha256=sha256MigrationSet(manifests);
 state.github_repository=env.GITHUB_REPOSITORY??null;
 state.github_ref=env.GITHUB_REF??null;
 state.github_run_id=env.GITHUB_RUN_ID??null;
 state.production_database_uuid_sha256=createHash("sha256").update(
  String(env.D1_DATABASE_ID??"").toLowerCase()).digest("hex");
 if(!existsSync(HOLD_FILE))fail("RELEASE_HOLD_FILE_MISSING");
 try{
  approved(env);
  // Real signed Stage 1 receipt: fail closed before all provider operations.
  state.stage1_admission=admitSignedStep3ShadowReceipt({
   env,currentHead:getHash(),manifests
  });
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
  // Wrangler DB info may omit backend version even when the canonical UUID
  // has native Time Travel. An absent label is NOT real bookmark proof.
  // Reject explicit legacy alpha / unknown labels; require a genuine
  // Cloudflare native bookmark + protected encrypted R2 checkpoint below.
  const backend=summarizeD1BackendMetadata(info);
  if(backend.version_label==="alpha"||
     backend.version_label==="UNRECOGNIZED")
   fail("D1_TIME_TRAVEL_BACKEND_EXPLICITLY_UNSUPPORTED");
  state.d1_backend_advertised_version=backend.version_label;
  state.native_time_travel_bookmark_still_required=true;
  save(state);
  const nativeHistory=q(config,step3NativeHistorySQL(),{maxRows:5});
  state.native_history_preflight=classifyStep3NativeHistory(
   manifests,nativeHistory.rows);
  state.native_history_rows_read=nativeHistory.readRows;
  state.native_history_schema_presence=[];
  save(state);
  for(const manifest of manifests){
   if(state.native_history_preflight.native_applied_ids.includes(manifest.id)){
    // Applied native D1 history bypasses only the cost estimate for PENDING
    // DDL. It never bypasses later full index, counter, signer or B2 proofs.
    const observed=q(config,step3SchemaSQL(manifest.objects),{maxRows:30});
    verifyStep3Schema(manifest.objects,observed.rows);
    state.native_history_schema_presence.push({
     migration_id:manifest.id,
     status:"SCHEMA_PRESENT_NOT_FULL_INTEGRITY_VERIFIED",
     provider_rows_read:observed.readRows
    });
    save(state);
   }else if(manifest.id==="0212"){
    // The 0212 source is genuinely >3000 rows in production. Admit only a
    // reviewed one-time bounded 24k-source envelope; the entire existing
    // SQL hash, seven-index audit, pending-hour parity, and 30% Paid
    // reserve are unchanged. If unverified, stop BEFORE checkpoint/DDL.
    const source=q(config,step30212PendingSourcePreflightSQL(),{maxRows:1});
    if(source.readRows>200000)
     fail("0212_PREFLIGHT_PROVIDER_READ_COST_EXCEEDED");
    state.large_0212_production_cost_envelope=
     validateStep30212PendingSourcePreflight(source.rows);
    state.large_0212_preflight_provider_rows_read=source.readRows;
    save(state);
    await refreshedGate(state,"LARGE_0212_ESTIMATED_COST_AFTER_SOURCE_PROBE");
   }else{
    // Any other pending migration retains the strict 3k bound.
    boundedInputs(config,manifest,state);
   }
  }
  state.original_immutable_sample_sha256=baseline(config);
  const migrationSha=sha256MigrationSet(manifests);
  const checkpoint=await captureDurableD1Checkpoint({
   env,dbId:env.D1_DATABASE_ID,migrationSha});
  // Require an actual native provider bookmark, signed encrypted R2 manifest
  // and byte-for-byte R2 readback BEFORE any D1 ledger DDL/migration.
  if(checkpoint.status!=="PASS_REAL_PROVIDER_R2_BYTE_READBACK"||
     checkpoint.real_provider_bookmark_observed!==true||
     !/^[a-f0-9]{64}$/u.test(checkpoint.bookmark_sha256??"")||
     checkpoint.private_r2_encrypted_readback_verified!==true||
     checkpoint.signed_manifest_readback_verified!==true)
   fail("RECOVERY_CHECKPOINT_NOT_DURABLE");
  state.native_time_travel_provider_verified=true;
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
   if(step.id==="0212"&&state.large_0212_production_cost_envelope){
    // Re-observe a live source immediately before pending DDL. Concurrent
    // ingestion is permitted, but any increased cost reservation must be
    // re-admitted; no stale one-time quantity is treated as an atomic cap.
    const latest=q(config,step30212PendingSourcePreflightSQL(),{maxRows:1});
    if(latest.readRows>200000)
     fail("0212_FRESH_PREFLIGHT_PROVIDER_COST_EXCEEDED");
    state.large_0212_production_cost_envelope=
     validateStep30212PendingSourcePreflight(latest.rows);
    state.large_0212_refreshed_provider_rows_read=latest.readRows;
    save(state);
    await refreshedGate(state,"0212_FRESH_COST_BEFORE_DDL");
   }
   migrateOne(base,config,step,state,env.D1_DATABASE_ID,ledger);
   compareImmutableBaseline(state.original_immutable_sample_sha256,
    baseline(config));
   await refreshedGate(state,"AFTER_"+step.id);
  }
  // Production B2 physical GET must be independent of the signed
  // Stage 1 shadow B2 proof. Use one bounded canonical B2-ACK source.
  await refreshedGate(state,"PRODUCTION_BEFORE_INDEPENDENT_B2_READBACK");
  const productionSource=q(config,shadowArchivedSourceQuery(),{maxRows:1}).rows;
  if(productionSource.length!==1)
   fail("PRODUCTION_B2_ACKNOWLEDGED_ORIGINAL_UNAVAILABLE");
  state.production_b2_archive_proof=await verifyRealShadowB2Parity({
   env,source:productionSource[0]
  });
  if(state.production_b2_archive_proof.status!=="PASS_REAL_B2_BYTE_READBACK")
   fail("PRODUCTION_INDEPENDENT_B2_GET_FAILED");
  state.post_migration_hmac=await verifyHmacNewPointers(config,env);
  const final=assessStep3ProductionFinal({
   state,pointerProof:state.post_migration_hmac,
   b2Proof:state.production_b2_archive_proof
  });
  state.production_reference_table=final.production_reference_table;
  state.post_migration_readback_explicit_PASS=
   final.post_migration_readback_explicit_PASS;
  state.status=final.status;
  state.code=final.code;
  // A JSON PASS alone cannot authorize a traffic shift.
  // Sign the entire real-provider exact-main Stage2 provider proof.
  if(state.status!=="PASS")fail("FINAL_PROTECTED_READBACK_HELD");
  if(!existsSync(HOLD_FILE))fail("HOLD_REMOVED_DURING_STAGE2");
  state.hold_file_untouched=true;
  state.completed_at=new Date().toISOString();
  const signed=signStep3StatusReceipt(state,env.SIGNING_JWK);
  writeFileSync(SIGNED_PRODUCTION_PATH,
   JSON.stringify(signed,null,2)+"\n",{mode:0o600});
  state.signed_production_pass_emitted=true;
  save(state);
  return state;
 }catch(e){
  state.status="NOT_YET_VERIFIED";state.code=/^(?:STEP3_|MIGRATION_)[A-Z0-9_]+$/u.test(e?.message??"")?
   e.message:"STEP3_PROVIDER_EXECUTION_UNVERIFIED";
  state.hold_file_untouched=existsSync(HOLD_FILE);
  state.post_migration_readback_explicit_PASS=false;
  state.signed_production_pass_emitted=false;
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
 report.proof_scope="REAL_PROVIDER_SHADOW";
 report.reviewed_source_sha=getHash();
 report.migration_sha256=sha256MigrationSet(manifests);
 report.github_repository=process.env.GITHUB_REPOSITORY??null;
 report.github_ref=process.env.GITHUB_REF??null;
 report.github_run_id=process.env.GITHUB_RUN_ID??null;
 report.shadow_database_uuid_sha256=createHash("sha256").update(
  String(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"").toLowerCase()).digest("hex");
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
  writeFileSync(path,JSON.stringify(output,null,2)+"\n",{mode:0o600});
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
  // Independent B2 GET: actual compressed original, not the R2 staging copy.
  const originals=q(config,shadowArchivedSourceQuery(),{maxRows:1}).rows;
  if(originals.length!==1||
     createHash("sha256").update(originals[0].record_id).digest("hex")!==
       report.real_archived_pointer_seed.original_record_id_sha256)
   fail("SHADOW_B2_ACKNOWLEDGED_ORIGINAL_MISMATCH");
  await refreshedGate(report,"SHADOW_BEFORE_INDEPENDENT_B2_READBACK");
  report.b2_archive_proof=await verifyRealShadowB2Parity({
   env,source:originals[0]
  });
  report.b2_physical_parity_verified=
   report.b2_archive_proof.status==="PASS_REAL_B2_BYTE_READBACK";
  if(!report.b2_physical_parity_verified)
   fail("SHADOW_B2_PHYSICAL_READBACK_FAILED");
  // Two distinct ACTUALLY DEPLOYED scripts, both proven by Cloudflare
  // settings API to bind the same shadow UUID; check the old Worker after
  // expand-only DDL, then the current reference-hydration Worker.
  await refreshedGate(report,"SHADOW_BEFORE_DUAL_WORKER_PROVIDER_CHECK");
  report.dual_worker_proof=await verifyRealShadowDualWorkers({
   env,source:originals[0]
  });
  report.legacy_worker_rollback_verified=
   report.dual_worker_proof.legacy_worker_rollback_verified===true;
  report.new_worker_hydration_verified=
   report.dual_worker_proof.new_worker_hydration_verified===true;
  const shadowHost=env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST;
  const pointerProof=await verifyHmacNewPointers(config,{
   ...env,GEOMACRO_STEP3_VERIFIED_WORKER_HOST:shadowHost
  });
  report.post_migration_hmac={...pointerProof,
   b2_physical_parity:report.b2_archive_proof.status};
  report.post_migration_readback_explicit_PASS=
   report.verified.length===4&&
   report.migrations_0204_0211_0212_0213_provider_verified===true&&
   report.recovery_checkpoint_verified===true&&
   report.migration_ledger_verified===true&&
   report.legacy_worker_rollback_verified===true&&
   report.new_worker_hydration_verified===true&&
   report.b2_physical_parity_verified===true&&
   report.post_migration_hmac.cryptographic_readback_verified===true&&
   report.post_migration_hmac.all_hmac_and_r2_bytes_verified===true;
  report.status=report.post_migration_readback_explicit_PASS?"PASS":"NOT_YET_VERIFIED";
  report.code=report.status==="PASS"?
   "STEP3_REAL_SHADOW_FOUR_MIGRATIONS_DUAL_WORKER_B2_PASS":
   "STEP3_SHADOW_PHYSICAL_ACCEPTANCE_INCOMPLETE";
  report.no_real_provider_rehearsal_claimed=report.status!=="PASS";
 }catch(e){
  report.status="NOT_YET_VERIFIED";
  report.code=/^(?:STEP3_|MIGRATION_)[A-Z0-9_]+$/u.test(e?.message??"")?
    e.message:"STEP3_SHADOW_REAL_PROVIDER_REHEARSAL_NOT_VERIFIED";
 }finally{
  report.hold_file_untouched=existsSync(HOLD_FILE);
  report.production_sql_mutated=false;
  report.post_migration_readback_explicit_PASS=
   report.status==="PASS"&&
   report.post_migration_readback_explicit_PASS===true;
  report.completed_at=new Date().toISOString();
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
