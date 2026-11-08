import {test} from "node:test";
import assert from "node:assert/strict";
import quotaWorker from "../../src/middleware/quotaWorker.ts";

const now=new Date(),day=now.toISOString().slice(0,10);
const anchor=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),5);
const cycleStart=new Date(now.getTime()>=anchor?anchor:
 Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,5)).toISOString().slice(0,10);
const preceding=new Date(Date.parse(day+"T00:00:00Z")-86400000).toISOString().slice(0,10);
const canPrevious=preceding>=cycleStart;
const id1="first-production-d1-db",id2="second-production-d1-db";
const group=(date,id,rowsRead,rowsWritten)=>({
 dimensions:{date,databaseId:id},sum:{rowsRead,rowsWritten}
});
const goodRows=()=>[
 ...(canPrevious?[group(preceding,id1,40,3)]:[]),
 group(day,id1,10,1),group(day,id2,20,2)
];
function env(receipts){
 return {CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_BILLING_READ_TOKEN:"b".repeat(40),
 D1_BUDGET_INTERNAL_SECRET:"c".repeat(40),
 D1_QUOTA_DO:{
  idFromName:name=>name,
  get:()=>({fetch:async(_url,config)=>{
   receipts.push(JSON.parse(config.body));
   return Response.json({ok:true,admitted:true});
  }})
 }};
}
async function withProvider(groups,callback,errors=[]){
 const previous=globalThis.fetch;
 const received=[];
 globalThis.fetch=async(_url,init)=>{
  assert.equal(init.method,"POST");
  const {query,variables}=JSON.parse(init.body);
  assert.match(query,/d1AnalyticsAdaptiveGroups/);
  assert.equal(variables.start,cycleStart);
  assert.equal(variables.end,day);
  return Response.json({data:{viewer:{accounts:[{
   d1AnalyticsAdaptiveGroups:groups
  }]}},errors});
 };
 try{return await callback(received)}finally{globalThis.fetch=previous}
}
test("one real-provider account query aggregates month and current UTC day separately",async()=>{
 await withProvider(goodRows(),async()=>{
  const receipts=[],environment=env(receipts);
  await quotaWorker.scheduled(null,environment);
  assert.equal(receipts.length,1);
  const payload=receipts[0];
  assert.equal(payload.day,day);
  assert.equal(payload.billing_cycle_start_utc,cycleStart);
  assert.equal(payload.rows_read,30);
  assert.equal(payload.rows_written,3);
  assert.equal(payload.month_rows_read,30+(canPrevious?40:0));
  assert.equal(payload.month_rows_written,3+(canPrevious?3:0));
 });
});
test("GraphQL duplicate day/database, missing current day, errors cannot sync",async()=>{
 const invalid=[
  [...goodRows(),group(day,id1,9,2)],
  canPrevious?[group(preceding,id1,50,2)]:[],
  [group(day,id1,-1,2)],
 ];
 for(const groups of invalid){
  await withProvider(groups,async()=>{
   const receipts=[];
   await assert.rejects(()=>quotaWorker.scheduled(null,env(receipts)),
    /D1_QUOTA_GRAPHQL/);
   assert.equal(receipts.length,0);
  });
 }
 await withProvider(goodRows(),async()=>{
  const receipts=[];
  await assert.rejects(()=>quotaWorker.scheduled(null,env(receipts)),
   /D1_QUOTA_GRAPHQL_UNVERIFIED/);
  assert.equal(receipts.length,0);
 },[{message:"provider denied"}]);
});
