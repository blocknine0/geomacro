import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {reserveD1PhysicalReadRows,D1ReadBudgetHold} from "../../workers/control-plane/src/d1-read-soft-budget.mjs";

const migration=readFileSync(new URL(
 "../../workers/control-plane/migrations/0206_d1_internal_soft_read_budget.sql",
 import.meta.url),"utf8");
const budget=JSON.parse(readFileSync(new URL(
 "../../config/geomacro-cloudflare-five-usd-budget.json",import.meta.url),"utf8"));
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(migration);
 const prepare=(sql,args=[])=>({
  bind(...values){return prepare(sql,values)},
  async first(){return db.prepare(sql).get(...args)??null},
 });
 return {db,DB:{prepare},close(){db.close()}};
}
const iso=ms=>new Date(ms).toISOString();
const day=ms=>iso(ms).slice(0,10);

test("D1 read token bucket enforces 20k burst, 70 rows/minute refill and 120k daily ceiling",async()=>{
 const f=fixture(),t=Date.parse("2026-11-06T09:00:00.000Z");
 try{
  const a=await reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(t),providerObserved:0,estimatedRows:10_000,
   observedAt:iso(t),nowMs:t,
  });
  assert.equal(a.reserved_rows,10_001);
  assert.equal(a.ledger_read_overhead_reserved,1);
  assert.equal(a.bucket_capacity_rows,20_000);
  assert.equal(a.refill_rows_per_minute,70);
  assert.equal(budget.paid_admission.d1_source_daily_soft_rows_read_max,120_000);
  await assert.rejects(()=>reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(t),providerObserved:0,estimatedRows:10_000,
   observedAt:iso(t),nowMs:t,
  }),D1ReadBudgetHold);
  const minute=t+60_000;
  const b=await reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(minute),providerObserved:0,estimatedRows:69,
   observedAt:iso(minute),nowMs:minute,
  });
  assert.equal(b.ok,true);
  assert.equal(b.reserved_rows,10_071);
 }finally{f.close()}
});

test("stale provider read counters fail before reservation",async()=>{
 const f=fixture(),t=Date.parse("2026-11-06T09:00:00.000Z");
 try{
  await assert.rejects(()=>reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(t),providerObserved:0,estimatedRows:1,
   observedAt:iso(t-120_001),nowMs:t,
  }),error=>error instanceof D1ReadBudgetHold&&
   error.message==="D1_READ_ADMISSION_STALE_PROVIDER_COUNTER");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM geomacro_d1_soft_read_budget").get().n,0);
 }finally{f.close()}
});

test("daily read headroom denial creates no first ledger row and does not over-reserve",async()=>{
 const f=fixture(),t=Date.parse("2026-11-06T09:00:00.000Z");
 try{
  await assert.rejects(()=>reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(t),providerObserved:120_000,estimatedRows:1,
   observedAt:iso(t),nowMs:t,
  }),D1ReadBudgetHold);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM geomacro_d1_soft_read_budget").get().n,0);
  await reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(t),providerObserved:0,estimatedRows:100,
   observedAt:iso(t),nowMs:t,
  });
  await assert.rejects(()=>reserveD1PhysicalReadRows(f.DB,{
   dayUtc:day(t),providerObserved:119_899,estimatedRows:100,
   observedAt:iso(t),nowMs:t,
  }),D1ReadBudgetHold);
  assert.equal(f.db.prepare("SELECT reserved_rows AS n FROM geomacro_d1_soft_read_budget").get().n,101);
 }finally{f.close()}
});
