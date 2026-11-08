import test from "node:test";
import assert from "node:assert/strict";
import {QuotaBudgetDO} from "../../src/middleware/quotaCircuitBreaker.ts";
import {COST_METERS,cloudflareCycleId} from "../../src/middleware/cloudflareMeterBudget.mjs";

const normalSecret="normal_"+("n".repeat(40)),emergencySecret="emergency_"+("e".repeat(40));
function fixture(){
 const values=new Map();
 const ctx={storage:{transaction:async fn=>fn({
  get:async k=>structuredClone(values.get(k)),
  put:async(k,v)=>{values.set(k,structuredClone(v))}
 })}};
 const env={D1_BUDGET_INTERNAL_SECRET:normalSecret,
  D1_BUDGET_EMERGENCY_SECRET:emergencySecret};
 const worker=new QuotaBudgetDO(ctx,env);
 const request=async(path,body,{emergency=false,auth=true}={})=>{
  const headers={"Content-Type":"application/json",
   ...(auth?{Authorization:"Bearer "+normalSecret}:{}),
   ...(emergency?{"X-GeoMacro-Emergency-Authorization":emergencySecret}:{})};
  const response=await worker.fetch(new Request("https://quota.internal"+path,{
   method:"POST",headers,body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json()};
 };
 return {request,values};
}
const all=()=>Object.fromEntries(Object.keys(COST_METERS).map(x=>[x,0]));
const today=()=>new Date().toISOString().slice(0,10);
const cycle=()=>cloudflareCycleId(new Date());

test("monthly usage requires complete provider meter observation",async()=>{
 const f=fixture();
 assert.equal((await f.request("/sync-monthly",{cycle:cycle(),meters:{workers_requests:0}})).status,503);
 assert.equal((await f.request("/reserve-monthly",{cycle:cycle(),meter:"workers_requests",units:1,lane:"normal"})).status,503);
 assert.equal((await f.request("/sync-monthly",{cycle:cycle(),meters:all()})).status,200);
 assert.equal((await f.request("/reserve-monthly",{cycle:cycle(),meter:"workers_requests",units:1,lane:"normal"})).status,200);
});
test("monthly cap blocks a product even if every other product has free headroom",async()=>{
 const f=fixture(),meters=all();meters.queues_standard_operations=800000;
 assert.equal((await f.request("/sync-monthly",{cycle:cycle(),meters})).status,200);
 assert.equal((await f.request("/reserve-monthly",{cycle:cycle(),meter:"queues_standard_operations",units:1,lane:"normal"})).status,429);
 assert.equal((await f.request("/reserve-monthly",{cycle:cycle(),meter:"workers_requests",units:1,lane:"normal"})).status,200);
 assert.equal((await f.request("/reserve-monthly",{cycle:cycle(),meter:"r2_infrequent_access",units:1,lane:"normal"})).status,503);
});
test("emergency quota is inside included limit and requires distinct owner secret",async()=>{
 const f=fixture(),m=all();m.queues_standard_operations=800000;
 await f.request("/sync-monthly",{cycle:cycle(),meters:m});
 const req={cycle:cycle(),meter:"queues_standard_operations",units:5000,lane:"emergency"};
 assert.equal((await f.request("/reserve-monthly",req)).status,403);
 for(let i=0;i<20;i++)
  assert.equal((await f.request("/reserve-monthly",req,{emergency:true})).status,200);
 assert.equal((await f.request("/reserve-monthly",req,{emergency:true})).status,429);
});
test("normal 120k D1 daily ticket never borrows the protected 20k",async()=>{
 const f=fixture();
 await f.request("/sync",{day:today(),rows_read:119999,rows_written:119999});
 const item={day:today(),operation_id:"source-ticket-0001",max_rows_read:1,max_rows_written:1};
 assert.equal((await f.request("/reserve",item)).status,200);
 assert.equal((await f.request("/reserve",{...item,operation_id:"source-ticket-0002"})).status,429);
 assert.equal((await f.request("/reserve",{...item,lane:"emergency",operation_id:"emergency-0001"})).status,403);
 assert.equal((await f.request("/reserve",{...item,lane:"emergency",operation_id:"emergency-0001"},{emergency:true})).status,200);
});
test("daily emergency is limited to 20k and total 140k",async()=>{
 const f=fixture();
 await f.request("/sync",{day:today(),rows_read:120000,rows_written:120000});
 for(let i=0;i<4;i++){
  const a=await f.request("/reserve",{day:today(),lane:"emergency",
   operation_id:"emergency-batch-"+i,max_rows_read:5000,max_rows_written:5000},{emergency:true});
  assert.equal(a.status,200);
 }
 assert.equal((await f.request("/reserve",{day:today(),lane:"emergency",
  operation_id:"emergency-overflow",max_rows_read:1,max_rows_written:1},{emergency:true})).status,429);
});
test("provider meter rewind and stale usage cannot authorize new work",async()=>{
 const f=fixture(),m=all();m.workers_requests=3000;
 await f.request("/sync-monthly",{cycle:cycle(),meters:m});
 assert.equal((await f.request("/sync-monthly",{cycle:cycle(),meters:all()})).status,503);
 for(const [k,v]of f.values){if(k.startsWith("monthly:")){
  v.provider_observed_at=Date.now()-300000;f.values.set(k,v);
 }}
 assert.equal((await f.request("/reserve-monthly",{cycle:cycle(),meter:"workers_requests",units:1,lane:"normal"})).status,503);
});
test("auth is mandatory for provider sync and quota reserve",async()=>{
 const f=fixture();
 assert.equal((await f.request("/sync-monthly",{cycle:cycle(),meters:all()},{auth:false})).status,403);
 assert.equal((await f.request("/sync",{day:today(),rows_read:0,rows_written:0},{auth:false})).status,403);
});
