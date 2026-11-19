import test from "node:test";
import assert from "node:assert/strict";
import {withStep3ConcurrentDriftRetry,withStep3ReadOnlyQueryRetry}
 from "../lib/d1-step3-concurrent-drift-retry.mjs";

test("repeats the complete parity proof after concurrent drift and passes",()=>{
 let calls=0;const sleeps=[];
 const result=withStep3ConcurrentDriftRetry(()=>{
  calls++;
  if(calls===1)throw Error("STEP3_SET_INDEX_JOIN_CONCURRENT_SOURCE_ROW_COUNT_DRIFT");
  if(calls===2)throw Error("STEP3_SET_INDEX_COMPLETE_ROWID_AND_KEY_PARITY_UNVERIFIED");
  return {status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF"};
 },{sleep:ms=>sleeps.push(ms)});
 assert.equal(result.status,"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF");
 assert.equal(calls,3);
 assert.deepEqual(sleeps,[2000,4000]);
});

test("fails closed after three transient drift attempts",()=>{
 let calls=0;const sleeps=[];
 assert.throws(()=>withStep3ConcurrentDriftRetry(()=>{
  calls++;throw Error("STEP3_SET_INDEX_CONCURRENT_SOURCE_ROW_COUNT_DRIFT");
 },{sleep:ms=>sleeps.push(ms)}),/STEP3_SET_INDEX_CONCURRENT_SOURCE_ROW_COUNT_DRIFT/u);
 assert.equal(calls,3);
 assert.deepEqual(sleeps,[2000,4000]);
});

test("does not retry non-drift failures or accept more than three attempts",()=>{
 let calls=0;const sleeps=[];
 assert.throws(()=>withStep3ConcurrentDriftRetry(()=>{
  calls++;throw Error("STEP3_SET_INDEX_FORCED_COVERING_INDEX_PLAN_UNVERIFIED");
 },{sleep:ms=>sleeps.push(ms)}),/FORCED_COVERING_INDEX_PLAN_UNVERIFIED/u);
 assert.equal(calls,1);
 assert.deepEqual(sleeps,[]);
 assert.throws(()=>withStep3ConcurrentDriftRetry(()=>null,{attempts:4}),
  /STEP3_CONCURRENT_DRIFT_RETRY_CONFIG_INVALID/u);
});

test("retries transient read-only D1 execute EXIT_1 then recovers",()=>{
 let calls=0;const sleeps=[];
 const value=withStep3ReadOnlyQueryRetry(()=>{
  calls++;
  if(calls<3)throw Error("STEP3_PROVIDER_D1_EXECUTE_EXIT_1");
  return {rows:[{ok:1}],readRows:1};
 },{sleep:ms=>sleeps.push(ms)});
 assert.deepEqual(value,{rows:[{ok:1}],readRows:1});
 assert.equal(calls,3);assert.deepEqual(sleeps,[250,500]);
});

test("read-only D1 retries remain bounded and fail closed on other errors",()=>{
 let calls=0;const sleeps=[];
 assert.throws(()=>withStep3ReadOnlyQueryRetry(()=>{
  calls++;throw Error("STEP3_PROVIDER_D1_EXECUTE_EXIT_1");
 },{sleep:ms=>sleeps.push(ms)}),/STEP3_PROVIDER_D1_EXECUTE_EXIT_1/u);
 assert.equal(calls,3);assert.deepEqual(sleeps,[250,500]);
 calls=0;sleeps.length=0;
 assert.throws(()=>withStep3ReadOnlyQueryRetry(()=>{
  calls++;throw Error("STEP3_D1_READBACK_NATIVE_META_UNVERIFIED");
 },{sleep:ms=>sleeps.push(ms)}),/D1_READBACK_NATIVE_META_UNVERIFIED/u);
 assert.equal(calls,1);assert.deepEqual(sleeps,[]);
});
