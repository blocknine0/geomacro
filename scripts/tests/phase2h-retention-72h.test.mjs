import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {phase2hNewsCutoff,phase2hRawWithinRetention,planPhase2hD1RetentionDelete,
 PHASE2H_NEWS_MAX_AGE_MS,PHASE2H_NEWS_CLEANUP_LIMIT,
 PHASE2H_NEWS_CLEANUP_RUN_LIMIT} from "../lib/phase2h-retention-72h.mjs";
import {assertPhase2hB2Lifecycle,PHASE2H_B2_PREFIX}
 from "../ops/phase2h-verify-b2-72h-lifecycle.mjs";
import {cleanupPhase2hD1} from "../ops/phase2h-72h-d1-cleanup.mjs";
const now=Date.parse("2026-10-30T15:00:00.000Z");
const clock=age=>new Date(now-age*3600_000).toISOString();
test("72h immutable first ingestion cutoff, 60h proactive cleanup and no late reread",()=>{
 assert.equal(PHASE2H_NEWS_MAX_AGE_MS,259200000);
 assert.equal(phase2hNewsCutoff(now),clock(72));
 assert.equal(phase2hNewsCutoff(now,60*3600_000),clock(60));
 assert.equal(phase2hRawWithinRetention({ingested_at:clock(71)},now),true);
 assert.equal(phase2hRawWithinRetention({ingested_at:clock(73)},now),false);
 assert.equal(phase2hRawWithinRetention({ingested_at:clock(72)},now),false);
 assert.equal(phase2hRawWithinRetention({ingested_at:"bad"},now),false);
 assert.equal(phase2hRawWithinRetention({ingested_at:clock(-2)},now),false);
 assert.throws(()=>phase2hNewsCutoff(now,73*3600_000),/CLOCK_INVALID/u);
});
test("D1 cleanup only accepts unique expired Phase2H row IDs in bounded batch",()=>{
 assert.equal(PHASE2H_NEWS_CLEANUP_LIMIT,100);
 assert.equal(PHASE2H_NEWS_CLEANUP_RUN_LIMIT,1000);
 const rows=[{record_id:"a".repeat(64),first_ingested_at:clock(61)}];
 const plan=planPhase2hD1RetentionDelete(rows,{now});
 assert.equal(plan.delete_count,1);
 assert.equal(plan.proactive_cleanup_hours,60);
 assert.throws(()=>planPhase2hD1RetentionDelete([
  {...rows[0],first_ingested_at:clock(59)}],{now}),/UNSAFE_ROW/u);
 assert.throws(()=>planPhase2hD1RetentionDelete([rows[0],rows[0]],{now}),
  /DUPLICATE/u);
 assert.throws(()=>planPhase2hD1RetentionDelete(
  Array.from({length:101},()=>rows[0]),{now}),/INPUT_INVALID/u);
});
test("B2 lifecycle 1 day hide + 1 day delete must cover ONLY private Phase2H archive prefix",()=>{
 assert.ok(PHASE2H_B2_PREFIX.endsWith("/phase2h-raw-news/"));
 assert.equal(assertPhase2hB2Lifecycle([{
  fileNamePrefix:PHASE2H_B2_PREFIX,
  daysFromUploadingToHiding:1,daysFromHidingToDeleting:1
 }]).deletion_within_three_days_provider_rule,true);
 for(const rules of [
  [],[{fileNamePrefix:PHASE2H_B2_PREFIX,daysFromUploadingToHiding:3,
    daysFromHidingToDeleting:1}],
  [{fileNamePrefix:PHASE2H_B2_PREFIX,daysFromUploadingToHiding:1,
    daysFromHidingToDeleting:2}],
  [{fileNamePrefix:"geomacro-evidence/v1/private/other/",
    daysFromUploadingToHiding:1,daysFromHidingToDeleting:1}],
  [{fileNamePrefix:"",daysFromUploadingToHiding:1,
    daysFromHidingToDeleting:1}],
  [{fileNamePrefix:"geomacro-evidence/v1/private/",
    daysFromUploadingToHiding:1,daysFromHidingToDeleting:1}],
  [{fileNamePrefix:PHASE2H_B2_PREFIX,daysFromUploadingToHiding:1,
    daysFromHidingToDeleting:9},
   {fileNamePrefix:PHASE2H_B2_PREFIX,daysFromUploadingToHiding:9,
    daysFromHidingToDeleting:1}],
 ])assert.throws(()=>assertPhase2hB2Lifecycle(rules),
   /PHASE2H_B2_72H_THREE_DAY_EXPIRY_NOT_PROVEN/u);
});
test("deletion run fails closed without provider admission and never changes PREDGE",async()=>{
 await assert.rejects(()=>cleanupPhase2hD1({now,env:{},fetchImpl:()=>{
  throw Error("NO_NETWORK")}}),/PROTECTED_PROVIDER_ADMISSION_REQUIRED/u);
 const wf=readFileSync(".github/workflows/phase2h-72h-news-retention.yml","utf8");
 assert.doesNotMatch(wf,/cron:|workflow_dispatch:|quota-admission:/u);
 const cycle=readFileSync(".github/workflows/phase2h-private-raw-archive.yml","utf8");
 assert.doesNotMatch(cycle,/archive-then-retention:|phase2h-72h-d1-cleanup\.mjs/u);
 const manual=readFileSync(".github/workflows/phase2h-manual-d1-storage-cleanup.yml","utf8");
 assert.doesNotMatch(manual,/schedule:\s*\n\s*- cron:/u);
 assert.match(manual,/workflow_dispatch:/u);
 assert.match(manual,/default: DO_NOT_DELETE/u);
 assert.match(manual,/DELETE_B2_ACKED_ONLY/u);
 assert.ok(cycle.includes('cron: "29 0 1 * *"'));
 assert.ok(cycle.includes("monthly archived-only cleanup"));
 assert.match(cycle,/monthly cycle captures only still-eligible last-72h rows/u);
 assert.ok(manual.includes("steps.provider.outputs.retention_cleanup == 'true'"));
 assert.match(manual,/PHASE2H_PROVIDER_RETENTION_CLEANUP/u);
 assert.doesNotMatch(wf,/PREDGE_RESEARCH|APP_SUPABASE_SERVICE_ROLE_KEY/u);
 const archive=readFileSync(".github/workflows/phase2h-private-raw-archive.yml","utf8");
 const archiveImpl=readFileSync("scripts/ops/phase2h-archive-private-raw-news.mjs","utf8");
 assert.match(archiveImpl,/lifecycleVerifier=verifyPhase2hB2Lifecycle/u);
 assert.match(archiveImpl,/fail\("LIFECYCLE_NOT_VERIFIED"\)/u);
 assert.doesNotMatch(archive,/run: node scripts\/ops\/phase2h-verify-b2-72h-lifecycle.mjs/u);
 const getter=readFileSync("workers/control-plane/src/phase2h-private-raw-news.mjs","utf8");
 assert.match(getter,/phase2hNewsCutoff\(now\)/u);
 assert.match(getter,/phase2hRawWithinRetention/u);
});
const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_WORKFLOW_REF:"blocknine0/geomacro/.github/workflows/phase2h-manual-d1-storage-cleanup.yml@refs/heads/main",
 PHASE2H_MANUAL_CLEANUP_CONFIRM:"DELETE_B2_ACKED_ONLY",
 PHASE2H_PROVIDER_RETENTION_CLEANUP:"true",
 PHASE2H_PROVIDER_CLEANUP_MAX_ROWS:"1000",
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 D1_DATABASE_ID:"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
 CLOUDFLARE_API_TOKEN:"mock-test-token-"+("t".repeat(30))};
function mockD1(rows){
 const items=[...rows],calls=[];
 const fetchImpl=async(_url,init)=>{
  const {sql,params}=JSON.parse(init.body);
  calls.push({sql,params});
  let results=[],meta={changes:0};
  if(sql.startsWith("SELECT record_id,first_ingested_at")){
   const hard=false;
   const cutoff=params[0];
   results=items.filter(x=>x.first_ingested_at<=cutoff&&
    (hard||x.b2_object_sha256!==null)).slice(0,params[1]);
  }else if(sql.startsWith("DELETE FROM phase2h_private_raw_news")){
   const archivedOnly=sql.includes("b2_object_sha256 IS NOT NULL");
   const ids=new Set(params.slice(1));
   const before=items.length;
   for(let i=items.length-1;i>=0;i--)if(ids.has(items[i].record_id)&&
       items[i].first_ingested_at<=params[0]&&
       (!archivedOnly||items[i].b2_object_sha256!==null))items.splice(i,1);
   meta={changes:before-items.length};
  }else if(sql.startsWith("SELECT COUNT(*) AS n")){
   const cutoff=params[0];
   results=[{n:items.filter(x=>x.first_ingested_at<=cutoff&&
     (!sql.includes("b2_object_sha256 IS NOT NULL")||
       x.b2_object_sha256!==null)).length}];
  }else if(sql.startsWith("SELECT record_id FROM")){
   const ids=new Set(params);
   results=items.filter(x=>ids.has(x.record_id)).map(x=>({record_id:x.record_id}));
  }else throw Error("UNEXPECTED_SQL");
  return Response.json({success:true,result:[{success:true,results,meta}]});
 };
 return {fetchImpl,calls,items};
}
test("60h proactive D1 cleanup requires B2 archive ack and independently reads back",async()=>{
 const archived={record_id:"a".repeat(64),first_ingested_at:clock(61),
  b2_object_sha256:"f".repeat(64)};
 const unarchived={record_id:"b".repeat(64),first_ingested_at:clock(61),
  b2_object_sha256:null};
 const db=mockD1([archived,unarchived]);
 const receipt=await cleanupPhase2hD1({env,now,fetchImpl:db.fetchImpl});
 assert.equal(receipt.deleted_records,1);
 assert.equal(receipt.deleted_proactively_archived,1);
 assert.equal(receipt.unarchived_expired_discarded,0);
 assert.equal(receipt.remaining_older_than_72h,0);
 assert.equal(receipt.production_acceptance_pass,true);
 assert.deepEqual(db.items,[unarchived]);
 assert.equal(db.calls.filter(x=>x.sql.startsWith("DELETE")).length,1);
 assert.equal(receipt.post_delete_d1_readback_verified,true);
});
test("unarchived originals survive manual archived-only deletion even after 72h",async()=>{
 const db=mockD1([{record_id:"c".repeat(64),first_ingested_at:clock(73),
  b2_object_sha256:null}]);
 const receipt=await cleanupPhase2hD1({env,now,fetchImpl:db.fetchImpl});
 assert.equal(receipt.deleted_hard_expired,0);
 assert.equal(receipt.unarchived_expired_discarded,0);
 assert.equal(receipt.remaining_older_than_72h,1);
 assert.equal(receipt.production_acceptance_pass,false);
 assert.equal(db.items.length,1);
});
test("bounded batch drain processes 240 IDs in 100-ID batches",async()=>{
 const rows=Array.from({length:240},(_,i)=>({
  record_id:i.toString(16).padStart(64,"0"),first_ingested_at:clock(61),
  b2_object_sha256:"f".repeat(64)
 }));
 const db=mockD1(rows);
 const receipt=await cleanupPhase2hD1({env,now,fetchImpl:db.fetchImpl});
 assert.equal(receipt.deleted_records,240);
 assert.equal(receipt.deleted_proactively_archived,240);
 assert.equal(receipt.remaining_eligible_proactive,0);
 assert.equal(receipt.production_acceptance_pass,true);
 assert.equal(db.calls.filter(x=>x.sql.startsWith("DELETE")).length,3);
 assert.ok(db.calls.filter(x=>x.sql.startsWith("SELECT record_id,first_ingested_at"))
  .every(x=>x.params[1]<=100));
});
test("quota admission is mandatory even when cleanup is required",async()=>{
 const db=mockD1([]);
 const receipt=await cleanupPhase2hD1({env,now,fetchImpl:db.fetchImpl});
 assert.equal(receipt.deleted_records,0);
 assert.equal(receipt.remaining_older_than_72h,0);
 assert.equal(receipt.production_acceptance_pass,true);
 assert.equal(db.calls.length,4);
 await assert.rejects(()=>cleanupPhase2hD1({env:{...env,
  PHASE2H_PROVIDER_RETENTION_CLEANUP:"false"},now,fetchImpl:db.fetchImpl}),
  /PROTECTED_PROVIDER_ADMISSION_REQUIRED/u);
});

test("cleanup cannot exceed provider grant or borrow critical capacity",async()=>{
 const db=mockD1(Array.from({length:23},(_,i)=>({
  record_id:i.toString(16).padStart(64,"0"),
  first_ingested_at:clock(75),b2_object_sha256:"f".repeat(64)
 })));
 const r=await cleanupPhase2hD1({env:{...env,PHASE2H_PROVIDER_CLEANUP_MAX_ROWS:"7"},
  now,fetchImpl:db.fetchImpl});
 assert.equal(r.deleted_records,7);
 assert.equal(r.remaining_older_than_72h,16);
 assert.equal(r.maximum_deletions_per_manual_run,7);
 assert.equal(r.production_acceptance_pass,false);
 for(const override of [
  {PHASE2H_PROVIDER_CLEANUP_MAX_ROWS:"1001"},
  {PHASE2H_PROVIDER_CLEANUP_MAX_ROWS:"0"},
  {PHASE2H_PROVIDER_CLEANUP_MAX_ROWS:""},
  {PHASE2H_PROVIDER_CLEANUP_MAX_ROWS:undefined},
  {PHASE2H_PROVIDER_RETENTION_CLEANUP:"false",PHASE2H_PROVIDER_CRITICAL:"true"},
  {PHASE2H_MANUAL_CLEANUP_CONFIRM:""},
  {GITHUB_EVENT_NAME:"schedule"},
  {GITHUB_WORKFLOW_REF:"blocknine0/geomacro/.github/workflows/phase2h-private-raw-archive.yml@refs/heads/main"},
 ])await assert.rejects(()=>cleanupPhase2hD1({env:{...env,...override},now,
   fetchImpl:db.fetchImpl}),/PROTECTED_PROVIDER_ADMISSION_REQUIRED/u);
});
