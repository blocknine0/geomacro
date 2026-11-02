import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {corridorWatchTick,corridorWatchRead} from "../../workers/control-plane/src/corridor-pipeline-health.mjs";
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL("../../workers/control-plane/migrations/0101_corridor_pipeline_health.sql",import.meta.url),"utf8"));
 db.exec("CREATE TABLE reusable_news_items(first_seen_at TEXT);CREATE TABLE corridor_native_news_candidates(first_ingested_at TEXT);"+
 "CREATE TABLE corridor_official_reference_context(first_seen_at TEXT);CREATE TABLE corridor_private_derived_research(created_at TEXT)");
 return {db,env:{DB:{prepare(q){return {
  bind(...a){return {first:async()=>db.prepare(q).get(...a)??null,all:async()=>({results:db.prepare(q).all(...a)}),
   run:async()=>({meta:{changes:db.prepare(q).run(...a).changes}})}},
  first:async()=>db.prepare(q).get()??null,all:async()=>({results:db.prepare(q).all()})}}}}};
}
test("three different source arrivals without structured output queue one alert, no duplicate on retry",async()=>{
 const {db,env}=fixture(),t=Date.parse("2026-11-02T10:07:00Z");
 for(let i=0;i<3;i++){
  const now=t+i*900000;
  db.prepare("INSERT INTO reusable_news_items VALUES(?)").run(new Date(now-1000).toISOString());
  const state=await corridorWatchTick(env,{now});
  assert.equal(state.source_without_structured_streak,i+1);
 }
 assert.equal(db.prepare("SELECT COUNT(*) n FROM corridor_pipeline_alerts").get().n,1);
 const result=await corridorWatchTick(env,{now:t+2700000});
 assert.equal(result.alerts_enqueued,false);
 assert.equal((await corridorWatchRead(env)).status,200);
});
test("repeated poll does not count new source and actual five-part derivation resets streak",async()=>{
 const {db,env}=fixture(),t=Date.parse("2026-11-02T10:07:00Z");
 db.prepare("INSERT INTO reusable_news_items VALUES(?)").run(new Date(t-1000).toISOString());
 assert.equal((await corridorWatchTick(env,{now:t})).source_without_structured_streak,1);
 assert.equal((await corridorWatchTick(env,{now:t+900000})).source_without_structured_streak,1);
 db.prepare("INSERT INTO corridor_private_derived_research VALUES(?)").run(new Date(t+901000).toISOString());
 assert.equal((await corridorWatchTick(env,{now:t+1800000})).source_without_structured_streak,0);
});
test("invalid D1 fails closed",async()=>{
 assert.deepEqual(await corridorWatchTick({}),{ok:false,error:"CORRIDOR_WATCH_D1_UNAVAILABLE"});
});
