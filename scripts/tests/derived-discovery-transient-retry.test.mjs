import test from "node:test";
import assert from "node:assert/strict";
import {retryTransientDiscoveryRequest,
 DISCOVERY_RETRY_DELAYS_MS,DISCOVERY_LANE_PACE_MS,
 isTransientDiscoveryNetworkError}
 from "../lib/derived-discovery-transient-retry.mjs";

for(const failures of [1,2,3]){
 test("HTTP 503 recovers after "+failures+" retries",async()=>{
  const delays=[];let attempts=0;
  const response=await retryTransientDiscoveryRequest(async()=>
   {attempts++;return {status:attempts<=failures?503:200}},{
    sleep:async ms=>{delays.push(ms)},random:()=>0.5});
  assert.equal(response.status,200);
  assert.equal(attempts,failures+1);
  assert.deepEqual(delays,DISCOVERY_RETRY_DELAYS_MS.slice(0,failures));
 });
}
test("three retries then final 503 must remain 503, never be an ACK",async()=>{
 let attempts=0;const delays=[];
 const response=await retryTransientDiscoveryRequest(async()=>{
  attempts++;return {status:503};
 },{sleep:async ms=>{delays.push(ms)},random:()=>0.5});
 assert.equal(response.status,503);
 assert.equal(attempts,4);
 assert.deepEqual(delays,[2000,5000,10000]);
});
test("transient network TypeError and TimeoutError retry, preserving backoff",async()=>{
 let count=0;const delays=[];
 const response=await retryTransientDiscoveryRequest(async()=>{
  count++;
  if(count===1)throw new TypeError("fetch failed");
  if(count===2)throw Object.assign(new Error("timeout"),{name:"TimeoutError"});
  return {status:200};
 },{sleep:async ms=>{delays.push(ms)},random:()=>0.5});
 assert.equal(response.status,200);
 assert.equal(count,3);
 assert.deepEqual(delays,[2000,5000]);
});
test("permanent transient network failures stop after exactly three retries",async()=>{
 let attempts=0;const delays=[];
 await assert.rejects(()=>retryTransientDiscoveryRequest(async()=>{
  attempts++;throw new TypeError("fetch failed");
 },{sleep:async ms=>{delays.push(ms)},random:()=>0.5}),TypeError);
 assert.equal(attempts,4);
 assert.deepEqual(delays,[2000,5000,10000]);
});
test("401, 409, 429 and 500 never retry and never bypass policy",async()=>{
 for(const status of [401,409,429,500]){
  let calls=0;
  const response=await retryTransientDiscoveryRequest(async()=>{
   calls++;return {status};
  },{sleep:async()=>{throw Error("SHOULD_NOT_SLEEP")}});
  assert.equal(response.status,status);
  assert.equal(calls,1);
 }
});
test("non-transient application exceptions fail immediately",async()=>{
 let calls=0;
 await assert.rejects(()=>retryTransientDiscoveryRequest(async()=>{
  calls++;throw Error("POLICY_CONTRACT_INVALID");
 },{sleep:async()=>{throw Error("SHOULD_NOT_SLEEP")}}),
 /POLICY_CONTRACT_INVALID/);
 assert.equal(calls,1);
});
test("jitter stays within +/-500ms; pacing contract is 500ms",async()=>{
 for(const [random,expected] of [[()=>0,[1500,4500,9500]],
  [()=>1,[2500,5500,10500]]]){
  const delays=[];
  await retryTransientDiscoveryRequest(async()=>({status:503}),{
   sleep:async ms=>{delays.push(ms)},random});
  assert.deepEqual(delays,expected);
 }
 assert.equal(DISCOVERY_LANE_PACE_MS,500);
 assert.equal(isTransientDiscoveryNetworkError(
  Object.assign(new Error("network"),{code:"ECONNRESET"})),true);
 assert.equal(isTransientDiscoveryNetworkError(new Error("invalid token")),false);
});
