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
        // Bounded deep gate is cheap and runs before any full-table SQL.
        if(sql.includes("AS sources_over") && sql.includes("AS outbox_over"))
          return {sources_over:0,queue_over:0,normalized_over:0,
            bundles_over:0,outbox_over:0};
        // Deep journal SQL embeds bundle/article subqueries; classify it first.
        if(sql.includes("FROM p0b_archive_outbox"))
          return sql.includes("EXISTS(")?
            {has_pending:0,has_archived:1}:
            {total:1,pending:0,archived:1,archived_missing_b2:0,
              bundle_journal_mismatch:0,item_journal_mismatch:0};
        if(sql.includes("FROM source_registry"))
          return sql.includes("EXISTS(")?{has_enabled:1}:{total:1,enabled:1,ever_polled:1};
        if(sql.includes("FROM normalized_articles"))return {n:47};
        if(sql.includes("FROM p0b_storage_circuit"))return null;
        if(sql.includes("FROM ingestion_spool_bundles"))
          return sql.includes("EXISTS(")?
            {has_committed_today:1,has_dead_letter_today:0}:
            {created:1,committed:1,dead_letter:0};
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
  assert.equal(body.source_registry.total,null);
  assert.equal(body.source_registry.enabled,null);
  assert.equal(body.source_registry.has_enabled,true);
  assert.equal(body.queue_state,null);
  assert.equal(body.queue_state_counts_exhaustive,false);
  assert.equal(body.cheap_queue_readiness_hint.ready_for_deep_check,true);
  assert.equal(body.cheap_queue_readiness_hint.proves_integrity,false);
  assert.equal(body.live_bundle_parity.b2_objects_created,null);
  assert.equal(body.transactional_outbox_parity.total_bundle_records,null);
  assert.ok(queries.every(q=>!q.includes("GROUP BY state")));
  assert.ok(queries.some(q=>q.includes("EXISTS(SELECT 1 FROM source_registry")));
  assert.ok(queries.some(q=>q.includes("EXISTS(SELECT 1 FROM p0b_archive_outbox")));
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
  assert.equal(body.source_registry.enabled,1);
  assert.equal(body.queue_state_counts_exhaustive,true);
  assert.equal(body.cheap_queue_readiness_hint.proves_integrity,false);
});
test("production wait uses cheap status, but actual parity verdict requires deep proof",()=>{
  const deepRequests=workflow.split("p0b/status?deep=1").length-1;
  const cheapRequests=workflow.split('p0b/status")').length-1;
  const helperCalls=workflow.split("\n").filter(line=>line.trim()==="wait_for_p0b_queue_hint").length;
  assert.equal(deepRequests,3,"initial + two separately verified phases");
  assert.equal(cheapRequests,1,"one shallow status request in bounded helper");
  assert.equal(helperCalls,2,"both phases wait on lightweight hints");
  assert.ok(workflow.includes(".live_bundle_parity.assertion_passed==true"));
  assert.ok(workflow.includes(".cheap_queue_readiness_hint.ready_for_deep_check==true"));
  assert.ok(workflow.includes(".cheap_queue_readiness_hint.proves_integrity==false"));
  assert.ok(workflow.includes("P0B_LIVE_CANARY_BUNDLE_D1_QUEUE_PARITY_MISSING"));
  assert.ok(workflow.includes("P0B_LIVE_DAY_PARITY_ASSERTION_FAILED"));
  assert.ok(workflow.includes("P0B_REAL_B2_D1_PARITY_VERIFIED"));
});
