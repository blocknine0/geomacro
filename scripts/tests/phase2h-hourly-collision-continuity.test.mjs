import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {postPhase2hCollisionIsolated} from "../lib/phase2h-raw-original-records.mjs";
const records=[
 {record_id:"geopolitics-one",category:"geopolitics"},
 {record_id:"macro-collision",category:"macro"},
 {record_id:"rare-earth-one",category:"rare_earth"},
];
const positive=group=>({
 stored:group.length,duplicate:0,verified_originals:group.length,
 readback_verified:true,per_original_readback_verified:true
});
test("one immutable original collision never suppresses independent other category D1 proofs",async()=>{
 let attempts=0;
 const receipt=await postPhase2hCollisionIsolated({
  records,post:async({records:group})=>{
   attempts++;
   if(group.some(r=>r.record_id==="macro-collision"))
    throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");
   return positive(group);
  }
 });
 assert.equal(receipt.stored,2);
 assert.equal(receipt.duplicate,0);
 assert.equal(receipt.rejected_conflicts,1);
 assert.deepEqual(receipt.rejected_conflicts_by_category,{
  geopolitics:0,macro:1,rare_earth:0
 });
 assert.equal(receipt.verified_originals,2);
 assert.equal(receipt.readback_verified,true);
 assert.ok(attempts<=5);
 assert.equal(receipt.b2_verified,false);
 assert.equal(receipt.paid_eligible,false);
});
test("all conflicting originals never fabricate authenticated D1 readback",async()=>{
 const receipt=await postPhase2hCollisionIsolated({
  records,post:async()=>{throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")}
 });
 assert.equal(receipt.rejected_conflicts,3);
 assert.equal(receipt.stored,0);
 assert.equal(receipt.verified_originals,0);
 assert.equal(receipt.readback_verified,false);
});
test("no attempt to convert failed authenticated readback into success",async()=>{
 for(const result of [
  {stored:2,duplicate:0,verified_originals:2,readback_verified:true},
  {stored:3,duplicate:0,verified_originals:3,readback_verified:false},
  {stored:1,duplicate:0,verified_originals:1,readback_verified:true,
   per_original_readback_verified:true}
 ])await assert.rejects(postPhase2hCollisionIsolated({
  records,post:async()=>result
 }),/PHASE2H_PRIVATE_D1_READBACK_MISMATCH/);
});
test("quota, network, auth, and other errors still fail closed",async()=>{
 for(const err of ["PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE",
  "PHASE2H_PRIVATE_INTAKE_AUTH_REQUIRED",
  "B2_GLOBAL_DAILY_QUOTA_EXHAUSTED"]){
  await assert.rejects(postPhase2hCollisionIsolated({
   records,post:async()=>{throw Error(err)}
  }),new RegExp(err));
 }
});
test("all 21 originals split into bounded 20-item batches with exact positive proofs",async()=>{
 const many=Array.from({length:21},(_,i)=>({
  record_id:"id-"+i,category:["geopolitics","macro","rare_earth"][i%3]
 }));
 const lengths=[];
 const receipt=await postPhase2hCollisionIsolated({
  records:many,post:async({records:group})=>{
   lengths.push(group.length);return positive(group);
  }
 });
 assert.deepEqual(lengths,[20,1]);
 assert.equal(receipt.stored,21);
 assert.equal(receipt.rejected_conflicts,0);
 assert.equal(receipt.verified_originals,21);
});
test("attempt budget is bounded even under adversarial collisions",async()=>{
 await assert.rejects(postPhase2hCollisionIsolated({
  records,maxAttempts:2,
  post:async()=>{throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")}
 }),/PHASE2H_PRIVATE_COLLISION_ATTEMPT_LIMIT/);
});
test("hourly production script invokes same collision isolation and reports honest counts",()=>{
 const publisher=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
 assert.match(publisher,/await postPhase2hCollisionIsolated\(/);
 assert.match(publisher,/rejected_conflicts:raw.rejected_conflicts/);
 assert.match(publisher,/PHASE2H_IMMUTABLE_ORIGINALS_QUARANTINED/);
 assert.doesNotMatch(publisher,/await postPhase2hPrivateRawRecords\(/);
});
