import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getP0bIngestionStatus} from "../../workers/control-plane/src/p0b-ingestion-status.mjs";

const workflow=readFileSync(new URL(
  "../../.github/workflows/p0b-production-parity-hourly.yml",import.meta.url),"utf8");

function mockStatusDatabase(){
  const queries=[];
  const DB={prepare(sql){
    queries.push(sql);
    return {
      bind(){return this},
      async all(){return {results:[]}},
      async first(){
        if(sql.includes("FROM source_registry"))return {total:1,enabled:1,ever_polled:1};
        if(sql.includes("FROM normalized_articles"))return {n:47};
        if(sql.includes("FROM p0b_storage_circuit"))return null;
        if(sql.includes("FROM ingestion_spool_bundles"))
          return {created:1,committed:1,dead_letter:0};
        if(sql.includes("FROM p0b_archive_outbox"))
          return {total:1,pending:0,archived:1,archived_missing_b2:0,
            bundle_journal_mismatch:0,item_journal_mismatch:0};
        throw Error("UNEXPECTED_SQL");
      }
    };
  }};
  return {DB,queries};
}
test("routine P0B health omits the normalized-article full count",async()=>{
  const {DB,queries}=mockStatusDatabase();
  const env={DB,INGEST_QUEUE:{metrics:async()=>({backlogCount:0})}};
  const response=await getP0bIngestionStatus(env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.normalized_metadata_rows,null);
  assert.equal(body.normalized_metadata_count_verified,false);
  assert.equal(body.transactional_outbox_parity.parity_deep_check_performed,false);
  assert.equal(body.live_bundle_parity.assertion_passed,false);
  assert.ok(!queries.some(q=>q.includes("FROM normalized_articles")));
  assert.ok(!queries.some(q=>q.includes("NOT EXISTS (")));
});
test("only explicitly requested deep audit computes exact count and journal parity",async()=>{
  const {DB,queries}=mockStatusDatabase();
  const env={DB,INGEST_QUEUE:{metrics:async()=>({backlogCount:0})}};
  const response=await getP0bIngestionStatus(env,{deep:true});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.normalized_metadata_rows,47);
  assert.equal(body.normalized_metadata_count_verified,true);
  assert.equal(body.transactional_outbox_parity.parity_deep_check_performed,true);
  assert.equal(body.live_bundle_parity.assertion_passed,true);
  assert.ok(queries.some(q=>q.includes("FROM normalized_articles")));
  assert.ok(queries.some(q=>q.includes("NOT EXISTS (")));
});
test("production wait uses cheap status, but actual parity verdict requires deep proof",()=>{
  const deepRequests=workflow.split("p0b/status?deep=1").length-1;
  const cheapRequests=workflow.split('p0b/status")').length-1;
  const helperCalls=workflow.split("\n").filter(line=>line.trim()==="wait_for_p0b_queue_hint").length;
  assert.equal(deepRequests,3,"initial + two separately verified phases");
  assert.equal(cheapRequests,1,"one shallow status request in bounded helper");
  assert.equal(helperCalls,2,"both phases wait on lightweight hints");
  assert.ok(workflow.includes(".live_bundle_parity.assertion_passed==true"));
  assert.ok(workflow.includes("P0B_LIVE_CANARY_BUNDLE_D1_QUEUE_PARITY_MISSING"));
  assert.ok(workflow.includes("P0B_LIVE_DAY_PARITY_ASSERTION_FAILED"));
  assert.ok(workflow.includes("P0B_REAL_B2_D1_PARITY_VERIFIED"));
});
