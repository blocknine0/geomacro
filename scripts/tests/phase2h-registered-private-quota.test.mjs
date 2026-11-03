import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planRegisteredPrivateOriginals}
 from "../lib/phase2h-registered-private-quota.mjs";
import {postPhase2hCollisionIsolated}
 from "../lib/phase2h-raw-original-records.mjs";
const when=new Date("2026-11-01T19:30:00.000Z");
const cats=["geopolitics","macro","rare_earth"];
const row=(i,cat=cats[i%3],date="2026-11-01T18:00:00.000Z")=>({
 record_id:i.toString(16).padStart(64,"0"),category:cat,
 original:{original_published_at:date}
});
test("registered publisher uses three-category 3/15m quota and returns truthfully deferred counts",()=>{
 const records=Array.from({length:36},(_,i)=>row(i+1));
 const a=planRegisteredPrivateOriginals(records,{now:when});
 assert.deepEqual(a.selected_by_category,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(a.selected_count,3);assert.equal(a.deferred_reobserve,33);
 assert.equal(a.max_collision_attempts,7);
 const b=planRegisteredPrivateOriginals(records,{
  now:new Date(when.getTime()+15*60_000)
 });
 assert.equal(b.selected_count,3);
 assert.equal(new Set([...a.records,...b.records].map(x=>x.record_id)).size,6);
});
test("single sparse category still fills cap, without buying extra source slots",()=>{
 const x=planRegisteredPrivateOriginals(Array.from({length:8},(_,i)=>row(i+1,"macro")),{now:when});
 assert.deepEqual(x.selected_by_category,{geopolitics:0,macro:3,rare_earth:0});
 assert.equal(x.selected_count,3);assert.equal(x.deferred_reobserve,5);
});
test("stale originals, ambiguous IDs and future clocks are not treated as a valid queue",()=>{
 const x=planRegisteredPrivateOriginals([row(1),row(2,"macro","2026-10-28T12:00:00Z"),
  row(3,"rare_earth","2026-11-01T22:00:00Z")],{now:when});
 assert.equal(x.selected_count,1);assert.equal(x.invalid_or_stale,2);
 assert.throws(()=>planRegisteredPrivateOriginals([row(1),row(1)],{now:when}),
  /REGISTERED_PRIVATE_ORIGINAL_DUPLICATE_ID/);
});
test("one immutable collision cannot halt other category originals",async()=>{
 const records=[row(1),row(2),row(3)];
 const receipt=await postPhase2hCollisionIsolated({
  records,maxAttempts:7,
  post:async({records:group})=>{
   if(group.some(x=>x.category==="macro"))
    throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");
   return {stored:group.length,duplicate:0,verified_originals:group.length,
    readback_verified:true,per_original_readback_verified:true};
  }
 });
 assert.equal(receipt.stored,2);
 assert.equal(receipt.rejected_conflicts,1);
 assert.equal(receipt.verified_originals,2);
 assert.equal(receipt.readback_verified,true);
});
test("production registered-source script actually uses guarded admission",()=>{
 const pub=readFileSync("scripts/ops/publish-all-source-reusable-news-json.ts","utf8");
 const wf=readFileSync(".github/workflows/all-source-reusable-news-json.yml","utf8");
 assert.match(pub,/planRegisteredPrivateOriginals\(phase2h.records/);
 assert.match(pub,/postPhase2hCollisionIsolated\(/);
 assert.match(pub,/const originalRows=phase2hQuota.records.map/);
 assert.match(pub,/records:originalRows/);
 assert.match(pub,/stageB2FirstPrivateOriginals/);
 assert.match(pub,/acknowledgeB2FirstD1/);
 assert.match(wf,/node --test scripts\/tests\/phase2h-registered-private-quota.test.mjs/);
 assert.match(wf,/cron: "4,19,34,49 \* \* \* \*"/);
});

test("provider-budgeted cap accepts 20 genuine distinct originals fairly",()=>{
 const records=Array.from({length:90},(_,i)=>row(i+1));
 const batch=planRegisteredPrivateOriginals(records,{now:when,maxPerSlot:20});
 assert.equal(batch.selected_count,20);
 assert.deepEqual(batch.selected_by_category,{geopolitics:7,macro:7,rare_earth:6});
 assert.equal(batch.deferred_reobserve,70);
 assert.equal(batch.max_originals_per_slot,20);
 assert.equal(batch.max_collision_attempts,41);
 const second=planRegisteredPrivateOriginals(records,{now:new Date(when.getTime()+15*60_000),maxPerSlot:20});
 assert.equal(new Set([...batch.records,...second.records].map(r=>r.record_id)).size,40);
});
test("registered cap cannot be missing, negative or above hard 20-row ceiling",()=>{
 for(const cap of [0,-1,21,100,1.5,NaN])
  assert.throws(()=>planRegisteredPrivateOriginals([row(1)],{now:when,maxPerSlot:cap}),
   /REGISTERED_PRIVATE_ORIGINAL_ADMISSION_INVALID/u);
 const src=readFileSync("scripts/ops/publish-all-source-reusable-news-json.ts","utf8");
 const workflow=readFileSync(".github/workflows/all-source-reusable-news-json.yml","utf8");
 assert.match(src,/GEOMACRO_REGISTERED_PRIVATE_MAX_NEW_ROWS/u);
 assert.match(workflow,/GEOMACRO_REGISTERED_PRIVATE_MAX_NEW_ROWS:/u);
});

test("critical-only without a source budget continues discovery, not a failing D1 publication",()=>{
 const wf=readFileSync(".github/workflows/all-source-reusable-news-json.yml","utf8");
 const match=wf.matchAll(/if: steps\.quota\.outputs\.critical == 'true' && steps\.quota\.outputs\.registered_private_max_new_rows != '0'/gu);
 assert.equal([...match].length,2);
 const zero=wf.matchAll(/if: steps\.quota\.outputs\.critical != 'true' \|\| steps\.quota\.outputs\.registered_private_max_new_rows == '0'/gu);
 assert.equal([...zero].length,2);
});
