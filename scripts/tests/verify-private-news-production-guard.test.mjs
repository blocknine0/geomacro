import test from "node:test";
import assert from "node:assert/strict";
import {verifyPrivateNewsProductionGuard} from "../ops/verify-private-news-production-guard.mjs";
const deny=()=>Response.json({ok:false,error:"NOT_FOUND"},{status:404});
test("real security SLO checks 2 anonymous paths, fake bearer and non-GET, no privileged D1",async()=>{
 const calls=[];
 const result=await verifyPrivateNewsProductionGuard({fetchImpl:async(url,opts)=>{
  calls.push({path:new URL(url).pathname,method:opts.method,auth:opts.headers?.Authorization});
  return deny();
 }});
 assert.equal(result.verified,true);
 assert.equal(result.canonical_d1_queries,0);
 assert.equal(result.predge_endpoint_accessed,false);
 assert.equal(calls.length,4);
 assert.deepEqual(calls.map(x=>x.method),["GET","GET","GET","POST"]);
 assert.deepEqual(calls.map(x=>Boolean(x.auth)),[false,false,true,false]);
 assert.ok(calls.every(c=>!c.path.includes("predge")&&!c.path.includes("/health")));
});
test("none of the four probes may accidentally approve a raw/private proof",async()=>{
 for(const injection of [0,1,2,3]){
  let index=0;
  await assert.rejects(verifyPrivateNewsProductionGuard({fetchImpl:async()=>{
   return index++===injection?
    Response.json({ok:true,items:[{private:"NEVER_PUBLIC"}]},{status:200}):deny();
  }}));
 }
});
test("generic HTTP 404 is required even on invalid credential and write method",async()=>{
 let n=0;
 await assert.rejects(verifyPrivateNewsProductionGuard({fetchImpl:async()=>{
  n++;return n===4?Response.json({ok:false,error:"CREDENTIAL_INVALID"},{status:404}):deny();
 }}),/PRODUCTION_PRIVATE_NEWS_DENIAL_INVALID/);
});
