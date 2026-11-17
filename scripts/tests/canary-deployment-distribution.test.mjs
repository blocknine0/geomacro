import test from "node:test";
import assert from "node:assert/strict";
import {deployBaseline,deployVersions,distribution,verifyDistribution,
 assertD1ObservedHourlyPace} from "../canary-promoter.ts";

const BASE="11111111-1111-4111-8111-111111111111";
const CANDIDATE="22222222-2222-4222-8222-222222222222";
const route=`/workers/scripts/geomacro-control-plane/deployments`;

test("0-percent candidate stays in the request while omitted zero rows normalize on readback",async()=>{
 const requested=[];
 const providerApi=async(path,init)=>{
  assert.equal(path,route);
  requested.push(JSON.parse(init.body));
  return {versions:[{version_id:BASE,percentage:100}]};
 };
 let reads=0;
 const readCurrent=async()=>{
  reads++;
  return {versions:[{version_id:BASE,percentage:100}]};
 };
 await deployVersions(BASE,CANDIDATE,0,{providerApi,readCurrent,pause:async()=>{}});
 assert.deepEqual(requested,[{strategy:"percentage",versions:[
  {version_id:BASE,percentage:100},{version_id:CANDIDATE,percentage:0}
 ]}]);
 assert.equal(reads,1);
 assert.equal(verifyDistribution({versions:[
  {version_id:BASE,percentage:100},{version_id:CANDIDATE,percentage:0}
 ]},distribution(BASE,CANDIDATE,0)),true);
});

test("POST responses without versions defer to live GET readback",async()=>{
 let reads=0;
 await deployVersions(BASE,CANDIDATE,5,{
  providerApi:async()=>({deployment:{id:"deployment-created"}}),
  readCurrent:async()=>{reads++;return {versions:[
   {version_id:BASE,percentage:95},{version_id:CANDIDATE,percentage:5}
  ]};},pause:async()=>{}
 });
 assert.equal(reads,1);
 await deployBaseline(BASE,{
  providerApi:async()=>({deployment:{id:"rollback-created"}}),
  readCurrent:async()=>({deployment:{versions:[{version_id:BASE,percentage:100}]}}),
  pause:async()=>{}
 });
});

test("nested deployment versions are normalized and malformed explicit POST splits HOLD",async()=>{
 const expected=distribution(BASE,CANDIDATE,5);
 assert.equal(verifyDistribution({deployment:{versions:expected}},expected),true);
 await assert.rejects(deployVersions(BASE,CANDIDATE,5,{
  providerApi:async()=>({deployment:{versions:null}}),
  readCurrent:async()=>({versions:expected}),pause:async()=>{}
 }),/CANARY_REMOTE_SPLIT_MISMATCH/);
});

test("0-percent candidate must remain in a split response when Cloudflare returns it",()=>{
 const expected=distribution(BASE,CANDIDATE,0);
 assert.equal(verifyDistribution({versions:[
  {version_id:BASE,percentage:100},{version_id:CANDIDATE,percentage:0}
 ]},expected),true);
 assert.throws(()=>verifyDistribution({versions:[
  {version_id:BASE,percentage:100},{version_id:"33333333-3333-4333-8333-333333333333",percentage:0}
 ]},expected),/CANARY_REMOTE_SPLIT_MISMATCH/);
 assert.throws(()=>verifyDistribution({versions:[
  {version_id:BASE,percentage:99},{version_id:CANDIDATE,percentage:1}
 ]},expected),/CANARY_REMOTE_SPLIT_MISMATCH/);
});

test("nonzero stages and 100-percent candidate require exact traffic percentages",()=>{
 for(const percent of [1,5,25,50,100]){
  const expected=distribution(BASE,CANDIDATE,percent);
  assert.equal(expected.reduce((sum,row)=>sum+row.percentage,0),100);
  assert.equal(verifyDistribution({versions:expected},expected),true);
  assert.throws(()=>verifyDistribution({versions:[
   {version_id:BASE,percentage:100}
  ]},expected),/CANARY_REMOTE_SPLIT_MISMATCH/);
 }
});

test("rollback deploys and reads back only the exact baseline at 100 percent",async()=>{
 const requested=[];
 const providerApi=async(path,init)=>{
  assert.equal(path,route);
  requested.push(JSON.parse(init.body));
  return {versions:[{version_id:BASE,percentage:100}]};
 };
 let reads=0;
 const readCurrent=async()=>{
  reads++;
  return {versions:reads===1?[
   {version_id:BASE,percentage:95},{version_id:CANDIDATE,percentage:5}
  ]:[{version_id:BASE,percentage:100}]};
 };
 await deployBaseline(BASE,{providerApi,readCurrent,pause:async()=>{}});
 assert.deepEqual(requested,[{strategy:"percentage",versions:[
  {version_id:BASE,percentage:100}
 ]}]);
 assert.equal(reads,2);
});

test("rollback refuses a provider response that is not a settled baseline-only deployment",async()=>{
 const providerApi=async()=>({versions:[
  {version_id:BASE,percentage:100},{version_id:CANDIDATE,percentage:0}
 ]});
 await assert.rejects(deployBaseline(BASE,{providerApi}),/CANARY_REMOTE_SPLIT_MISMATCH/);
});


function paidPacePair({writes=0,reads=0,pacedRemaining=10_000_000,
 remaining=29_000_000}={}) {
 const start={cycle_start_utc:"2026-11-05",cycle_end_exclusive_utc:"2026-12-05",
  observed_at_ms:1_000_000,rows_read:100,rows_written:200};
 const latest={...start,observed_at_ms:start.observed_at_ms+5*60_000,
  rows_read:start.rows_read+reads,rows_written:start.rows_written+writes,
  paced_remaining_rows_written:pacedRemaining,
  remaining_rows_written:remaining};
 return {start,latest};
}

test("healthy Paid monthly headroom admits normal short-window background cron bursts",()=>{
 for(const writesPerHour of [60_000,150_000,324_000]){
  const {start,latest}=paidPacePair({writes:writesPerHour/12});
  const result=assertD1ObservedHourlyPace(start,latest);
  assert.equal(result.status,"PASS_OBSERVED_PAID_MONTHLY_PACE");
  assert.equal(result.writes_per_hour,writesPerHour);
  assert.equal(result.max_writes_per_hour,500_000);
 }
});

test("canary pace still holds on burst, read-cap, low-monthly-headroom, or exhausted paced headroom",()=>{
 const cases=[
  [paidPacePair({writes:41_667}),/CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE/],
  [paidPacePair({writes:1,reads:2_000_001}),/CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE/],
  [paidPacePair({writes:5_000,remaining:1_000_000}),/CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE/],
  [paidPacePair({writes:5_000,pacedRemaining:0}),/CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE/]
 ];
 for(const [{start,latest},expected] of cases)
  assert.throws(()=>assertD1ObservedHourlyPace(start,latest),expected);
});
