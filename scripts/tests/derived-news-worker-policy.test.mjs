import test from "node:test";
import assert from "node:assert/strict";
import {
  DERIVED_NEWS_TOPIC_POLICY_REVISION,
  requireDerivedNewsWorkerPolicy,
} from "../lib/derived-news-readback-policy.mjs";

const url="https://geomacro-control-plane.daspallab202391.workers.dev/health";
const good=()=>Response.json({
  ok:true,store:"d1",schema_version:3,
  derived_news_topic_policy_revision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
  deployed_source_sha:"a".repeat(40),
});

test("requires an actual no-redirect D1 health response with the current derived-news policy revision",async()=>{
 let calls=0;
 const receipt=await requireDerivedNewsWorkerPolicy({url,fetchImpl:async(target,init)=>{
   calls++;assert.equal(target,url);assert.equal(init.method,"GET");
   assert.equal(init.redirect,"error");assert.equal(init.cache,"no-store");
   return good();
 }});
 assert.equal(calls,1);
 assert.deepEqual(receipt,{
  schema:"geomacro.derived-news-worker-policy-preflight.v1",
  worker_policy_revision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
  d1_schema_version:3,deployed_source_sha_present:true,
  raw_health_body_logged:false,source_reads_started:false,payments:0,
 });
});

test("old Worker policy cannot start a feed read or D1 write",async()=>{
 await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>Response.json({
  ok:true,store:"d1",schema_version:3,
  derived_news_topic_policy_revision:DERIVED_NEWS_TOPIC_POLICY_REVISION-1,
  deployed_source_sha:"a".repeat(40),
 })}),/DERIVED_NEWS_WORKER_TOPIC_POLICY_NOT_CURRENT/u);
});

test("missing D1, schema, revision or exact deployment SHA all fail closed",async()=>{
 for(const doc of [
  {ok:false,store:"d1",schema_version:3,derived_news_topic_policy_revision:2,deployed_source_sha:"a".repeat(40)},
  {ok:true,store:"d1",schema_version:2,derived_news_topic_policy_revision:2,deployed_source_sha:"a".repeat(40)},
  {ok:true,store:"d1",schema_version:3,derived_news_topic_policy_revision:1,deployed_source_sha:"a".repeat(40)},
  {ok:true,store:"d1",schema_version:3,derived_news_topic_policy_revision:2,deployed_source_sha:""},
 ]) await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>Response.json(doc)}),
   /DERIVED_NEWS_WORKER_TOPIC_POLICY_NOT_CURRENT/u);
});

test("network, HTTP, redirect and malformed/oversized health responses are not treated as deployment readiness",async()=>{
 await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>{throw Error("network down");}}),
  /DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE/u);
 await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>new Response("{}",{status:503})}),
  /DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE/u);
 await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>new Response("{}",{status:200,headers:{"content-length":"20000"}})}),
  /DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE/u);
 await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>new Response("{", {status:200})}),
  /DERIVED_NEWS_WORKER_POLICY_RESPONSE_INVALID/u);
 await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url,fetchImpl:async()=>new Response("x".repeat(20000),{status:200})}),
  /DERIVED_NEWS_WORKER_POLICY_RESPONSE_OVERSIZE/u);
 for(const unsafe of [
  "http://example.com/health",
  "https://example.com/health",
  "https://geomacro-control-plane.daspallab202391.workers.dev/not-health",
  "https://user@geomacro-control-plane.daspallab202391.workers.dev/health",
  "https://geomacro-control-plane.daspallab202391.workers.dev/health?redirect=1",
 ]) await assert.rejects(()=>requireDerivedNewsWorkerPolicy({url:unsafe}),
  /DERIVED_NEWS_WORKER_POLICY_CONFIGURATION_INVALID/u);
});
