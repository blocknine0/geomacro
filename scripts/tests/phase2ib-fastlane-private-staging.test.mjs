import test from "node:test";
import assert from "node:assert/strict";
import {postPhase2iCollisionIsolated,planPhase2iFastlanePrivateStage,stagePhase2iFastlanePrivateOriginals}
 from "../lib/phase2ib-fastlane-private-staging.mjs";
const now=new Date("2026-10-30T10:15:00.000Z");
const base={title:"Agency confirms new mineral export regulation",
 category:"rare_earth",sourceId:"govuk_global_minerals",
 publishedAt:"2026-10-30T09:30:00.000Z",articleUrl:"https://www.gov.uk/government/news/minerals-update",
 credit:null,description:"Full article was not retrieved."};
const mk=(i,category="rare_earth")=>({...base,category,
 title:base.title+" "+i,articleUrl:"https://www.gov.uk/government/news/minerals-update-"+i});
const derive=items=>items.map(c=>({category:c.category,
 published_at:c.publishedAt,topic:"critical minerals trade",
 what_changed:"Publisher posted a mineral export regulation notice.",
 why_it_matters:"Further source verification is required."}));
const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GEOMACRO_SOURCE_INTAKE_ONLY:"1"};
test("bounded rotation stages native metadata only and never a Google discovery lead",()=>{
 const items=[...Array.from({length:12},(_,i)=>mk(i,i%2?"macro":"rare_earth")),
  {...base,sourceId:"google_minerals",articleUrl:"https://news.google.com/rss/articles/example"}];
 const plan=planPhase2iFastlanePrivateStage(items,{now,derive,maxRows:5,intervalMinutes:5});
 assert.equal(plan.observed_unique,12);
 assert.equal(plan.selected_count,5);
 assert.equal(plan.deferred_count,7);
 assert.equal(plan.index_only_excluded,1);
 assert.ok(plan.records.every(r=>r.original.original_content===null));
 assert.ok(plan.records.every(r=>r.commercial_rights_verified===false));
 assert.ok(plan.records.every(r=>r.original.full_article_html_collected===false));
 const next=planPhase2iFastlanePrivateStage(items,{now:new Date(now.getTime()+300_000),
  derive,maxRows:5,intervalMinutes:5});
 assert.notDeepEqual(plan.records.map(x=>x.record_id),next.records.map(x=>x.record_id));
});
test("small source quota never starves existing Macro and Minerals original categories",()=>{
 const originals=[
  ...Array.from({length:18},(_,i)=>mk(100+i,"geopolitics")),
  ...Array.from({length:4},(_,i)=>mk(300+i,"macro")),
  mk(500,"rare_earth"),
 ];
 const plan=planPhase2iFastlanePrivateStage(originals,{
  now,derive,maxRows:5,intervalMinutes:5,
 });
 assert.deepEqual(plan.selected_by_category,{
  geopolitics:2,macro:2,rare_earth:1,
 });
 assert.equal(plan.selected_count,5);
 assert.equal(plan.deferred_count,18);
 assert.equal(new Set(plan.records.map(x=>x.record_id)).size,5);
 const next=planPhase2iFastlanePrivateStage(originals,{
  now:new Date(now.getTime()+5*60000),derive,maxRows:5,intervalMinutes:5,
 });
 assert.deepEqual(next.selected_by_category,{
  geopolitics:2,macro:2,rare_earth:1,
 });
 assert.notDeepEqual(next.records.map(x=>x.record_id),plan.records.map(x=>x.record_id));
});
test("only protected existing source admission may write D1",async()=>{
 let called=false;
 const r=await stagePhase2iFastlanePrivateOriginals({
  candidates:[base],now,maxRows:5,intervalMinutes:5,derive,
  env:{...env,GEOMACRO_SOURCE_INTAKE_ONLY:undefined},
  post:async()=>{called=true;throw Error("NO_WRITE");},
 });
 assert.equal(r.status,"NOT_ADMITTED");
 assert.equal(called,false);
});
test("real-shaped D1 same-ID receipt is independently checked and never implies B2",async()=>{
 let observed;
 const r=await stagePhase2iFastlanePrivateOriginals({
  candidates:[mk(1,"geopolitics"),mk(2,"macro"),base],now,
  maxRows:5,intervalMinutes:5,derive,env,
  token:"a".repeat(64),
  controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
  post:async({records})=>{observed=records;return {
    stored:2,duplicate:1,readback_verified:true,
    per_original_readback_verified:true,verified_originals:records.length};},
 });
 assert.equal(observed.length,3);
 assert.equal(r.status,"CANONICAL_D1_EXACT_READBACK_VERIFIED");
 assert.equal(r.d1_inserted,2);
 assert.equal(r.d1_unchanged,1);
 assert.equal(r.per_original_authenticated_d1_verified,true);
 assert.equal(r.b2_verified,false);
 assert.equal(r.event_country_verified,false);
 assert.equal(JSON.stringify(r).includes(base.articleUrl),false);
 await assert.rejects(stagePhase2iFastlanePrivateOriginals({
  candidates:[base],now,maxRows:5,intervalMinutes:5,derive,env,
  post:async()=>({stored:0,duplicate:0,readback_verified:true}),
 }),/PHASE2IB_FASTLANE_RAW_D1_RECEIPT_INVALID/);
});
test("aggregate counts alone never impersonate per-original authenticated readback",async()=>{
 await assert.rejects(stagePhase2iFastlanePrivateOriginals({
  candidates:[base],now,maxRows:5,intervalMinutes:5,derive,env,
  post:async({records})=>({stored:records.length,duplicate:0,readback_verified:true}),
 }),/PHASE2IB_FASTLANE_RAW_D1_RECEIPT_INVALID/);
});

test("invalid native dates and missing metadata never become invented records",()=>{
 const plan=planPhase2iFastlanePrivateStage([
  {...base,publishedAt:"unverified"},
  {...base,articleUrl:"https://invalid.test/a",publishedAt:"2026-10-27T00:00:00.000Z"},
 ],{now,derive,maxRows:5,intervalMinutes:5});
 assert.equal(plan.observed_unique,0);
 assert.equal(plan.invalid_or_old,2);
});

test("one immutable original collision never discards other source originals",async()=>{
 const originals=[mk(1,"geopolitics"),mk(2,"macro"),mk(3,"rare_earth")];
 const plan=planPhase2iFastlanePrivateStage(originals,{
  now,derive,maxRows:5,intervalMinutes:5,
 });
 let attempted=0,accepted=0;
 const post=async({records})=>{
  attempted++;
  if(records.some(r=>r.category==="macro"))
   throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");
  accepted+=records.length;
  return {stored:records.length,duplicate:0,readback_verified:true,
    per_original_readback_verified:true,verified_originals:records.length};
 };
 const receipt=await postPhase2iCollisionIsolated({
  records:plan.records,post,
 });
 assert.equal(receipt.stored,2);
 assert.equal(receipt.rejected_conflicts,1);
 assert.equal(receipt.rejected_conflicts_by_category.macro,1);
 assert.equal(accepted,2);
 assert.ok(attempted<=5);
 assert.equal(receipt.readback_verified,true);
 const live=await stagePhase2iFastlanePrivateOriginals({
  candidates:originals,now,derive,maxRows:5,intervalMinutes:5,env,post,
 });
 assert.equal(live.status,"CANONICAL_D1_PARTIAL_READBACK_WITH_IMMUTABLE_CONFLICTS");
 assert.equal(live.d1_inserted,2);
 assert.equal(live.d1_rejected_conflicts,1);
 assert.equal(live.b2_verified,false);
});
test("all immutable conflicts never become a fabricated D1 readback",async()=>{
 const rows=planPhase2iFastlanePrivateStage([base],{
  now,derive,maxRows:5,intervalMinutes:5,
 }).records;
 const result=await postPhase2iCollisionIsolated({
  records:rows,post:async()=>{throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")},
 });
 assert.equal(result.rejected_conflicts,1);
 assert.equal(result.stored,0);
 assert.equal(result.readback_verified,false);
 const stage=await stagePhase2iFastlanePrivateOriginals({
  candidates:[base],now,derive,maxRows:5,intervalMinutes:5,env,
  post:async()=>{throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")},
 });
 assert.equal(stage.status,"IMMUTABLE_ORIGINAL_CONFLICTS_NO_POSITIVE_D1_RECEIPT");
 assert.equal(stage.d1_readback_verified,false);
});
test("non-collision D1 outage is never swallowed by the isolation routine",async()=>{
 await assert.rejects(postPhase2iCollisionIsolated({
  records:planPhase2iFastlanePrivateStage([base],{
   now,derive,maxRows:5,intervalMinutes:5,
  }).records,
  post:async()=>{throw Error("PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE")},
 }),/PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE/);
 await assert.rejects(postPhase2iCollisionIsolated({
  records:Array.from({length:6},(_,i)=>mk(i)),
 }),/PHASE2IB_FASTLANE_COLLISION_BATCH_CAP/);
});
