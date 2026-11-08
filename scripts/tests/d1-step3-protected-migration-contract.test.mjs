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
 assert.match(runner,/refreshedGate\(state,"BEFORE_"+step.id\)/u);
 assert.match(runner,/time-travel","info"/u);
 assert.match(runner,/post_migration_readback_explicit_PASS/u);
 assert.doesNotMatch(runner,/unlinkSync\(/u);
 assert.doesNotMatch(runner,/time-travel","restore"/u);
});
