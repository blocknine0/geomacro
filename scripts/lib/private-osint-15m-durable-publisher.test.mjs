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
    existence_and_readback_bundled:true,d1_queries_this_write:3,
    native_feed_to_first_durable_write_within_15m:b.items.length,
    native_feed_to_first_durable_write_over_15m:0,
    newly_persisted_within_15m:b.items.length,
    newly_persisted_after_15m:0,
    previously_persisted_reobserved:0,
    independent_verification_required_for_ingestion:false,
    original_page_verified:false,paid_product_authorized:false,raw_upstream_stored:false});
  }
  return Response.json({ok:true,schema:"geomacro.private-osint-news-bundle.v1",retention_hours:25,
   scope:"PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY",original_page_verified:false,
   independent_verification_required_for_ingestion:false,
   commercial_use_authorized:false,category_count:3,single_d1_batch_read:true,
   categories:Object.fromEntries(["geopolitics","macro","rare_earth"].map(c=>[c,{items:[]}]))});
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
 assert.equal(result.private_three_category_bundle_readback_verified,true);
 assert.equal(result.private_d1_writer_reads_bundled_verified,true);
 assert.equal(result.d1_queries_for_write_batches,3);
 assert.ok(calls[1].url.endsWith('?view=bundle'));
 assert.equal(result.original_page_independently_verified,false);
 assert.equal(result.independent_verification_required_for_ingestion,false);
 assert.equal(result.publicly_delivered,false);
});
test("one older-reader 400 can fall back during deployment, but a malformed 200 bundle cannot",async()=>{
 const {f}=simulate();let reads=0;
 const legacy=async(url,opts)=>{
  if(opts.method==='PUT')return f(url,opts);
  reads++;
  if(url.endsWith('view=bundle'))return Response.json({error:'PRIVATE_OSINT_QUERY_INVALID'},{status:400});
  return Response.json({ok:true,schema:PRIVATE_OSINT_DURABLE_SCHEMA,retention_hours:25,
   scope:'PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY',independent_verification_required_for_ingestion:false,
   original_page_verified:false,commercial_use_authorized:false,items:[]});
 };
 const receipt=await persistPrivateOsintBatch({result:input,privateToken:token,controlPlaneRoot:host,fetchImpl:legacy,now});
 assert.equal(reads,2);assert.equal(receipt.private_three_category_bundle_readback_verified,false);
 await assert.rejects(persistPrivateOsintBatch({result:input,privateToken:token,controlPlaneRoot:host,now,
  fetchImpl:async(url,opts)=>opts.method==='PUT'?f(url,opts):Response.json({ok:true})}),/PRIVATE_OSINT_PRIVATE_READER_SCHEMA_INVALID/);
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

test("protected publisher preserves true new-late vs repeated news counts",async()=>{
 const old={...input,items:[{...input.items[0],source:{
   original_published_at:new Date(now-35*60000).toISOString()
 }}]};
 const {f}=simulate();
 const lateReader=async(url,opts)=>{
  if(opts.method==="PUT"){
   const b=JSON.parse(opts.body);
   return Response.json({ok:true,schema:"geomacro.private-osint-15m-write-receipt.v1",
     persisted:b.items.length,capacity_excluded:0,checks_saved:b.checks.length,
     d1_exact_readback_verified:true,existence_and_readback_bundled:true,
     d1_queries_this_write:3,
     native_feed_to_first_durable_write_within_15m:0,
     native_feed_to_first_durable_write_over_15m:b.items.length,
     newly_persisted_within_15m:0,newly_persisted_after_15m:b.items.length,
     previously_persisted_reobserved:0,
     independent_verification_required_for_ingestion:false,
     original_page_verified:false,paid_product_authorized:false,raw_upstream_stored:false});
  }
  return f(url,opts);
 };
 const r=await persistPrivateOsintBatch({
  result:old,privateToken:token,controlPlaneRoot:host,fetchImpl:lateReader,now});
 assert.equal(r.news_rows_verified_in_d1,1);
 assert.equal(r.newly_persisted_after_15m,1);
 assert.equal(r.newly_persisted_within_15m,0);
 assert.equal(r.previously_persisted_reobserved,0);
});

test("high-volume private OSINT uses 16 news and 32 health checks per protected D1 batch",async()=>{
 const items=Array.from({length:33},(_,i)=>({
  id:"news-"+i.toString(16).padStart(64,"0"),
  source:{original_published_at:new Date(now-5*60000).toISOString()},
 }));
 const checks=Array.from({length:65},(_,i)=>({
  source_ref:(i+100).toString(16).padStart(64,"0"),
  category:"macro",state:"OBSERVED",checked_at:new Date(now).toISOString(),
 }));
 const {f,calls}=simulate();
 const receipt=await persistPrivateOsintBatch({
  result:{schema:input.schema,items,checks},
  privateToken:token,controlPlaneRoot:host,fetchImpl:f,now,
 });
 const writes=calls.filter(c=>c.method==="PUT").map(c=>JSON.parse(c.body));
 assert.equal(writes.length,3);
 assert.ok(writes.every(b=>b.items.length<=16&&b.checks.length<=32));
 assert.deepEqual(writes.map(b=>[b.items.length,b.checks.length]),
  [[16,32],[16,32],[1,1]]);
 assert.equal(receipt.news_rows_verified_in_d1,33);
 assert.equal(receipt.source_checks_persisted,65);
 assert.equal(receipt.d1_write_exact_readback_verified,true);
 assert.equal(calls.filter(c=>c.method==="GET").length,1);
});
