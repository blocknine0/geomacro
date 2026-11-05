import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
 consumePredgeResearchDailyBudget,SECURITY_COUNTER_SQL,
} from "../../workers/control-plane/src/central-security-budget.mjs";
const NOW=Date.parse("2026-11-05T17:10:00Z");
function fixture(){
 const sql=readFileSync(new URL(
  "../../workers/control-plane/migrations/0019_central_security_budget.sql",
  import.meta.url),"utf8");
 const db=new DatabaseSync(":memory:");
 db.exec(sql);
 const sqlCalls=[];
 const env={prepare(sql){sqlCalls.push(sql);return{
  bind(...args){return{first:async()=>db.prepare(sql).get(...args)??null}}
 }}};
 return {db,env,sqlCalls,close(){db.close()}};
}
test("Predge 500/day remains exact, one D1 row/request, no second client row",async()=>{
 const f=fixture();
 try{
  for(let i=1;i<=500;i++){
   const granted=await consumePredgeResearchDailyBudget(f.env,{now:NOW});
   assert.equal(granted.allowed,true);
   assert.equal(granted.atomic_global_slot,true);
   assert.equal(granted.physical_d1_counter_rows_written,1);
   assert.equal(granted.daily_utc_request_hard_cap,500);
  }
  const denied=await consumePredgeResearchDailyBudget(f.env,{now:NOW});
  assert.equal(denied.allowed,false);
  const rows=f.db.prepare("SELECT route_class,bucket_kind,bucket_key,request_count FROM "+
   "central_security_budget").all();
  assert.equal(rows.length,1);
  assert.deepEqual({...rows[0]},{
   route_class:"predge_research_news",bucket_kind:"global",
   bucket_key:"all",request_count:501,
  });
  assert.equal(f.sqlCalls.length,501);
  assert.ok(f.sqlCalls.every(x=>x===SECURITY_COUNTER_SQL));
  assert.equal((await consumePredgeResearchDailyBudget(f.env,{
   now:Date.parse("2026-11-06T00:00:00Z")})).allowed,true);
  const active=f.db.prepare("SELECT request_count FROM central_security_budget "+
   "WHERE route_class='predge_research_news' AND bucket_kind='global'").get();
  assert.equal(active.request_count,1);
 }finally{f.close()}
});
test("Predge reserves the same global row that other distributed security calls use",async()=>{
 const f=fixture();
 try{
  const start=Math.floor(NOW/86400000)*86400;
  // An existing central-security/budget call using Predge's route consumed
  // a count earlier: single-purpose bearer cannot get another independent cap.
  const fromOriginalRoute=f.db.prepare(SECURITY_COUNTER_SQL).get(
   "predge_research_news","global","all",start,501);
  assert.equal(fromOriginalRoute.request_count,1);
  const next=await consumePredgeResearchDailyBudget(f.env,{now:NOW});
  assert.equal(next.allowed,true);
  assert.equal(f.db.prepare("SELECT request_count FROM central_security_budget").get().request_count,2);
 }finally{f.close()}
});
test("D1 missing/failed/ambiguous receipt and changed policy never allow research",async()=>{
 for(const db of [
  null,
  {prepare(){throw Error("SQL provider 7500 body hidden")}},
  {prepare:()=>({bind:()=>({first:async()=>null})})},
  {prepare:()=>({bind:()=>({first:async()=>({request_count:Infinity})})})},
  {prepare:()=>({bind:()=>({first:async()=>({request_count:-1})})})},
 ]){
  await assert.rejects(()=>consumePredgeResearchDailyBudget(db,{now:NOW}),
   /PREDGE_RESEARCH_GOVERNOR_/);
 }
 await assert.rejects(()=>consumePredgeResearchDailyBudget({
  prepare(){throw Error("should never read clock")}},{
    now:Number.NaN}),/CONFIGURATION_UNAVAILABLE/);
});
