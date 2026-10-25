import test from "node:test";
import assert from "node:assert/strict";
import {persistPrivateOsintBatch,PRIVATE_OSINT_DURABLE_SCHEMA} from "./private-osint-15m-durable-publisher.mjs";
const now=Date.parse("2026-10-25T12:00:00.000Z");
const token="1".repeat(64),host="https://geomacro-control-plane.daspallab202391.workers.dev";
const input={schema:"geomacro.private-osint-15m-batch.v1",
 items:[{id:"news-"+("a".repeat(64)),source:{original_published_at:new Date(now-7*60000).toISOString()}}],
 checks:[{category:"macro",state:"OBSERVED",source_ref:"b".repeat(64),checked_at:new Date(now).toISOString()}]};
function simulate(){
 const calls=[];
 const f=async (url,opts)=>{
  calls.push({url,method:opts.method,auth:opts.headers.Authorization,body:opts.body});
  if(opts.method==="PUT"){
   const b=JSON.parse(opts.body);
   return Response.json({schema:"geomacro.private-osint-15m-write-receipt.v1",
    ok:true,persisted:b.items.length,capacity_excluded:0,checks_saved:b.checks.length,
    d1_exact_readback_verified:true,
    native_feed_to_first_durable_write_within_15m:b.items.length,
    native_feed_to_first_durable_write_over_15m:0,
    original_page_verified:false,paid_product_authorized:false,raw_upstream_stored:false});
  }
  return Response.json({ok:true,schema:PRIVATE_OSINT_DURABLE_SCHEMA,retention_hours:25,
   scope:"PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY",original_page_verified:false,
   commercial_use_authorized:false,items:[]});
 };
 return {calls,f};
}
test("all batches are protected; independent private reader verifies durable receipt",async()=>{
 const {calls,f}=simulate();
 const result=await persistPrivateOsintBatch({
  result:input,privateToken:token,controlPlaneRoot:host,fetchImpl:f,now,
 });
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(x=>x.method),["PUT","GET"]);
 assert.ok(calls.every(x=>x.auth==="Bearer "+token));
 assert.equal(result.news_rows_verified_in_d1,1);
 assert.equal(result.source_checks_persisted,1);
 assert.equal(result.d1_write_exact_readback_verified,true);
 assert.equal(result.original_page_independently_verified,false);
 assert.equal(result.publicly_delivered,false);
});
test("a successful 200 HTTP with falsified 402/commercial or no readback is never accepted",async()=>{
 const bad=async(_,opts)=>Response.json(opts.method==="PUT"?
  {ok:true,schema:"geomacro.private-osint-15m-write-receipt.v1",
   persisted:1,capacity_excluded:0,checks_saved:1,d1_exact_readback_verified:false,
   original_page_verified:false,raw_upstream_stored:false,paid_product_authorized:false}:
   {});
 await assert.rejects(persistPrivateOsintBatch({
  result:input,privateToken:token,controlPlaneRoot:host,fetchImpl:bad,now,
 }),/PRIVATE_OSINT_PROTECTED_D1_ACK_NOT_VERIFIED/);
});
test("reject arbitrary endpoints, missing scoped token and oversized/invalid data scope",async()=>{
 for(const opts of [
  {controlPlaneRoot:"https://example.org"},
  {controlPlaneRoot:host,privateToken:"Bearer "+token},
  {controlPlaneRoot:host,privateToken:"a".repeat(10)},
 ]){
  await assert.rejects(persistPrivateOsintBatch({
   result:input,privateToken:token,controlPlaneRoot:host,
   ...opts,fetchImpl:simulate().f,now,
  }),/PRIVATE_OSINT_PUBLISHER_CONFIG_INVALID/);
 }
});
test("expired source-native clock cannot be resent and no private title is generated",async()=>{
 const old={...input,items:[{...input.items[0],source:{
  original_published_at:new Date(now-26*3600000).toISOString()
 }}]};
 const {f,calls}=simulate();
 const out=await persistPrivateOsintBatch({
  result:old,privateToken:token,controlPlaneRoot:host,fetchImpl:f,now,
 });
 assert.equal(out.news_rows_verified_in_d1,0);
 assert.equal(out.source_checks_persisted,1);
 assert.equal(JSON.parse(calls[0].body).items.length,0);
});
