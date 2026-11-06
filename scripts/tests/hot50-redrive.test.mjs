import test from "node:test";
import assert from "node:assert/strict";
import {redriveHot50} from "../ops/redrive-hot50-ingestion.mjs";
const opts={origin:"https://test.workers.dev",token:"a".repeat(64)};
const packet=(selected=2,archived=2)=>({ok:true,schema:"geomacro.activation-bounded-redrive.v1",
 outbox:{status:"P0B_OUTBOX_REPLAY_OK",selected,archived,failed:0},
 fifo:{status:"DRAIN_CLEAN",queued:0},r2:{status:"R2_FALLBACK_REPLAY_OK",selected:0,verified:0}});
function sequence(bodies){let n=0;return {calls:()=>n,fetch:async(url,options)=>{
 assert.equal(url,opts.origin+"/v1/internal/activation/redrive");assert.equal(options.method,"POST");
 assert.equal(options.redirect,"error");return Response.json(bodies[Math.min(n++,bodies.length-1)]);
}}}
test("bounded recovery accumulates actual archived batches and never asserts global zero",async()=>{
 const t=sequence([packet(),packet(),packet(0,0)]);
 const r=await redriveHot50(opts,t.fetch);
 assert.equal(t.calls(),3);assert.equal(r.archived_batches,4);
 assert.equal(r.outcome,"NO_DISPATCHABLE_WORK_AT_OBSERVATION");assert.equal(r.zero_backlog_not_inferred,true);
});
test("circuit hold and quota hold stop without retry storm or invented progress",async()=>{
 for(const status of ["P0B_OUTBOX_B2_CIRCUIT_HELD","P0B_B2_QUOTA_HELD"]){
 const body=packet(0,0);body.outbox.status=status;
 const t=sequence([body]);const r=await redriveHot50(opts,t.fetch);
 assert.equal(t.calls(),1);assert.equal(r.archived_batches,0);assert.equal(r.outcome,"PROVIDER_OR_QUOTA_OR_REPLAY_BLOCKED");
 }
});
test("uncertain transport leaves leases untouched, and bounded windows cannot be exceeded",async()=>{
 const r=await redriveHot50(opts,async()=>{throw Error("timeout")});
 assert.equal(r.outcome,"TRANSPORT_UNCERTAIN_LEASES_PRESERVED");assert.equal(r.archived_batches,0);
 const t=sequence([packet()]);const bounded=await redriveHot50({...opts,maxRounds:2},t.fetch);
 assert.equal(t.calls(),2);assert.equal(bounded.outcome,"BOUNDED_WINDOW_EXHAUSTED");
 await assert.rejects(redriveHot50({...opts,maxRounds:61},t.fetch),/CONFIG_INVALID/);
 assert.equal(t.calls(),2);
});
test("no archive progress and malformed Worker results fail closed",async()=>{
 const t=sequence([packet(2,0)]);
 assert.equal((await redriveHot50(opts,t.fetch)).outcome,"NO_ARCHIVE_PROGRESS");
 assert.equal(t.calls(),1);
 const bad=sequence([{...packet(),schema:"unexpected"}]);
 assert.equal((await redriveHot50(opts,bad.fetch)).outcome,"WORKER_HTTP_OR_SCHEMA_UNAVAILABLE");
});

test("a recovery timeout cannot suppress the independent full census",async()=>{
 const {observeActivation}=await import("../ops/verify-hot50-production-activation.mjs");
 const calls=[];
 const observed=await observeActivation({token:opts.token,redrive:true},async(path,options)=>{
  calls.push(path);
  if(path.endsWith("/redrive")){assert.equal(options.timeoutMs,130000);throw Error("timeout")}
  return {status:200,json:{ok:true,backlog:{total_unhandled:105}}};
 });
 assert.deepEqual(calls,["/v1/internal/activation/redrive","/v1/internal/activation/hot50-census"]);
 assert.equal(observed.replay.status,"TRANSPORT_UNCERTAIN_LEASES_PRESERVED");
 assert.equal(observed.census.json.backlog.total_unhandled,105);
});
