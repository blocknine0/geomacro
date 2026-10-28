import test from "node:test";
import assert from "node:assert/strict";
import {validatePrivateD1Log,validateReplayD1Log,
 verifyPrivateD1RunReceipts} from "../ops/d1-launch-github-verification.mjs";

const sha="a".repeat(40),now=new Date("2026-10-28T08:45:00.000Z");
const critical={schema:"geomacro.private-osint-15m-durable-production-receipt.v1",
 d1_write_exact_readback_verified:true,
 separate_private_d1_readback_verified:true,
 private_three_category_bundle_readback_verified:true,
 d1_usage_metadata_complete:true,private_osint_d1_persisted:true,
 news_rows_verified_in_d1:768,excluded_by_d1_capacity:0,
 d1_rows_read_for_write_batches:6695,d1_rows_written_for_write_batches:211,
 private_source_url:"DO_NOT_LOG_OR_EXPORT"};
const replay={schema:"geomacro.private-osint-spool-replay.v1",
 all_backlog_artifacts_deleted_after_strict_receipt:true,
 d1_exact_readback_verified:true,d1_capacity_excluded:0,
 d1_persisted:11,distinct_items_eligible:11,duplicate_items_suppressed:3,
 raw_source_title:"DO_NOT_LOG_OR_EXPORT"};
const line=obj=>"2026-10-28T08:42:00Z "+JSON.stringify(obj)+"\n";
test("private D1 receipt requires truly independent strict readback",()=>{
 assert.deepEqual(validatePrivateD1Log(line(critical)),{
  independent_d1_readback_verified:true,d1_rows_verified:768,
  d1_rows_read_in_write_batches:6695,d1_rows_written_in_write_batches:211,
  receipt_type:"AUTHENTICATED_MAIN_JOB_INDEPENDENT_D1_READBACK"});
 assert.throws(()=>validatePrivateD1Log(line({...critical,separate_private_d1_readback_verified:false})),
  /RECEIPT_INVALID/);
});
test("held replay receipt proves exact D1 persistence and deletion-after-readback",()=>{
 const result=validateReplayD1Log(line(replay));
 assert.equal(result.verified_replayed_items,11);
 assert.equal(result.duplicate_items_suppressed,3);
 assert.throws(()=>validateReplayD1Log(line({...replay,d1_persisted:4})),/RECEIPT_INVALID/);
 const quiet=validateReplayD1Log(line({schema:replay.schema,
  state:"NO_FRESH_ENCRYPTED_BACKLOG",d1_write_attempted:false,inventoried_artifacts:8}));
 assert.equal(quiet.verified_replayed_items,0);
});
test("authenticated job logs never return private source bytes",async()=>{
 let requests=0;
 const fetchImpl=async url=>{
  requests++;
  const data=url.includes("/workflows/")?
    {workflow_runs:[{id:42,head_branch:"main",head_sha:sha,
     event:"schedule",conclusion:"success",status:"completed",
     updated_at:"2026-10-28T08:40:00.000Z"}]}:
   url.includes("/runs/42/jobs")?
    {jobs:[{id:101,name:"collect-private",conclusion:"success",status:"completed"},
      {id:102,name:"Recover one encrypted held-source batch into verified canonical D1",
       conclusion:"success",status:"completed"}]}:
   url.includes("/jobs/101/logs")?null:
   url.includes("/jobs/102/logs")?null:null;
  if(url.includes("/jobs/101/logs"))return new Response(line(critical));
  if(url.includes("/jobs/102/logs"))return new Response(line(replay));
  return Response.json(data);
 };
 const x=await verifyPrivateD1RunReceipts({env:{GH_TOKEN:"b".repeat(30),GITHUB_SHA:sha},
  fetchImpl,now});
 assert.equal(x.critical.independent_d1_readback_verified,true);
 assert.equal(x.recovery.verified_replayed_items,11);
 assert.equal(requests,4);
 assert.equal(JSON.stringify(x).includes("DO_NOT_LOG_OR_EXPORT"),false);
});
test("stale or mismatched main run, missing replay, missing auth fail closed",async()=>{
 const fetchImpl=async()=>Response.json({workflow_runs:[{id:42,
  head_branch:"main",head_sha:"f".repeat(40),event:"schedule",
  conclusion:"success",status:"completed",updated_at:"2026-10-28T08:40:00.000Z"}]});
 const x=await verifyPrivateD1RunReceipts({env:{GH_TOKEN:"b".repeat(30),GITHUB_SHA:sha},
  fetchImpl,now});
 assert.equal(x.critical.independent_d1_readback_verified,false);
 assert.equal(x.recovery.verified_replayed_items,null);
 assert.equal((await verifyPrivateD1RunReceipts({env:{},fetchImpl,now})).critical.independent_d1_readback_verified,false);
});
