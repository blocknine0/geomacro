import test from "node:test";
import assert from "node:assert/strict";
import {planHourlyPrivateOriginals,HOURLY_PRIVATE_ORIGINAL_LIMIT}
 from "../lib/phase2h-hourly-quota.mjs";
import {readFileSync} from "node:fs";
const start=new Date("2026-11-01T19:07:00.000Z");
const row=(i,category,publishedAt="2026-11-01T17:20:00.000Z")=>({
 record_id:i.toString(16).padStart(64,"0"),category,
 original:{original_published_at:publishedAt}
});
const cats=["geopolitics","macro","rare_earth"];
test("hourly raw writer has a hard cap and per-category fairness",()=>{
 const rows=Array.from({length:90},(_,i)=>row(i+1,cats[i%3]));
 const first=planHourlyPrivateOriginals(rows,{now:start});
 assert.equal(first.admitted,HOURLY_PRIVATE_ORIGINAL_LIMIT);
 assert.equal(first.observed_unique,90);
 assert.equal(first.deferred_for_next_hour,75);
 assert.deepEqual(first.by_category,{geopolitics:5,macro:5,rare_earth:5});
 assert.equal(first.max_collision_attempts,31);
 assert.equal(first.predge_modified,false);
 assert.equal(first.paid_eligible,false);
 assert.equal(new Set(first.records.map(r=>r.record_id)).size,15);
 const same=planHourlyPrivateOriginals([...rows].reverse(),{now:start});
 assert.deepEqual(same.records.map(r=>r.record_id),first.records.map(r=>r.record_id));
 const later=planHourlyPrivateOriginals(rows,{now:new Date(start.getTime()+3600000)});
 assert.equal(later.admitted,15);
 assert.equal(new Set([...later.records,...first.records].map(x=>x.record_id)).size,30);
});
test("sparse category capacity is used without starving available originals",()=>{
 const rows=Array.from({length:37},(_,i)=>row(i+1,"macro"));
 const chosen=planHourlyPrivateOriginals(rows,{now:start});
 assert.equal(chosen.admitted,15);
 assert.deepEqual(chosen.by_category,{geopolitics:0,macro:15,rare_earth:0});
 assert.equal(chosen.deferred_for_next_hour,22);
});
test("stale, future or invalid observations cannot be admitted or revived",()=>{
 const eligible=row(1,"macro");
 const bad=[row(2,"macro","2026-10-28T10:00:00Z"),
  row(3,"rare_earth","2026-11-01T22:00:00Z"),
  {record_id:"not-sha",category:"geopolitics",original:{original_published_at:start.toISOString()}}];
 const result=planHourlyPrivateOriginals([eligible,...bad],{now:start});
 assert.equal(result.admitted,1);
 assert.equal(result.expired_or_invalid,3);
 assert.equal(result.records[0],eligible);
 assert.equal(result.future_publication_guaranteed,false);
});
test("contradictory same-ID rows never overwrite a canonical original",()=>{
 const a=row(1,"macro"),b={...a,original:{original_published_at:"2026-11-01T17:30:00Z"}};
 assert.throws(()=>planHourlyPrivateOriginals([a,b],{now:start}),
  /HOURLY_PRIVATE_ORIGINAL_DUPLICATE_ID/);
});
test("bounded admission is wired to existing protected publisher not a new cron",()=>{
 const pub=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
 const workflow=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
 assert.match(pub,/planHourlyPrivateOriginals\(plan.records/);
 assert.match(pub,/records:admission.records/);
 assert.match(pub,/maxAttempts:admission.max_collision_attempts/);
 assert.match(pub,/deferred_for_next_hour:admission.deferred_for_next_hour/);
 assert.match(workflow,/node --test scripts\/tests\/phase2h-hourly-quota.test.mjs/);
 assert.match(workflow,/cron: "7 \* \* \* \*"/);
});
