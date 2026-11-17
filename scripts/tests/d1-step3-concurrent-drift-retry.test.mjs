import test from "node:test";
import assert from "node:assert/strict";
import {withStep3ConcurrentDriftRetry} from "../lib/d1-step3-concurrent-drift-retry.mjs";

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
