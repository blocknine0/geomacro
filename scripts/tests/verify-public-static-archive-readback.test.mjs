import test from "node:test";
import assert from "node:assert/strict";
import {verifyPublicStaticArchiveReadback,verifyConvergedPublicStaticArchiveReadback} from "../lib/verify-public-static-archive-readback.mjs";

const NOW=Date.parse("2026-10-29T01:00:00.000Z");
const native="2026-10-29T00:10:00.000Z";
const index={schema:"geomacro.permanent-derived-news-archive-index.v1",
  total_signals:100,updated_at:native,months:["2026-10"],categories:["geopolitics","macro","rare_earth"],seed_complete:true};
const signal={id:"macro-12345678",published_at:native,category:"macro",
  title:"Geomacro finds an original macro policy update",sources_credited:["Federal Reserve Board"]};
const latest={ok:true,schema:"geomacro.website-derived-news-feed.v1",
  checked_at:new Date(NOW).toISOString(),delivery_scope:"free_website_only",
  chargeable:false,scored:false,supabase_dependency:false,
  retention_days:3,retention_hours:72,original_release_delay_minutes:0,
  signals:[signal]};
const coverage={schema:"geomacro.free-derived-archive-eligibility.v1",
  checked_at:new Date(NOW).toISOString(),retention_hours:72,
  free_website_only:true,unverified_promoted:false,signed_or_scored:false,
  paid_customer_eligible:false,live_payment_authorized:false,d1_reads:0,
  eligible_ids_sha256:"a".repeat(64),original_release_eligible_total:1,
  free_displayable_findings_total:1,free_displayable_outside_latest_preview:0};
function fixture(){
 return {expectedIndex:index,expectedLatest:latest,expectedCoverage:coverage,
  liveIndex:structuredClone(index),liveLatest:structuredClone(latest),
  liveCoverage:structuredClone(coverage),now:NOW};
}
test("scheduled no-op with identical native IDs, credits and coverage permits harmless clock offset",()=>{
 const v=fixture();
 const older=new Date(NOW-12*60_000).toISOString();
 v.liveLatest.checked_at=older;v.liveCoverage.checked_at=older;
 const receipt=verifyPublicStaticArchiveReadback(v);
 assert.equal(receipt.public_latest_readback_verified,true);
 assert.equal(receipt.public_72h_coverage_exact_readback_verified,true);
 assert.equal(receipt.full_72h_eligible_ids_hash_verified,true);
 assert.equal(receipt.deliberate_noop_clock_difference_accepted,true);
 assert.equal(receipt.d1_reads,0);
 assert.equal(receipt.predge_gets,0);
});
test("changed ID, native date, attribution, or rights flags fails readback",()=>{
 for(const mutate of [
  v=>v.liveLatest.signals[0].id="macro-abcdef12",
  v=>v.liveLatest.signals[0].published_at="2026-10-29T00:11:00.000Z",
  v=>v.liveLatest.signals[0].sources_credited=[],
  v=>v.liveCoverage.paid_customer_eligible=true,
  v=>v.liveCoverage.eligible_ids_sha256="b".repeat(64),
  v=>v.liveCoverage.original_release_eligible_total=0,
  v=>v.liveIndex.total_signals=99,
 ]){
  const v=fixture();mutate(v);
  assert.throws(()=>verifyPublicStaticArchiveReadback(v),
   /PERMANENT_ARCHIVE_STATIC_READBACK_/);
 }
});
test("missing, stale/future and inconsistent clocks never certify static archive",()=>{
 for(const mutate of [
  v=>v.liveCoverage=null,
  v=>v.liveLatest.checked_at=new Date(NOW-7*60*60_000).toISOString(),
  v=>v.liveCoverage.checked_at=new Date(NOW+2*60_000).toISOString(),
  v=>v.liveLatest.checked_at=new Date(NOW-50_000).toISOString(),
 ]){
  const v=fixture();mutate(v);
  assert.throws(()=>verifyPublicStaticArchiveReadback(v),
    /PERMANENT_ARCHIVE_STATIC_READBACK_/);
 }
});

test("async edge propagation: split snapshots fail until the complete cohort converges",async()=>{
 const f=fixture(),old=new Date(NOW-4*60*60_000).toISOString();
 let pulls=0,delayCalls=0;
 const receipt=await verifyConvergedPublicStaticArchiveReadback({
  expectedIndex:index,expectedLatest:latest,expectedCoverage:coverage,
  now:()=>NOW,attempts:3,delayMs:0,sleep:async()=>{delayCalls++},
  read:async path=>{
   if(path==="/index.json"){pulls++;return structuredClone(index);}
   if(path==="/latest.json")return structuredClone(latest);
   if(path==="/coverage-72h.json"){
    return {...structuredClone(coverage),
     checked_at:pulls===1?old:coverage.checked_at};
   }
   throw Error("unexpected path");
  }
 });
 assert.equal(receipt.verified_as_single_coherent_cohort,true);
 assert.equal(receipt.public_static_cohort_attempts,2);
 assert.equal(delayCalls,1);
});
test("persistent mismatched/stale static snapshots never PASS after all bounded retries",async()=>{
 const old=new Date(NOW-4*60*60_000).toISOString();
 for(const damaged of [
  {...coverage,checked_at:old},
  {...coverage,eligible_ids_sha256:"f".repeat(64)},
  {...coverage,paid_customer_eligible:true}
 ]){
  let reads=0;
  await assert.rejects(verifyConvergedPublicStaticArchiveReadback({
   expectedIndex:index,expectedLatest:latest,expectedCoverage:coverage,
   now:()=>NOW,attempts:2,delayMs:0,sleep:async()=>{},
   read:async path=>{
    reads++;
    if(path==="/index.json")return structuredClone(index);
    if(path==="/latest.json")return structuredClone(latest);
    return structuredClone(damaged);
   }
  }),/PERMANENT_ARCHIVE_STATIC_READBACK_/u);
  assert.equal(reads,6);
 }
});
test("static generation clock split fails even when live asset clocks agree",()=>{
 const f=fixture();
 f.expectedCoverage={...coverage,checked_at:new Date(NOW-60_000).toISOString()};
 assert.throws(()=>verifyPublicStaticArchiveReadback(f),
  /PERMANENT_ARCHIVE_STATIC_READBACK_BUILT_SNAPSHOT_CLOCK_SPLIT/u);
});
