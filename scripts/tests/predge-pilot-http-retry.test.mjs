import test from "node:test";
import assert from "node:assert/strict";
import {fetchProtectedPilot} from "../ops/predge-pilot-http-retry.mjs";
const URL="https://control.example/v1/internal/predge-pilot-news-context-publish";
const response=(status,onCancel=()=>{})=>({status,body:{cancel:async()=>onCancel()}});
test("transient 503 retries once with the identical protected request",async()=>{
 const seen=[],delays=[];let cancels=0;
 const result=await fetchProtectedPilot(URL,{method:"PUT",body:"signed-payload",
   headers:{authorization:"Bearer "+ "a".repeat(64)}},{
   fetchImpl:async(u,o)=>{seen.push([u,o.method,o.body,o.headers.authorization]);
     return response(seen.length===1?503:200,()=>cancels++);},
   sleep:async n=>delays.push(n)});
 assert.equal(result.status,200);
 assert.equal(seen.length,2);
 assert.deepEqual(seen[0],seen[1]);
 assert.deepEqual(delays,[2000]);
 assert.equal(cancels,1);
});
test("persistent 503 is returned to caller after exactly two attempts",async()=>{
 let n=0;
 const r=await fetchProtectedPilot(URL,{},{
   fetchImpl:async()=>{n++;return response(503);},sleep:async()=>{}});
 assert.equal(n,2);assert.equal(r.status,503);
});
test("hard 429 and forbidden 401/403 are never retried",async()=>{
 for(const status of [400,401,403,429,422]){
   let n=0;
   const r=await fetchProtectedPilot(URL,{},{
     fetchImpl:async()=>{n++;return response(status);},sleep:()=>{throw Error("unexpected retry");}});
   assert.equal(r.status,status);assert.equal(n,1);
 }
});
test("one transient network failure retries, two fail closed",async()=>{
 let n=0;
 const ok=await fetchProtectedPilot(URL,{},{
   fetchImpl:async()=>{n++;if(n===1)throw Error("private network details");return response(200);},
   sleep:async()=>{}});
 assert.equal(ok.status,200);assert.equal(n,2);
 await assert.rejects(()=>fetchProtectedPilot(URL,{},{
   fetchImpl:async()=>{throw Error("sensitive transport detail");},sleep:async()=>{}}),
   e=>e.message==="PREDGE_PILOT_TRANSPORT_UNAVAILABLE");
});
test("retry budget cannot be raised by callers",async()=>{
 await assert.rejects(()=>fetchProtectedPilot(URL,{},{
   attempts:999,fetchImpl:()=>{throw Error("must not fetch");}}),
   /PREDGE_PILOT_RETRY_CONFIGURATION_INVALID/);
});
