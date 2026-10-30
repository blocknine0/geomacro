import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {phase2hNewsCutoff,phase2hRawWithinRetention,planPhase2hD1RetentionDelete,
 PHASE2H_NEWS_MAX_AGE_MS} from "../lib/phase2h-retention-72h.mjs";
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
 const rows=[{record_id:"a".repeat(64),first_ingested_at:clock(61)}];
 const plan=planPhase2hD1RetentionDelete(rows,{now});
 assert.equal(plan.delete_count,1);
 assert.equal(plan.proactive_cleanup_hours,60);
 assert.throws(()=>planPhase2hD1RetentionDelete([
  {...rows[0],first_ingested_at:clock(59)}],{now}),/UNSAFE_ROW/u);
 assert.throws(()=>planPhase2hD1RetentionDelete([rows[0],rows[0]],{now}),
  /DUPLICATE/u);
 assert.throws(()=>planPhase2hD1RetentionDelete(
  Array.from({length:26},()=>rows[0]),{now}),/INPUT_INVALID/u);
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
 ])assert.throws(()=>assertPhase2hB2Lifecycle(rules),
   /PHASE2H_B2_72H_THREE_DAY_EXPIRY_NOT_PROVEN/u);
});
test("deletion run fails closed without provider admission and never changes PREDGE",async()=>{
 await assert.rejects(()=>cleanupPhase2hD1({now,env:{},fetchImpl:()=>{
  throw Error("NO_NETWORK")}}),/PROTECTED_PROVIDER_ADMISSION_REQUIRED/u);
 const wf=readFileSync(".github/workflows/phase2h-72h-news-retention.yml","utf8");
 assert.match(wf,/cron: "21 \* \* \* \*"/u);
 assert.match(wf,/needs\.quota-admission\.outputs\.retention_cleanup == 'true'/u);
 assert.match(wf,/PHASE2H_PROVIDER_RETENTION_CLEANUP/u);
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
test("bounded provider D1 60h cleanup deletes exact IDs, independently rereads and retains no source bytes",async()=>{
 const row={record_id:"a".repeat(64),first_ingested_at:clock(61)};
 const calls=[];
 const fetchImpl=async(_url,init)=>{
  const {sql,params}=JSON.parse(init.body);
  calls.push(sql);
  let results=[],meta={changes:0};
  if(sql.startsWith("SELECT record_id,first_ingested_at"))results=[row];
  else if(sql.startsWith("DELETE FROM phase2h_private_raw_news")){meta={changes:1};
   assert.equal(params[0],clock(60));}
  else if(sql.startsWith("SELECT COUNT(*)"))results=[{n:0}];
  else if(!sql.startsWith("SELECT record_id FROM"))throw Error("BAD_SQL");
  return Response.json({success:true,result:[{success:true,results,meta}]});
 };
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",PHASE2H_PROVIDER_CRITICAL:"true",
  CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  D1_DATABASE_ID:"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  CLOUDFLARE_API_TOKEN:"mock-test-token-"+("t".repeat(30))};
 const receipt=await cleanupPhase2hD1({env,now,fetchImpl});
 assert.equal(receipt.deleted_records,1);
 assert.equal(receipt.post_delete_d1_readback_verified,true);
 assert.equal(receipt.proactive_d1_cleanup_complete,true);
 assert.equal(receipt.b2_physical_deletion_verified,false);
 assert.equal(calls.length,4);
 assert.ok(calls.every(x=>x.includes("phase2h_private_raw_news")));
});

test("separate provider-retention admission permits only protected Phase2H cleanup during critical pacing hold",async()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",PHASE2H_PROVIDER_CRITICAL:"false",
  PHASE2H_PROVIDER_RETENTION_CLEANUP:"true",
  CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  D1_DATABASE_ID:"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  CLOUDFLARE_API_TOKEN:"mock-test-token-"+("t".repeat(30))};
 const sql=[];
 const fetchImpl=async(_url,opts)=>{
  const query=JSON.parse(opts.body);
  sql.push(query.sql);
  return Response.json({success:true,result:[{success:true,results:[]}]});
 };
 const r=await cleanupPhase2hD1({env,now,fetchImpl});
 assert.equal(r.deleted_records,0);
 assert.equal(sql.length,1);
 assert.ok(sql[0].includes("phase2h_private_raw_news"));
 await assert.rejects(()=>cleanupPhase2hD1({env:{...env,
  PHASE2H_PROVIDER_RETENTION_CLEANUP:"false"},now,fetchImpl}),
  /PROTECTED_PROVIDER_ADMISSION_REQUIRED/u);
});
