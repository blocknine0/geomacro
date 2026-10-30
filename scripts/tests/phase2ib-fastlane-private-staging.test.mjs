import test from "node:test";
import assert from "node:assert/strict";
import {planPhase2iFastlanePrivateStage,stagePhase2iFastlanePrivateOriginals}
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
    stored:2,duplicate:1,readback_verified:true};},
 });
 assert.equal(observed.length,3);
 assert.equal(r.status,"CANONICAL_D1_EXACT_READBACK_VERIFIED");
 assert.equal(r.d1_inserted,2);
 assert.equal(r.d1_unchanged,1);
 assert.equal(r.b2_verified,false);
 assert.equal(r.event_country_verified,false);
 assert.equal(JSON.stringify(r).includes(base.articleUrl),false);
 await assert.rejects(stagePhase2iFastlanePrivateOriginals({
  candidates:[base],now,maxRows:5,intervalMinutes:5,derive,env,
  post:async()=>({stored:0,duplicate:0,readback_verified:true}),
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

test("one genuine immutable identity conflict holds only that original; valid siblings retain independent D1 ACK",async()=>{
 const originals=[mk(41,"geopolitics"),mk(42,"macro"),mk(43,"rare_earth")];
 let calls=0;
 const r=await stagePhase2iFastlanePrivateOriginals({
  candidates:originals,now,maxRows:5,intervalMinutes:5,derive,env,
  controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
  token:"a".repeat(64),
  post:async({records})=>{
   calls++;
   if(records.length>1)throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");
   if(records[0].original.original_url.endsWith("-42"))
    throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");
   return {stored:1,duplicate:0,readback_verified:true};
  }
 });
 assert.equal(calls,4);
 assert.equal(r.status,"PARTIAL_CANONICAL_D1_READBACK_COLLISION_QUARANTINED");
 assert.equal(r.selected_count,3);
 assert.equal(r.d1_inserted,2);
 assert.equal(r.d1_unchanged,0);
 assert.equal(r.collision_held,1);
 assert.equal(r.collision_held_by_category.macro,1);
 assert.equal(r.deferred_count,1);
 assert.equal(r.d1_readback_verified,true);
 assert.equal(r.all_selected_d1_readback_verified,false);
 assert.equal(r.b2_verified,false);
 assert.equal(JSON.stringify(r).includes(originals[0].articleUrl),false);
});
test("every conflicting raw ID stays held; cannot become successful raw readback",async()=>{
 const r=await stagePhase2iFastlanePrivateOriginals({
  candidates:[base],now,maxRows:5,intervalMinutes:5,derive,env,
  post:async()=>{throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");}
 });
 assert.equal(r.status,"IDENTITY_COLLISION_HELD_NO_CANONICAL_ACK");
 assert.equal(r.d1_inserted,0);
 assert.equal(r.d1_readback_verified,false);
 assert.equal(r.collision_held,1);
 assert.equal(r.deferred_count,1);
});
test("never retry forbidden access, D1 outage or invalid D1 ACK",async()=>{
 for(const reason of ["PHASE2H_PRIVATE_RAW_D1_PERSIST_UNAVAILABLE",
                      "PHASE2H_PRIVATE_D1_READBACK_MISMATCH"]){
  let calls=0;
  await assert.rejects(stagePhase2iFastlanePrivateOriginals({
   candidates:[base],now,maxRows:5,intervalMinutes:5,derive,env,
   post:async()=>{calls++;throw Error(reason);}
  }),new RegExp(reason));
  assert.equal(calls,1);
 }
});
test("a larger admitted batch never triggers unbudgeted per-record recovery",async()=>{
 let calls=0;
 await assert.rejects(stagePhase2iFastlanePrivateOriginals({
  candidates:[base,mk(41,"macro")],now,maxRows:10,intervalMinutes:5,derive,env,
  post:async()=>{calls++;throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");}
 }),/PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION/);
 assert.equal(calls,1);
});
