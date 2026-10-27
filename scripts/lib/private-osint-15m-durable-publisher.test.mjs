import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {persistPrivateOsintBatch,PRIVATE_OSINT_DURABLE_SCHEMA,PRIVATE_OSINT_D1_HEALTH_SNAPSHOT_SLOTS,selectPrivateOsintD1HealthChecks} from "./private-osint-15m-durable-publisher.mjs";
const now=Date.parse("2026-10-25T12:00:00.000Z");
const token="1".repeat(64),host="https://geomacro-control-plane.daspallab202391.workers.dev";
function validItem(id,minutes=7){
 const original=normalizeReusableNewsJson({
  category:"macro",text:"India central bank announces inflation and monetary policy outlook",
  published_at:new Date(now-minutes*60000).toISOString(),license:"unknown",
  country_iso3:"IND",
 });
 return {...original,id:"news-"+id};
}
const input={schema:"geomacro.private-osint-15m-batch.v1",
 items:[validItem("a".repeat(64))],
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
    d1_usage_metadata_complete:true,d1_rows_read_this_write:8,d1_rows_written_this_write:4,
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
 assert.equal(result.d1_rows_read_for_write_batches,8);
 assert.equal(result.d1_rows_written_for_write_batches,4);
 assert.equal(result.d1_usage_metadata_complete,true);
 assert.ok(calls[1].url.endsWith('?view=bundle&limit=1'));
 assert.equal(result.original_page_independently_verified,false);
 assert.equal(result.independent_verification_required_for_ingestion,false);
 assert.equal(result.publicly_delivered,false);
});
test("one older-reader 400 can fall back during deployment, but a malformed 200 bundle cannot",async()=>{
 const {f}=simulate();let reads=0;
 const legacy=async(url,opts)=>{
  if(opts.method==='PUT')return f(url,opts);
  reads++;
  if(url.endsWith('view=bundle&limit=1'))return Response.json({error:'PRIVATE_OSINT_QUERY_INVALID'},{status:400});
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
  ...input.items[0].source,
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
   ...input.items[0].source,
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

test("high-volume private OSINT uses maximum 20 news and 32 health checks per protected D1 batch",async()=>{
 const items=Array.from({length:33},(_,i)=>({
  ...validItem(i.toString(16).padStart(64,"0"),5),
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
 assert.ok(writes.every(b=>b.items.length<=20&&b.checks.length<=32));
 assert.deepEqual(writes.map(b=>[b.items.length,b.checks.length]),
  [[20,32],[13,32],[0,1]]);
 assert.equal(receipt.news_rows_verified_in_d1,33);
 assert.equal(receipt.source_checks_persisted,65);
 assert.equal(receipt.d1_write_exact_readback_verified,true);
 assert.equal(calls.filter(c=>c.method==="GET").length,1);
});

test("protected collector differentiates real free D1 read and write limits from opaque failures",async()=>{
 for(const failureClass of ["D1_FREE_DAILY_ROW_READ_LIMIT","D1_FREE_DAILY_ROW_WRITE_LIMIT","D1_SCHEMA_UNAVAILABLE","D1_UNCLASSIFIED_STORAGE_FAILURE"]){
  const fetchImpl=async()=>Response.json({
   ok:false,error:"PRIVATE_OSINT_D1_WRITE_OR_READBACK_UNAVAILABLE",
   failure_class:failureClass,retry_after_utc:"2026-10-26T00:00:00.000Z"
  },{status:503});
  await assert.rejects(persistPrivateOsintBatch({
   result:input,privateToken:token,controlPlaneRoot:host,fetchImpl,now
  }),new RegExp("PRIVATE_OSINT_"+failureClass));
 }
 for(const malicious of [
  new Response("private source name / leaked server SQL",{status:503}),
  Response.json({failure_class:"SECRET_PROVIDER_PAYLOAD"}, {status:503})
 ]){
  const fetchImpl=async()=>malicious;
  await assert.rejects(persistPrivateOsintBatch({
   result:input,privateToken:token,controlPlaneRoot:host,fetchImpl,now
  }),/PRIVATE_OSINT_PROTECTED_D1_WRITE_HTTP_503/);
 }
});


test("every real checked source is D1-snapshotted once across three consecutive fifteen-minute UTC cron slots",()=>{
 assert.equal(PRIVATE_OSINT_D1_HEALTH_SNAPSHOT_SLOTS,3);
 const checks=Array.from({length:900},(_,i)=>({
  source_ref:createHash("sha256").update("private-health-"+i).digest("hex"),
  category:["geopolitics","macro","rare_earth"][i%3],
  state:i%2?"EMPTY_OR_OUTSIDE_WINDOW":"OBSERVED",
  checked_at:new Date(now).toISOString(),
 }));
 const batches=[0,1,2].map(n=>selectPrivateOsintD1HealthChecks({
  checks,now:now+n*900000,slots:3,newsItemCount:10,
 }));
 assert.deepEqual(batches.map(x=>x.slot).sort(),[0,1,2]);
 const selected=batches.flatMap(b=>b.checks);
 assert.equal(selected.length,checks.length);
 assert.equal(new Set(selected.map(x=>x.source_ref)).size,checks.length);
 // Regression: 15-minute cron would select the same modulo-3 slot
 // forever if the phase duration incorrectly stayed at five minutes.
 const delayedSameSlot=selectPrivateOsintD1HealthChecks({
  checks,now:now+3*60000,slots:3,newsItemCount:10,
 });
 assert.equal(delayedSameSlot.slot,batches[0].slot);
 const followingScheduledTick=selectPrivateOsintD1HealthChecks({
  checks,now:now+15*60000,slots:3,newsItemCount:10,
 });
 assert.notEqual(followingScheduledTick.slot,batches[0].slot);
 assert.equal(batches.reduce((x,b)=>x+b.sampled,0),checks.length);
 assert.ok(batches.every(b=>b.deferred===checks.length-b.sampled));
 assert.ok(batches.every(b=>b.sampled>250&&b.sampled<350));
 assert.deepEqual(selectPrivateOsintD1HealthChecks({
  checks,now:now+45*60000,slots:3,newsItemCount:10
 }).checks.map(x=>x.source_ref),batches[0].checks.map(x=>x.source_ref));
 assert.equal(selectPrivateOsintD1HealthChecks({
  checks,now,slots:1,newsItemCount:10
 }).sampled,900);
 assert.throws(()=>selectPrivateOsintD1HealthChecks({
  checks,now,slots:2
 }),/PRIVATE_OSINT_HEALTH_SNAPSHOT_INPUT_INVALID/);
 assert.throws(()=>selectPrivateOsintD1HealthChecks({
  checks:[{source_ref:"original-publisher-URL"}],now,slots:3
 }),/PRIVATE_OSINT_HEALTH_SNAPSHOT_INPUT_INVALID/);
});
test("private quota sampling persists EVERY dated news item but fewer D1 check UPSERTs",async()=>{
 const checks=Array.from({length:900},(_,i)=>({
  source_ref:createHash("sha256").update("private-quota-"+i).digest("hex"),
  category:["geopolitics","macro","rare_earth"][i%3],
  state:"OBSERVED",checked_at:new Date(now).toISOString(),
 }));
 const items=Array.from({length:33},(_,i)=>({
  ...validItem(i.toString(16).padStart(64,"0"),4),
 }));
 const {f,calls}=simulate();
 const receipt=await persistPrivateOsintBatch({
  result:{schema:input.schema,items,checks},
  privateToken:token,controlPlaneRoot:host,fetchImpl:f,now,
  sourceHealthSnapshotSlots:3,
 });
 const writes=calls.filter(c=>c.method==="PUT").map(c=>JSON.parse(c.body));
 assert.equal(receipt.source_checks_observed_this_tick,900);
 assert.equal(receipt.source_health_snapshot_slots,3);
 assert.equal(receipt.source_health_snapshot_cadence_nominal_minutes,45);
 assert.equal(receipt.source_checks_persisted,receipt.source_checks_selected_for_d1);
 assert.equal(receipt.source_checks_deferred_to_snapshot+receipt.source_checks_persisted,900);
 assert.ok(receipt.source_checks_persisted>=250&&receipt.source_checks_persisted<=350);
 assert.equal(receipt.news_rows_verified_in_d1,33);
 assert.equal(writes.reduce((n,g)=>n+g.items.length,0),33);
 assert.equal(writes.reduce((n,g)=>n+g.checks.length,0),receipt.source_checks_persisted);
 assert.ok(writes.every(g=>g.items.length<=20&&g.checks.length<=32));
 assert.ok(writes.length<15,"3-slot sampling should use far fewer D1 calls than all 900 checks");
 assert.equal(receipt.d1_write_exact_readback_verified,true);
 assert.equal(receipt.separate_private_d1_readback_verified,true);
 assert.equal(calls.filter(c=>c.method==="GET").length,1);
 const noNews={schema:input.schema,items:[],checks:[checks[0]]};
 const tiny=await persistPrivateOsintBatch({
  result:noNews,privateToken:token,controlPlaneRoot:host,fetchImpl:simulate().f,
  now:now+300000,sourceHealthSnapshotSlots:3,
 });
 assert.equal(tiny.source_checks_persisted,1,"quiet single-source intake still gets authenticated D1 health receipt");
 assert.equal(tiny.news_rows_verified_in_d1,0);
});
