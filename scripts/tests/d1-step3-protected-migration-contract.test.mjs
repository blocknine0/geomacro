import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {STEP3_MIGRATIONS,step3SqlManifests,step3SizeProbeSQL,
 validateStep3SizeProbe,step3SchemaSQL,verifyStep3Schema,
 verifyStep3Integrity,verifyStep3Explain,compareImmutableBaseline}
 from "../lib/d1-step3-migration-contract.mjs";
import {parseStep3WranglerQuery}
 from "../ops/run-step3-protected-d1-migrations.mjs";

test("only four reviewed migration SQL files exist in immutable order",()=>{
 assert.deepEqual(STEP3_MIGRATIONS.map(x=>x.id),
  ["0204","0211","0212","0213"]);
 const manifest=step3SqlManifests();
 assert.equal(manifest.length,4);
 for(const m of manifest){
  assert.match(m.sql_sha256,/^[a-f0-9]{64}$/u);
  assert(m.filename.startsWith(m.id+"_"));
  const sql=readFileSync(m.file,"utf8");
  assert(sql.length>250);
 }
 assert(manifest[2].file.includes("staged-migrations/"));
 assert(manifest[3].file.includes("staged-migrations/"));
});
test("bounded pre-seed and CREATE INDEX probe forbids >3k existing rows",()=>{
 const tables=STEP3_MIGRATIONS[0].sizeTables;
 const query=step3SizeProbeSQL(tables);
 assert.match(query,/OFFSET 3000/u);
 assert.match(query,/private_osint_news_25h/u);
 assert.match(query,/website_derived_intelligence/u);
 assert.equal(validateStep3SizeProbe(tables,
  [{over_0:0,over_1:0,over_2:0}]).status,"PASS");
 assert.throws(()=>validateStep3SizeProbe(tables,
  [{over_0:0,over_1:1,over_2:0}]),
  /SOURCE_ROWS_EXCEED_STAGED_INDEX_BUDGET/u);
 assert.throws(()=>step3SizeProbeSQL(["sqlite_master;DELETE FROM x"]),
  /TABLE_SIZE_SCOPE_INVALID/u);
});
test("exact D1 native meta readback refuses missing rows and nonzero writes",()=>{
 const positive=JSON.stringify([{success:true,results:[{name:"materialized_cache"}],
  meta:{rows_read:2,rows_written:0}}]);
 assert.equal(parseStep3WranglerQuery(positive).rows[0].name,
  "materialized_cache");
 for(const invalid of [
  JSON.stringify([{success:true,results:[],meta:{rows_read:1}}]),
  JSON.stringify([{success:true,results:[],meta:{rows_read:1,rows_written:1}}]),
  JSON.stringify([{success:false,results:[],meta:{rows_read:1,rows_written:0}}]),
  "not-json",
 ]){
  assert.throws(()=>parseStep3WranglerQuery(invalid),
   /STEP3_D1_/u);
 }
});
test("postmigration schema must contain expected indexes, table and triggers",()=>{
 for(const step of STEP3_MIGRATIONS){
  const query=step3SchemaSQL(step.objects);
  assert.match(query,/sqlite_schema WHERE name IN/u);
  const ok=Object.entries(step.objects).map(([name,type])=>({
   name,type,sql:"CREATE "+type.toUpperCase()+" "+name+" ON geomacro (id)"}));
  assert.equal(verifyStep3Schema(step.objects,ok).schema_objects_verified,
   Object.keys(step.objects).length);
  assert.throws(()=>verifyStep3Schema(step.objects,ok.slice(1)),
   /SCHEMA_OBJECT_COUNT_MISMATCH/u);
 }
});
test("SQLite index integrity and index-backed EXPLAIN are mandatory",()=>{
 assert.equal(verifyStep3Integrity([{integrity_check:"ok"}],
  "phase2h_raw_object_refs_v1").index_tree_integrity,"PASS");
 assert.throws(()=>verifyStep3Integrity([{integrity_check:"bad index"}],
  "phase2h_raw_object_refs_v1"),/INDEX_TREE_INTEGRITY_NOT_OK/u);
 assert.equal(verifyStep3Explain([{detail:"SEARCH USING COVERING INDEX idx_private_osint_country_clock_v3"}],
  "idx_private_osint_country_clock_v3").index_search_plan,"PASS");
 assert.throws(()=>verifyStep3Explain([{detail:"SCAN TABLE full"}],
  "idx_private_osint_country_clock_v3"),/INDEX_SEARCH_PLAN_NOT_VERIFIED/u);
});
test("sampled immutable source SHA cannot silently change during schema migration",()=>{
 const hash="f".repeat(64);
 assert.equal(compareImmutableBaseline(hash,hash).unchanged,true);
 assert.throws(()=>compareImmutableBaseline(hash,"0".repeat(64)),
  /LEGACY_IMMUTABLE_SAMPLE_CHANGED/u);
});
test("protected runner must never revoke canary HOLD or auto promote/migrate on CI",()=>{
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/GEOMACRO_STEP3_APPLY/u);
 assert.match(runner,/GEOMACRO_STEP3_EXACT_SHA/u);
 assert.match(runner,/runShadowBillableProbe/u);
 assert.ok(runner.includes('refreshedGate(state,"BEFORE_"+step.id)'));
 assert.match(runner,/captureDurableD1Checkpoint/u);
 assert.match(runner,/ensureLedger/u);
 assert.match(runner,/verifyRealPhase2hPointerRows/u);
 assert.doesNotMatch(runner,/pre-step3-bookmark\\.private\\.json/u);
 assert.match(runner,/post_migration_readback_explicit_PASS/u);
 assert.doesNotMatch(runner,/unlinkSync\(/u);
 assert.doesNotMatch(runner,/time-travel","restore"/u);
});


test("0204 Shadow-reviewed exact 12-index provider proof is mandatory before APPLIED ledger can reconcile",async()=>{
 const {STEP3_0204_EXPECTED_EXISTING_INDEXES,admitStep30204SupportedIntegrity}
  =await import("../lib/d1-step3-supported-integrity.mjs");
 const proofs=Object.entries(STEP3_0204_EXPECTED_EXISTING_INDEXES).map(([table,names])=>({
  table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
  total_existing_indexes:names.length,
  index_proofs:names.map(name=>({index:name,
   rows_compared:3,
   unique_verified:name.startsWith("sqlite_autoindex_"),
   status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"})),
  all_indexes_including_unique_considered:true,
  real_sqlite_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  raw_private_content_exposed:false
 }));
 const ok=admitStep30204SupportedIntegrity(proofs);
 assert.equal(ok.existing_index_count,12);
 assert.equal(ok.status,"PASS_D1_SUPPORTED_0204_THREE_TABLE_TWELVE_INDEX_INTEGRITY");
 assert.equal(ok.sqlite_integrity_check_claimed,false);
 assert.equal(ok.production_release_authorized,false);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.slice(1)),/0204_THREE_TABLES_REQUIRED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,total_existing_indexes:p.total_existing_indexes-1})),/0204_EXACT_INDEX_CARDINALITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,index_proofs:p.index_proofs.map((x,j)=>j?x:{...x,rows_compared:0})})),/0204_INDEX_REGISTRY_OR_ROW_PARITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,index_proofs:p.index_proofs.map(x=>({...x,unique_verified:false}))})),/0204_UNIQUE_INDEX_PROOF_REQUIRED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,real_sqlite_integrity_check_claimed:true})),/0204_TABLE_SUPPORTED_PROOF_UNVERIFIED/);
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/if\(step\.id==="0204"\)/u);
 assert.match(runner,/admitStep30204SupportedIntegrity\(integrity\)/u);
 assert.match(runner,/report\.composite_integrity_rows_read>100000/u);
 assert.match(runner,/FRESH_SAME_TARGET_REAL_PROVIDER_D1_READ_ONLY/u);
 assert.match(runner,/else if\(step\.id==="0212"\)/u);
 assert.match(runner,/auditStep30212ExactHourlyCounter\(checked\)/u);
 assert.match(runner,/auditStep30212AllRawSourceIndexes\(checked\)/u);
 assert.match(runner,/admitStep30204SupportedIntegrity\(lineageInputs\)/u);
 assert.match(runner,/SUPPORTED_0212_CENSUS_AUDIT_READ_CAP_EXCEEDED/u);
 assert.match(runner,/0212_SOURCE_PARTIAL_INDEX_AND_HOURLY_PENDING_CONTRADICTION/u);
 assert.match(runner,/PASS_D1_SUPPORTED_0204_PLUS_0212_FOURTEEN_INDEX_LOGICAL_INTEGRITY/u);
 assert.match(runner,/source_original_B2_byte_readback_claimed:false/u);
 assert.match(runner,/independent_pointer_HMAC_R2_B2_and_worker_proofs_required:true/u);
 assert.match(runner,/UNREVIEWED_STEP3_MIGRATION_INTEGRITY_ID/u);
 assert.match(runner,/else if\(step\.id==="0211"\)/u);
 assert.match(runner,/auditStep30211WithoutRowidCounter\(checked\)/u);
 assert.match(runner,/auditStep30211SpoolSource\(checked\)/u);
 assert.match(runner,/PASS_EMPTY_SHADOW_STAGING_SCHEMA_AND_ZERO_COUNTERS_ONLY/u);
 assert.match(runner,/SUPPORTED_0211_COUNTER_AUDIT_READ_CAP_EXCEEDED/u);
 assert.match(runner,/b2_original_byte_readback_claimed:false/u);
 assert.match(runner,/production_release_authorized:false/u);
 assert.doesNotMatch(runner,/q\(config,"PRAGMA integrity_check\(/u);
 assert.match(runner,/else if\(step\.id==="0213"\)/u);
 assert.match(runner,/auditStep30213EmptyRefStructure\(checked\)/u);
 assert.match(runner,/auditStep3AllIndexes\("phase2h_raw_object_refs_v1",checked\)/u);
 assert.match(runner,/SUPPORTED_0213_REF_AUDIT_READ_CAP_EXCEEDED/u);
 assert.match(runner,/0213_NONEMPTY_REF_ALL_INDEX_KEY_PARITY_UNVERIFIED/u);
 assert.match(runner,/real_r2_hmac_pointer_verified_by_this_step:false/u);
 assert.match(runner,/real_b2_original_readback_verified_by_this_step:false/u);
 assert.match(runner,/independent_signing_and_worker_proof_required:true/u);
 assert.match(runner,/0213_CONCURRENT_REF_TABLE_CHANGE/u);
 assert.match(runner,/step3LedgerStatusSQL\(manifest,"VERIFIED"/u);
 assert.doesNotMatch(runner,/unlinkSync\(HOLD_FILE\)/u);
});

test("real Cloudflare native Time Travel checkpoint replaces optional Wrangler backend-label assertion without relaxing DDL holds",()=>{
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/summarizeD1BackendMetadata\(info\)/u);
 assert.match(runner,/D1_TIME_TRAVEL_BACKEND_EXPLICITLY_UNSUPPORTED/u);
 assert.match(runner,/backend.version_label==="alpha"/u);
 assert.match(runner,/backend.version_label==="UNRECOGNIZED"/u);
 assert.doesNotMatch(runner,/info\?\.version!=="production"/u);
 assert.match(runner,/checkpoint\.real_provider_bookmark_observed!==true/u);
 assert.match(runner,/checkpoint\.private_r2_encrypted_readback_verified!==true/u);
 assert.match(runner,/checkpoint\.signed_manifest_readback_verified!==true/u);
 assert.match(runner,/native_time_travel_provider_verified=true/u);
 const actualBookmark=runner.indexOf("checkpoint.real_provider_bookmark_observed!==true");
 const firstDdl=runner.indexOf("ensureLedger(config,manifests,state)");
 assert(actualBookmark>0&&firstDdl>actualBookmark,
  "actual native provider bookmark and immutable signed R2 recovery must precede DDL");
 assert.match(runner,/if\(!existsSync\(HOLD_FILE\)\)fail\("HOLD_REMOVED_DURING_STAGE2"\)/u);
});
