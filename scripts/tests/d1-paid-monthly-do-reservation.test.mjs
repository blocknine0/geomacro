import {test} from "node:test";
import assert from "node:assert/strict";
import {QuotaBudgetDO} from "../../src/middleware/quotaCircuitBreaker.ts";

const key="s".repeat(64);
const today=()=>new Date().toISOString().slice(0,10);
const cycle=()=>{
 const now=new Date(),anchor=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),5);
 return new Date(now.getTime()>=anchor?anchor:
  Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,5)).toISOString().slice(0,10);
};
function harness(){
 const mem=new Map();
 const ctx={storage:{transaction:async fn=>fn({
  get:async k=>mem.get(k),
  put:async(k,v)=>{mem.set(k,structuredClone(v))}
 })}};
 const worker=new QuotaBudgetDO(ctx,{D1_BUDGET_INTERNAL_SECRET:key});
 const post=async(route,body,authenticated=true)=>{
  const res=await worker.fetch(new Request("https://quota.internal"+route,{
   method:"POST",headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+(authenticated?key:"bad")},body:JSON.stringify(body)
  }));
  return {status:res.status,body:await res.json()};
 };
 const sync=(monthRead=100,monthWrite=100,read=10,written=10,day=today(),billingCycle=cycle())=>
  post("/sync",{day,rows_read:read,rows_written:written,
   month_rows_read:monthRead,month_rows_written:monthWrite,
   billing_cycle_start_utc:billingCycle});
 const reserve=(reads=20,writes=20,operation_id="test_paid_reserve_001",lane="background")=>
  post("/reserve",{day:today(),max_rows_read:reads,max_rows_written:writes,
   operation_id,lane});
 return {post,sync,reserve,mem};
}
test("monthly sync is mandatory before any D1 reservation",async()=>{
 const h=harness();
 const held=await h.reserve();
 assert.equal(held.status,503);
 assert.equal(held.body.code,"D1_PAID_MONTHLY_PROVIDER_USAGE_STALE");
});
test("real 30 percent monthly write reserve is a distinct hard admission gate",async()=>{
 const h=harness();
 assert.equal((await h.sync(2000,34_999_998)).status,200);
 const held=await h.reserve(1,3);
 assert.equal(held.status,429);
 assert.equal(held.body.code,"D1_PAID_MONTHLY_30PCT_RESERVE_PROTECTED");
 const admitted=await h.reserve(1,2,"test_paid_reserve_002");
 assert.equal(admitted.body.admitted,true);
 assert.equal(admitted.body.monthly_emergency_reserve_percent,30);
 assert.equal(admitted.body.monthly_write_remaining_bound,0);
});
test("30 percent monthly read reserve is independently protected",async()=>{
 const h=harness();
 assert.equal((await h.sync(17_499_999_999,100)).status,200);
 const held=await h.reserve(2,1);
 assert.equal(held.body.code,"D1_PAID_MONTHLY_30PCT_RESERVE_PROTECTED");
 assert.equal((await h.reserve(1,1,"test_paid_reserve_003")).status,200);
});
test("monthly proof rejects missing, stale-cycle and counter rewind",async()=>{
 const h=harness();
 const noMonth=await h.post("/sync",{day:today(),rows_read:10,rows_written:10});
 assert.equal(noMonth.status,503);
 assert.equal((await h.sync(100,100,10,10,today(),"2020-01-05")).status,503);
 assert.equal((await h.sync(100,100)).status,200);
 assert.equal((await h.sync(99,100)).body.code,"D1_PROVIDER_COUNTER_REWIND");
 assert.equal((await h.sync(100,99)).body.code,"D1_PROVIDER_COUNTER_REWIND");
 const unauth=await h.post("/reserve",{day:today(),
  max_rows_read:1,max_rows_written:1,operation_id:"test_paid_reserve_004"},false);
 assert.equal(unauth.status,403);
});
test("hourly and daily ceilings remain independent of monthly reserve",async()=>{
 const h=harness();
 assert.equal((await h.sync(100,100,10,1_100_000)).status,503);
 assert.equal((await h.sync(1000,1_100_000,10,1_100_000)).status,200);
 assert.equal((await h.reserve(1,1)).body.code,"D1_PAID_OWNER_DAILY_CEILING_OPEN");
});
