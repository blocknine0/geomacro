import test from "node:test";
import assert from "node:assert/strict";
import {deployBaseline,deployVersions,distribution,verifyDistribution}
 from "../canary-promoter.ts";

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
