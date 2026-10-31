import test from "node:test";
import assert from "node:assert/strict";
import {planPrivateOsintHeartbeats,persistPrivateOsintHeartbeats,
 OSINT_HEARTBEAT_PIPELINE} from "../lib/phase2i-osint-source-heartbeat.mjs";

const AT=new Date("2026-10-31T11:00:00.000Z");
const C=["geopolitics","macro","rare_earth"];
const coverage=(overrides={})=>({
 configured_categories:3,configured_country_category_routes:585,
 source_endpoints_attempted:446,registered_source_endpoints:446,
 category_live_source_coverage:{
  schema:"geomacro.private-osint-category-live-source-coverage.v1",
  expected_categories:3,
  category_coverage:C.map(category=>({
   category,registered:120,checked:120,healthy:18,empty:9,observed:9,
   healthy_distinct_feed_endpoints:12,
   native_dated_items_in_collector_batch:0,
   status:"LIVE_FEED_HEALTHY_NO_MATCHING_DATED_ITEMS",
   ...(overrides[category]??{})
  }))
 }
});
test("healthy zero-news categories create a truthful per-category clock, not a story",()=>{
 const rows=planPrivateOsintHeartbeats(coverage(),AT);
 assert.deepEqual(rows.map(x=>x.category),C.slice().sort());
 for(const r of rows){
  assert.equal(r.healthy,true);
  assert.equal(r.native_dated_items_in_collector_batch,0);
  assert.equal(r.new_events_verified,false);
  assert.equal(r.chargeable,false);
  assert.equal(r.checked_at,AT.toISOString());
 }
});
test("all unavailable feeds cannot masquerade as a new healthy check",()=>{
 const rows=planPrivateOsintHeartbeats(coverage({macro:{
  healthy:0,empty:0,observed:0,healthy_distinct_feed_endpoints:0,
  status:"NO_HEALTHY_FEED_THIS_TICK"
 }}),AT);
 assert.equal(rows.find(r=>r.category==="macro").healthy,false);
 assert.throws(()=>planPrivateOsintHeartbeats(coverage({macro:{
  healthy:0,healthy_distinct_feed_endpoints:10
 }}),AT),/CATEGORY_INVALID|HEALTH_CONTRADICTS/);
});
test("reject invalid three-category source provenance before any D1 write",()=>{
 assert.throws(()=>planPrivateOsintHeartbeats({
  ...coverage(),configured_country_category_routes:195},AT),/SWEEP_UNVERIFIED/);
 assert.throws(()=>planPrivateOsintHeartbeats({
  ...coverage(),category_live_source_coverage:{
   ...coverage().category_live_source_coverage,category_coverage:[
    ...coverage().category_live_source_coverage.category_coverage.slice(0,2),
    {...coverage().category_live_source_coverage.category_coverage[1]}
   ]
  }
 },AT),/CATEGORY_INVALID/);
});
test("real D1 readback checks stored category clocks even on zero-story tick",async()=>{
 const stored=new Map();let writes=0;
 const mock=({pipeline})=>{
  assert.equal(pipeline,OSINT_HEARTBEAT_PIPELINE);
  return {
   async loadRows(){return new Map(stored)},
   async persist(scope,metadata,{last_attempt_at,last_success_at}){
    writes++;
    stored.set(scope,{last_attempt_at,last_success_at,
      payload:{...metadata,cursor:undefined}});
   }
  };
 };
 const result=await persistPrivateOsintHeartbeats({
  summary:coverage({rare_earth:{healthy:0,observed:0,empty:0,
   healthy_distinct_feed_endpoints:0,status:"NO_HEALTHY_FEED_THIS_TICK"}}),
  now:AT,createClient:mock});
 assert.equal(result.d1_checkpoints_verified,3);
 assert.equal(result.healthy_categories,2);
 assert.equal(writes,3);
 assert.equal(result.per_category.rare_earth.source_transport_healthy,false);
 assert.equal(result.per_category.macro.native_dated_items_in_collector_batch,0);
 assert.equal(result.new_events_verified,false);
});
test("readback mismatch must not report a heartbeat acceptance",async()=>{
 const client=()=>({
  loadRows:async()=>new Map(),
  persist:async()=>({ok:true})
 });
 await assert.rejects(()=>persistPrivateOsintHeartbeats({
  summary:coverage(),now:AT,createClient:client
 }),/READBACK_UNVERIFIED/);
});
