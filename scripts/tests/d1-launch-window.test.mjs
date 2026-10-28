import test from "node:test";
import assert from "node:assert/strict";
import {evaluateD1LaunchWindow} from "../lib/d1-launch-window.mjs";
const T=Date.parse("2026-10-25T00:15:00.000Z");
function sample(i){
 const dt=new Date(T+i*3_600_000).toISOString(),day=dt.slice(0,10);
 return {schema:"geomacro.d1-launch-hourly-receipt.v1",
  observed_at_utc:dt,
  provider:{verified:true,day_utc:day,rows_read:(i%24+1)*1000,rows_written:(i%24+1)*10},
  public:{verified:true,http_status:200},
  critical:{independent_d1_readback_verified:true},
  deploy:{exact_main_sha_verified:true},
  backlog:{verified:true,pending_artifacts:0,aged_out_artifacts:0},
  recovery:{verified_replayed_items:0}};
}
const good=()=>Array.from({length:74},(_,i)=>sample(i));
test("strict 72h accepts genuine hourly provider/critical/public receipts",()=>{
 const result=evaluateD1LaunchWindow(good());
 assert.equal(result.status,"ACCEPTED");
 assert.equal(result.daily.length,4);
 assert.equal(result.samples,73);
});
test("cannot accept missing real ingestion or exact deployed source proof",()=>{
 const rows=good();rows[25].critical.independent_d1_readback_verified=false;
 rows[26].deploy.exact_main_sha_verified=false;
 const result=evaluateD1LaunchWindow(rows);
 assert.equal(result.status,"PENDING");
 assert.ok(result.reasons.includes("CRITICAL_INGESTION_READBACK_NOT_VERIFIED"));
 assert.ok(result.reasons.includes("PRODUCTION_SHA_NOT_VERIFIED"));
});
test("missing intervals and row quota breach fail closed",()=>{
 const rows=good().filter((_,i)=>i!==30);
 rows[40].provider.rows_read=5_000_000;
 const result=evaluateD1LaunchWindow(rows);
 assert.equal(result.status,"PENDING");
 assert.ok(result.reasons.includes("MISSING_HOURLY_RECEIPTS"));
 assert.ok(result.reasons.includes("D1_DAILY_QUOTA_EXHAUSTED"));
});
test("held backlog requires independently verified replay counters",()=>{
 const rows=good();rows[15].backlog.pending_artifacts=4;
 const result=evaluateD1LaunchWindow(rows);
 assert.ok(result.reasons.includes("DEFERRED_REPLAY_NOT_OBSERVED"));
 rows[18].recovery.verified_replayed_items=4;
 rows[18].recovery.source_run_id=109;
 assert.equal(evaluateD1LaunchWindow(rows).status,"ACCEPTED");
});
test("unknown counters, counter resets within UTC day or aged queue never pass",()=>{
 const rows=good();
 rows[4].provider.verified=false;
 rows[10].backlog.aged_out_artifacts=1;
 rows[12].recovery.verified_replayed_items=null;
 assert.equal(evaluateD1LaunchWindow(rows).status,"PENDING");
 assert.ok(evaluateD1LaunchWindow(rows).reasons.includes("UNRECOVERABLE_BACKLOG_AGE"));
 assert.throws(()=>evaluateD1LaunchWindow([{}]),/SCHEMA_INVALID/);
});

test("same successful replay run across hourly receipts is counted once",()=>{
 const rows=good();
 rows[15].backlog.pending_artifacts=4;
 rows[18].recovery={verified_replayed_items:4,source_run_id:109};
 rows[19].recovery={verified_replayed_items:4,source_run_id:109};
 const assessed=evaluateD1LaunchWindow(rows);
 assert.equal(assessed.status,"ACCEPTED");
 assert.equal(assessed.verified_replayed_items,4);
});
