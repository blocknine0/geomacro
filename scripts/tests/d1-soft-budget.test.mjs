import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {reserveD1PhysicalRows,D1BudgetHold} from "../../workers/control-plane/src/d1-soft-budget.mjs";

const migration=readFileSync(new URL(
 "../../workers/control-plane/migrations/0205_d1_internal_soft_budget.sql",import.meta.url),"utf8");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(migration);
 const prepare=(sql,args=[])=>({
  bind(...values){return prepare(sql,values)},
  async run(){
   if(/\bRETURNING\b/iu.test(sql)){
    const results=db.prepare(sql).all(...args);
    return {success:true,results,meta:{changes:results.length}};
   }
   const result=db.prepare(sql).run(...args);
   return {success:true,results:[],meta:{changes:result.changes}};
  },
  async first(){return db.prepare(sql).get(...args)??null},
 });
 return {db,DB:{prepare,async batch(statements){
  db.exec("BEGIN IMMEDIATE");
  try{
   const result=[];
   for(const statement of statements)result.push(await statement.run());
   db.exec("COMMIT");
   return result;
  }catch(error){db.exec("ROLLBACK");throw error}
 }},close(){db.close()}};
}
const iso=ms=>new Date(ms).toISOString();
const day=ms=>iso(ms).slice(0,10);

test("D1 token bucket enforces 7500-row burst and 125-row/minute refill",async()=>{
 const f=fixture();
 const t=Date.parse("2026-11-06T09:00:00.000Z");
 try{
  const first=await reserveD1PhysicalRows(f.DB,{
   dayUtc:day(t),providerObserved:170000,estimatedRows:2000,
   observedAt:iso(t),nowMs:t,
  });
  assert.equal(first.reserved_rows,2000);
  assert.equal(first.bucket_capacity_rows,7500);
  assert.equal(first.refill_rows_per_minute,125);
  assert.equal(first.tokens_milli,5500000);
  const second=await reserveD1PhysicalRows(f.DB,{
   dayUtc:day(t),providerObserved:172002,estimatedRows:500,
   observedAt:iso(t+60000),nowMs:t+60000,
  });
  assert.equal(second.reserved_rows,2500);
  assert.equal(second.provider_highwater,172002);
  assert.equal(second.tokens_milli,5125000);
 }finally{f.close()}
});

test("cumulative daily soft ceiling blocks even when token balance remains",async()=>{
 const f=fixture();
 const t=Date.parse("2026-11-06T09:00:00.000Z");
 try{
  const allowed=await reserveD1PhysicalRows(f.DB,{
   dayUtc:day(t),providerObserved:179000,estimatedRows:1000,
   observedAt:iso(t),nowMs:t,
  });
  assert.equal(allowed.reserved_rows,1000);
  await assert.rejects(()=>reserveD1PhysicalRows(f.DB,{
   dayUtc:day(t),providerObserved:179000,estimatedRows:1,
   observedAt:iso(t+1000),nowMs:t+1000,
  }),D1BudgetHold);
  assert.equal(f.db.prepare(
   "SELECT reserved_rows FROM geomacro_d1_soft_write_budget WHERE day_utc=?"
  ).get(day(t)).reserved_rows,1000);
 }finally{f.close()}
});

test("stale provider counters fail before any budget write",async()=>{
 const f=fixture();
 const t=Date.parse("2026-11-06T09:00:00.000Z");
 try{
  await assert.rejects(()=>reserveD1PhysicalRows(f.DB,{
   dayUtc:day(t),providerObserved:1,estimatedRows:20,
   observedAt:iso(t-180001),nowMs:t,
  }),/STALE_PROVIDER_COUNTER/);
  assert.equal(f.db.prepare(
   "SELECT COUNT(*) AS n FROM geomacro_d1_soft_write_budget"
  ).get().n,0);
 }finally{f.close()}
});
