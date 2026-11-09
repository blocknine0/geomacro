import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 STEP3_NEXT_STAGE_READONLY_PROBES,
 verifyStep3NextReadonlyPlan,summarizeStep3NextProbe,
 classifyStep3NextStageReadiness
} from "../lib/d1-step3-next-migration-inventory.mjs";

const get=id=>{
 const p=STEP3_NEXT_STAGE_READONLY_PROBES.find(x=>x.id===id);
 assert.ok(p);
 return p;
};
test("exact 13 fixed SQL probes are SELECT/PRAGMA-only and capped",()=>{
 assert.equal(STEP3_NEXT_STAGE_READONLY_PROBES.length,13);
 assert.equal(verifyStep3NextReadonlyPlan(),true);
 assert.equal(STEP3_NEXT_STAGE_READONLY_PROBES.filter(x=>x.kind==="capacity").length,5);
 assert.equal(STEP3_NEXT_STAGE_READONLY_PROBES.filter(x=>x.kind==="indexes").length,5);
 for(const p of STEP3_NEXT_STAGE_READONLY_PROBES){
  assert.match(p.sql,/^(SELECT |PRAGMA index_list\()/);
  assert.doesNotMatch(p.sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM)\b/iu);
  assert.ok(p.maxRows<=32);
 }
 assert.throws(()=>verifyStep3NextReadonlyPlan([
  ...STEP3_NEXT_STAGE_READONLY_PROBES.slice(0,-1),
  {...get("cap_ingestion_spool_queue"),sql:"DELETE FROM ingestion_spool_queue"}
 ]),/READONLY_ALLOWLIST_CHANGED/);
});
test("source row cap must come from exact provider result (never unbounded COUNT)",()=>{
 const p=get("cap_ingestion_spool_queue");
 assert.match(p.sql,/LIMIT 1 OFFSET 3000/);
 assert.doesNotMatch(p.sql,/\bCOUNT\(\*\)/u);
 assert.equal(summarizeStep3NextProbe(p,[{has_row:1,over_3000:0}]).status,"OBSERVED_BOUNDED");
 const big=summarizeStep3NextProbe(p,[{has_row:1,over_3000:1}]);
 assert.equal(big.status,"HOLD_SOURCE_EXCEEDS_3000_STAGED_DDL_ROWS");
 assert.equal(big.beyond_3000,true);
 assert.throws(()=>summarizeStep3NextProbe(p,[{has_row:0,over_3000:1}]),/CAPACITY_RESULT_UNVERIFIED/);
 assert.throws(()=>summarizeStep3NextProbe(p,[{has_row:1,over_3000:0,secret:"private"}]),/CAPACITY_RESULT_UNVERIFIED/);
 assert.throws(()=>summarizeStep3NextProbe(p,[]),/CAPACITY_RESULT_UNVERIFIED/);
});
test("ONLY actual reviewed 4 migration names and 4 ledger states admitted",()=>{
 const history=get("native_history_4"),ledger=get("ledger_4");
 const m=summarizeStep3NextProbe(history,[{name:"0204_d1_read_hotspot_optimization.sql"}]);
 assert.deepEqual(m.present_migrations,["0204_d1_read_hotspot_optimization.sql"]);
 assert.throws(()=>summarizeStep3NextProbe(history,[{name:"other_fake.sql"}]),/NATIVE_MIGRATION_HISTORY_UNVERIFIED/);
 const v=summarizeStep3NextProbe(ledger,[{migration_id:"0204",status:"APPLIED"}]);
 assert.deepEqual(v.entries,[{id:"0204",status:"APPLIED"}]);
 assert.throws(()=>summarizeStep3NextProbe(ledger,[{migration_id:"0204",status:"PAID"}]),/LEDGER_STATUS_UNVERIFIED/);
 assert.throws(()=>summarizeStep3NextProbe(ledger,[{migration_id:"0204",status:"APPLIED"},{migration_id:"0204",status:"APPLIED"}]),/LEDGER_STATUS_UNVERIFIED/);
});
test("schema output contains no SQL or provider private content, records WITHOUT ROWID",()=>{
 const schema=get("next_schema");
 const r=summarizeStep3NextProbe(schema,[{type:"table",name:"p0b_committed_day_totals",
   sql:"CREATE TABLE p0b_committed_day_totals(day_utc TEXT PRIMARY KEY) WITHOUT ROWID"}]);
 assert.deepEqual(r.objects,[{name:"p0b_committed_day_totals",
  type:"table",without_rowid:true}]);
 assert.equal(JSON.stringify(r).includes("CREATE TABLE"),false);
 assert.throws(()=>summarizeStep3NextProbe(schema,[{name:"unknown_table",type:"table",sql:"CREATE TABLE unknown_table"}]),/SCHEMA_RESULT_UNVERIFIED/);
});
test("index catalog rejects unfamiliar names and partial indexes are not certified",()=>{
 const p=get("indexes_phase2h_private_raw_news");
 const row={seq:0,name:"idx_phase2h_sample",unique:1,origin:"c",partial:1};
 const result=summarizeStep3NextProbe(p,[row]);
 assert.equal(result.has_partial,true);
 assert.equal(result.has_unique,true);
 assert.equal(result.status,"OBSERVED_INDEX_CATALOG");
 assert.throws(()=>summarizeStep3NextProbe(p,[{...row,name:"unsafe; DROP TABLE x"}]),/INDEX_CATALOG_UNVERIFIED/);
});
test("next-stage inventory never authorizes Stage2, canary, full integrity or migration",()=>{
 const all=STEP3_NEXT_STAGE_READONLY_PROBES.map(p=>{
  if(p.kind==="capacity")
   return summarizeStep3NextProbe(p,[{has_row:1,over_3000:0}]);
  if(p.kind==="native")return summarizeStep3NextProbe(p,[{name:"0204_d1_read_hotspot_optimization.sql"}]);
  if(p.kind==="ledger")return summarizeStep3NextProbe(p,[{migration_id:"0204",status:"APPLIED"}]);
  if(p.kind==="schema")return summarizeStep3NextProbe(p,[]);
  return summarizeStep3NextProbe(p,[]);
 });
 const a=classifyStep3NextStageReadiness(all);
 assert.equal(a.status,"OBSERVED_ONLY");
 assert.equal(a.reason,"0204_LEDGER_RECONCILIATION_PENDING");
 assert.equal(a.stage2_authorized,false);
 assert.equal(a.canary_promoted,false);
 assert.equal(a.next_step3_ddl_provider_verified,false);
 const large=all.map(x=>x.id==="cap_ingestion_spool_queue"?{...x,status:"HOLD_SOURCE_EXCEEDS_3000_STAGED_DDL_ROWS"}:x);
 assert.equal(classifyStep3NextStageReadiness(large).status,"HOLD");
 assert.equal(classifyStep3NextStageReadiness(all.slice(1)).status,"HOLD");
 const diagnostic=readFileSync("scripts/ops/step3-shadow-0204-readonly-diagnostic.mjs","utf8");
 const workflow=readFileSync(".github/workflows/step3-shadow-0204-readonly-diagnostic.yml","utf8");
 assert.match(diagnostic,/STEP3_NEXT_STAGE_READONLY_PROBES/);
 assert.match(diagnostic,/next_step3_observation/);
 assert.match(diagnostic,/production_sql_mutated:false/);
 assert.match(workflow,/git ls-remote https:\/\/github.com\/blocknine0\/geomacro.git refs\/heads\/main/);
 assert.match(workflow,/check-d1-paid-monthly-headroom.mjs --check/);
 assert.doesNotMatch(workflow,/--apply|d1 migrations apply|canary-promoter/);
});
