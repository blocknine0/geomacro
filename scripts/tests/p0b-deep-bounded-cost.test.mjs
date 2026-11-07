import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {getP0bIngestionStatus,P0B_DEEP_CENSUS_BOUND_SQL,
 P0B_DEEP_CENSUS_PROBE_LIMITS,assessP0bDeepCensusBound}
 from "../../workers/control-plane/src/p0b-ingestion-status.mjs";
const keys=["sources_over","queue_over","normalized_over","bundles_over","outbox_over"];
const zero=Object.fromEntries(keys.map(key=>[key,0]));
test("bounded original-table probe executes at most N+1 scanned entries per table",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  for(const table of Object.keys(P0B_DEEP_CENSUS_PROBE_LIMITS))
   db.exec("CREATE TABLE "+table+" (row TEXT)");
  assert.deepEqual({...db.prepare(P0B_DEEP_CENSUS_BOUND_SQL).get()},zero);
  assert.equal(assessP0bDeepCensusBound(zero).safe_to_run_exact_deep,true);
  for(let i=0;i<=64;i++)db.prepare(
   "INSERT INTO ingestion_spool_queue (row) VALUES (?)").run("x");
  const r=db.prepare(P0B_DEEP_CENSUS_BOUND_SQL).get();
  assert.equal(r.queue_over,1);
  assert.equal(assessP0bDeepCensusBound(r).safe_to_run_exact_deep,false);
  for(const alias of keys){
   assert.throws(()=>assessP0bDeepCensusBound({...zero,[alias]:null}),/UNVERIFIED/);
   assert.throws(()=>assessP0bDeepCensusBound({...zero,[alias]:2}),/UNVERIFIED/);
  }
 }finally{db.close();}
});
test("large outbox/normalized journal defers only expensive root-admin audit, never public serving or collection",async()=>{
 const sqls=[];
 const fake={prepare(sql){
  sqls.push(sql);
  const statement={bind(){return statement},async all(){return {results:[]}},
   async first(){
    if(sql===P0B_DEEP_CENSUS_BOUND_SQL)
     return {...zero,normalized_over:1};
    if(sql.includes("FROM source_registry"))return {has_enabled:1};
    if(sql.includes("FROM p0b_storage_circuit"))return null;
    if(sql.includes("FROM ingestion_spool_bundles"))
     return {has_committed_today:0,has_dead_letter_today:0};
    if(sql.includes("FROM p0b_archive_outbox"))
     return {has_pending:0,has_archived:0};
    throw Error("unexpected SQL");
   }};
  return statement;
 }};
 const status=await getP0bIngestionStatus({DB:fake},{deep:true});
 assert.equal(status.status,200);
 const value=await status.json();
 assert.equal(value.ok,true);
 assert.equal(value.deep_census_requested,true);
 assert.equal(value.deep_census_deferred,true);
 assert.equal(value.deep_census_deferred_reason,"P0B_DEEP_ROW_EXPOSURE_UNSAFE");
 assert.equal(value.live_bundle_parity.assertion_passed,false);
 assert.equal(value.transactional_outbox_parity.integrity_zero_mismatch,false);
 assert.equal(value.ready_for_real_acceptance,false);
 assert.equal(value.genuine_end_to_end_b2_remote_acceptance_proven,false);
 assert.ok(sqls.includes(P0B_DEEP_CENSUS_BOUND_SQL));
 assert.ok(sqls.every(q=>!q.includes("COUNT(*)")&&!q.includes("GROUP BY state")&&!q.includes("NOT EXISTS")));
 assert.equal(value.source_rights_promoted,false);
 assert.equal(value.paid_output_changed,false);
});
test("unknown/failed deep probe fails closed before full-table D1 scans",async()=>{
 const issued=[];
 const broken={prepare(sql){issued.push(sql);return {
  async first(){return {}}
 }}};
 const result=await getP0bIngestionStatus({DB:broken},{deep:true});
 assert.equal(result.status,503);
 const body=await result.json();
 assert.equal(body.error,"P0B_DEEP_PROBE_UNVERIFIED");
 assert.equal(body.genuine_end_to_end_b2_remote_acceptance_proven,false);
 assert.deepEqual(issued,[P0B_DEEP_CENSUS_BOUND_SQL]);
});
test("current 20-minute Hot50 source path is independent of root-admin deep audit",()=>{
 const path=new URL("../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url);
 const workflow=readFileSync(path,"utf8");
 assert.match(workflow,/cron: "6,26,46 \* \* \* \*"/);
 assert.ok(workflow.includes("needs.collect-direct-20m.result == 'failure'"));
 assert.ok(workflow.includes("encrypted-held-three-domain-20m"));
 assert.ok(!workflow.includes("p0b/status?deep=1"));
});
