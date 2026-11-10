import test from "node:test";
import assert from "node:assert/strict";
import {readStep3FreshHeadroomWithRetry}
 from "../lib/step3-fresh-headroom-retry.mjs";
const request=Object.freeze({lane:"migration",
 estimatedMigrationRowsRead:12_000,estimatedMigrationRowsWritten:100});
const unavailable=()=>({status:"HOLD",
 code:"D1_PAID_MONTHLY_PROVIDER_HEADROOM_NOT_VERIFIED",
 reason:"PAID_SUBSCRIPTION_OR_CURRENT_CYCLE_PROVIDER_UNVERIFIED",
 provider_error:"D1_PAID_MONTHLY_GRAPHQL_NETWORK_UNAVAILABLE"});
const realPass=()=>({status:"PASS",
 code:"MIGRATION_PAID_MONTHLY_HEADROOM_VERIFIED",
 reason:"PAID_MONTHLY_PROTECTED_LANE_ADMITTED",
 provider_subscription_verified:true,observed_rows_read:123,
 observed_rows_written:45,payment_activation_authorized:false});
test("transient provider loss is rechecked with fresh provider reads, never a cached PASS",async()=>{
 let calls=0;const delays=[],argumentsSeen=[];
 const result=await readStep3FreshHeadroomWithRetry({request,
  read:async args=>{calls++;argumentsSeen.push(args);
   return calls===3?realPass():unavailable();},
  wait:async ms=>delays.push(ms)});
 assert.equal(result.provider_pass_observed,true);
 assert.equal(calls,3);
 assert.deepEqual(delays,[1500,3500]);
 assert.deepEqual(argumentsSeen,[request,request,request]);
 assert.equal(result.receipt.observed_rows_written,45);
 assert.deepEqual(result.attempts.map(x=>x.status),["HOLD","HOLD","PASS"]);
});
test("four missing-provider reads remain HOLD, never invent subscription, zero or quota capacity",async()=>{
 let calls=0;const delays=[];
 const result=await readStep3FreshHeadroomWithRetry({request,
  read:async()=>{calls++;return unavailable();},
  wait:async ms=>delays.push(ms)});
 assert.equal(calls,4);
 assert.deepEqual(delays,[1500,3500,6500]);
 assert.equal(result.provider_pass_observed,false);
 assert.equal(result.receipt.status,"HOLD");
 assert.equal(result.receipt.observed_rows_read,undefined);
});
test("real provider monthly pacing/capacity HOLD is final: no retry or waiver",async()=>{
 let calls=0,delays=0;
 const result=await readStep3FreshHeadroomWithRetry({request,
  read:async()=>{calls++;return {status:"HOLD",
   reason:"MONTHLY_INCLUDED_ALLOCATION_OR_PACING_HEADROOM_UNAVAILABLE"};},
  wait:async()=>{delays++}});
 assert.equal(calls,1);assert.equal(delays,0);
 assert.equal(result.provider_pass_observed,false);
});
test("exceptions, malformed responses and invalid caller scope cannot authorize production",async()=>{
 let calls=0;
 const thrown=await readStep3FreshHeadroomWithRetry({request,
  read:async()=>{calls++;throw Error("secret MUST NOT leak");},
  wait:async()=>{}});
 assert.equal(calls,4);
 assert.equal(thrown.provider_pass_observed,false);
 assert.ok(thrown.attempts.every(x=>x.provider_error==="STEP3_PROVIDER_RECHECK_THROWN"));
 const invalid=await readStep3FreshHeadroomWithRetry({request,
  read:async()=>({status:"UNKNOWN",reason:"MALFORMED"}),
  wait:async()=>{throw Error("NO_WAIT_ALLOWED")}});
 assert.equal(invalid.provider_pass_observed,false);
 assert.deepEqual(invalid.attempts.map(x=>x.status),["HOLD"]);
 await assert.rejects(()=>readStep3FreshHeadroomWithRetry({request:{lane:"canary"},
  read:async()=>realPass(),wait:async()=>{}}),/CONTRACT_INVALID/u);
});
