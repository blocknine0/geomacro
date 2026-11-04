import {test} from "node:test";
import assert from "node:assert/strict";
import {phase2hAuthorizedHistoricalRecoveryWindow,
 createPhase2hCanonicalD1,phase2hKeysetPendingPageSQL}
 from "../ops/phase2h-archive-private-raw-news.mjs";
import {planD1BundledWork} from "../ops/plan-d1-bundled-work.mjs";
const now=new Date("2026-11-04T12:00:00.000Z");
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"schedule",
 GITHUB_WORKFLOW_REF:"blocknine0/geomacro/.github/workflows/phase2h-historical-recovery-10m.yml@refs/heads/main",
 GITHUB_EVENT_PATH:"/tmp/geomacro/event.json"
};
test("history-only recovery requires exact trusted main branch and 10-minute cron event",()=>{
 const eventReader=()=>JSON.stringify({schedule:"*/10 * * * *"});
 assert.equal(phase2hAuthorizedHistoricalRecoveryWindow({env,eventReader}),true);
 for(const bad of [
  {...env,GITHUB_REF:"refs/heads/develop"},
  {...env,GITHUB_EVENT_NAME:"workflow_dispatch"},
  {...env,GITHUB_WORKFLOW_REF:"some-other-workflow.yml@refs/heads/main"},
  {...env,GITHUB_EVENT_PATH:"/tmp/untrusted.json"}
 ])assert.equal(phase2hAuthorizedHistoricalRecoveryWindow({
  env:bad,eventReader}),false);
 assert.equal(phase2hAuthorizedHistoricalRecoveryWindow({
  env,eventReader:()=>JSON.stringify({schedule:"29 0,6,12,18 * * *"})
 }),false);
});
test("historical recovery has 200-row gate after source future slots and PREDGE reserve",()=>{
 const snapshot={
  schema:"geomacro.d1-account-daily-quota-readonly.v1",
  day_utc:"2026-11-04",provider_graphql_usage_observed:true,
  observed_rows_read:400_000,observed_rows_written:5000,
  limits:{rows_read:5_000_000,rows_written:100_000},
  remaining_rows_read:4_600_000,remaining_rows_written:95_000
 };
 const grant=planD1BundledWork(snapshot,{now});
 assert.equal(grant.source_intake,true);
 assert.equal(grant.historical_recovery,true);
 assert.equal(grant.historical_recovery_max_rows,200);
 assert.equal(grant.predge_account_headroom_planning_reserve.rows_read,500_000);
 assert.equal(grant.predge_account_headroom_planning_reserve.rows_written,8000);
 assert.equal(planD1BundledWork(null,{now}).historical_recovery,false);
 assert.equal(planD1BundledWork(null,{now}).historical_recovery_max_rows,0);
});
test("1,200 retained old original rows drain in six 200-record keyset windows with <=48-row atomic ACKs",async()=>{
 const rows=Array.from({length:1200},(_,i)=>({
  record_id:(i+1).toString(16).padStart(64,"0"),
  ingested_at:"2026-10-01T00:00:00.000Z",category:["geopolitics","macro","rare_earth"][i%3],
  raw_sha256:(i+5000).toString(16).padStart(64,"0")
 }));
 const pending=new Map(rows.map(x=>[x.record_id,x]));
 const calls={reads:0,acks:0},batchSizes=[];
 const archiveEnv={
  CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"t".repeat(24),
  D1_DATABASE_ID:"00000000-0000-4000-8000-000000000001",
  GEOMACRO_COMMERCE_LEDGER_TOKEN:"private-owner-root-only-for-tests-0123456789",
  PHASE2H_BULK_WORKER_ARCHIVE_V2:"1"
 };
 const fetchImpl=async(url,init)=>{
  const parsed=new URL(url);
  assert.equal(parsed.origin,"https://geomacro-control-plane.daspallab202391.workers.dev");
  if(init.method==="PUT"){
   const body=JSON.parse(init.body);
   assert.equal(body.schema,"geomacro.phase2h.b2-archive-ack.v1");
   assert.ok(body.items.length>=1&&body.items.length<=48);
   batchSizes.push(body.items.length);calls.acks++;
   for(const x of body.items){
    assert.equal(pending.get(x.record_id)?.raw_sha256,x.raw_sha256);
    pending.delete(x.record_id);
   }
   return Response.json({ok:true,archived:body.items.length,
    independent_d1_archive_ack_verified:true,
    d1_atomic_one_statement_returning_verified:true,
    rights_verified:false,payments:0});
  }
  assert.equal(parsed.pathname,"/v1/internal/phase2h-raw-archive-export-v2");
  const limit=Number(parsed.searchParams.get("limit"));
  assert.ok(limit>=1&&limit<=25);
  const clock=parsed.searchParams.get("archive_cursor_clock");
  const id=parsed.searchParams.get("archive_cursor_id");
  const items=[...pending.values()].filter(x=>clock===null||
    x.ingested_at>clock||(x.ingested_at===clock&&x.record_id>id));
  const page=items.slice(0,limit);calls.reads++;
  return Response.json({ok:true,
   schema:"geomacro.phase2h.private-raw-archive-export-v2.v1",
   rows:page,scanned_count:page.length,
   rejected_unverified_or_expired_count:0,
   next_cursor_clock:page.at(-1)?.ingested_at??clock,
   next_cursor_id:page.at(-1)?.record_id??id,
   scan_complete:page.length<limit,source_native_clocks_unchanged:true,
   provider_d1_single_select:true,paid_eligible:false,rights_verified:false,
   raw_public_delivery:false,payments:0});
 };
 const d1=createPhase2hCanonicalD1({env:archiveEnv,fetchImpl});
 for(let pass=0;pass<6;pass++){
  const found=await d1.readPending(now,{maxRows:200});
  assert.equal(found.length,200);
  assert.ok(found.every(x=>Date.parse(x.ingested_at)<Date.parse("2026-11-01")));
  const ack=await d1.markArchived(found,"d".repeat(64),now);
  assert.equal(ack.archived,200);
  assert.equal(ack.d1_write_statements,5);
 }
 assert.equal(pending.size,0);
 assert.equal(calls.acks,30);
 assert.equal(calls.reads,48);
 assert.ok(batchSizes.every(n=>n<=48));
 const idle=await d1.readPending(now,{maxRows:200});
 assert.deepEqual(idle,[]);
 assert.equal(phase2hKeysetPendingPageSQL(25).includes("OFFSET"),false);
 assert.doesNotMatch(phase2hKeysetPendingPageSQL(25),/72\s*hours|published_at\s*>/iu);
});
