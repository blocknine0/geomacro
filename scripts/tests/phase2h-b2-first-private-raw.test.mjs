import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {buildPhase2hPrivateRawRecords} from "../lib/phase2h-raw-original-records.mjs";
import {
 assertB2FirstSourceEnv,stageB2FirstPrivateOriginals,acknowledgeB2FirstD1
} from "../ops/phase2h-b2-first-private-raw.mjs";
const now=new Date("2026-11-03T19:50:00.000Z");
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",
 B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"registered_original_archive",
 B2_REQUEST_BUDGET:"12",PHASE2H_PROVIDER_MAINTENANCE:"true",
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 D1_DATABASE_ID:"00000000-0000-4000-8000-000000000001",
 CLOUDFLARE_API_TOKEN:"token-".repeat(8),
 B2_KEY_ID:"b2-write-key-id",B2_APPLICATION_KEY:"b2-write-key-secret",
};
const rows=buildPhase2hPrivateRawRecords([{
 category:"macro",title:"Central bank announces new inflation and monetary policy framework",
 sourceId:"centralbank",articleUrl:"https://centralbank.example.org/news/monetary-policy",
 publishedAt:"2026-11-03T19:30:00.000Z",credit:null,
}],{now,derive:()=>[]}).records;
const sufficient={
 ok:true,used:{total:0,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0},
 limits:{total:720,GET:340,PUT:380,HEAD:40,NATIVE_AUTH:40},
};
const verifiedLifecycle={
 phase2h_raw_prefix_verified:true,auto_deletion_paused:true,no_bucket_mutation:true,
};
const governorFactory=()=>({status:async()=>sufficient});
const lifecycleVerifier=async()=>verifiedLifecycle;
const digest=x=>createHash("sha256").update(x).digest("hex");

test("B2 first private original requires protected main, original metadata and atomic governor",()=>{
 assert.equal(assertB2FirstSourceEnv(env),true);
 for(const override of [{B2_ACCOUNT_QUOTA_REQUIRED:"0"},
  {GITHUB_REF:"refs/heads/untrusted"},{PHASE2H_PROVIDER_MAINTENANCE:"false"},
  {B2_ACCOUNT_QUOTA_WORKFLOW_ID:"unsafe"}]){
  assert.throws(()=>assertB2FirstSourceEnv({...env,...override}),
   /PHASE2H_B2_FIRST_PROTECTED_QUOTA_CONFIG_REQUIRED/u);
 }
});
test("genuine gzip object has two GET/SHA proofs before D1 write/ack",async()=>{
 const stages=[],bytes=[];
 const receipt=await stageB2FirstPrivateOriginals({
  rows,now,env,governorFactory,lifecycleVerifier,
  b2Factory:()=>({
   putWithMetadataVerification:async(key,compressed,{verifyRestored})=>{
    stages.push("PUT_GET");assert.match(key,/private\/phase2h-raw-news\/2026\/11\/03\/.*\.json\.gz$/u);
    await verifyRestored(compressed);bytes.push(Buffer.from(compressed));
    return {full_body_readback_verified:true,sha256:digest(compressed),bytes:compressed.length};
   },
   get:async(key)=>{
    stages.push("SECOND_GET");assert.match(key,/phase2h-raw-news/u);return bytes[0];
   },
  }),
 });
 assert.deepEqual(stages,["PUT_GET","SECOND_GET"]);
 assert.equal(receipt.record_count,1);
 assert.equal(receipt.storage_confirmed,true);
 assert.equal(receipt.d1_receipt_pending,true);
 assert.equal(receipt.paid_eligible,false);
 let calls=0;
 const ack=await acknowledgeB2FirstD1({
  receipt,postResult:{stored:1,duplicate:0,rejected_conflicts:0,readback_verified:true,verified_originals:1},
  endpoint:"https://geomacro-control-plane.daspallab202391.workers.dev",
  token:"a".repeat(64),
  fetchImpl:async(url,opts)=>{
   calls++;const b=JSON.parse(opts.body);
   assert.match(url,/\/v1\/internal\/phase2h-raw-news$/u);
   assert.equal(opts.method,"PUT");
   assert.equal(b.object_sha256,receipt.object_sha256);
   assert.equal(b.items.length,1);
   assert.equal(b.items[0].record_id,rows[0].record_id);
   return Response.json({ok:true,archived:1,
    independent_d1_archive_ack_verified:true,rights_verified:false,payments:0});
  },
 });
 assert.equal(calls,1);
 assert.equal(ack.b2_verified,true);
 assert.equal(ack.d1_ack_verified,true);
 assert.equal(ack.archived,1);
 assert.equal(ack.paid_eligible,false);
});
test("quota hold cannot PUT B2 or manufacture verified storage",async()=>{
 let calls=0;
 const receipt=await stageB2FirstPrivateOriginals({
  rows,now,env,
  governorFactory:()=>({status:async()=>({...sufficient,used:{...sufficient.used,total:719}})}),
  b2Factory:()=>{calls++;throw Error("UNEXPECTED_B2");},
 });
 assert.equal(receipt.storage_confirmed,false);
 assert.equal(calls,0);
 assert.equal(receipt.status,"B2_SHARED_ACCOUNT_HEADROOM_HELD");
});
test("provider lifecycle unverified blocks B2 PUT, not paid-gate bypass",async()=>{
 let puts=0;
 await assert.rejects(
  stageB2FirstPrivateOriginals({rows,now,env,governorFactory,
   lifecycleVerifier:async()=>({...verifiedLifecycle,auto_deletion_paused:false}),
   b2Factory:()=>{puts++;throw Error("UNREACHABLE");},
  }),/PHASE2H_B2_FIRST_PROVIDER_LIFECYCLE_NOT_ACCEPTED/u);
 assert.equal(puts,0);
});
test("historic immutable duplicates do not get bogus B2 archived metadata",async()=>{
 let calls=0;
 const result=await acknowledgeB2FirstD1({
  receipt:{storage_confirmed:true,rows,record_count:1,object_sha256:"e".repeat(64)},
  postResult:{stored:0,duplicate:1,rejected_conflicts:0},
  fetchImpl:async()=>{calls++;throw Error("MUST_NOT_CALL");},
 });
 assert.equal(result.archived,0);
 assert.equal(calls,0);
 assert.equal(result.status,"B2_FIRST_D1_HISTORIC_IDENTITY_NEEDS_RECOVERY");
});
test("false Worker ACK cannot be counted as B2-first D1 parity",async()=>{
 const result=await acknowledgeB2FirstD1({
  receipt:{storage_confirmed:true,rows,record_count:1,object_sha256:"e".repeat(64)},
  postResult:{stored:1,duplicate:0,rejected_conflicts:0,readback_verified:true,verified_originals:1},
  endpoint:"https://geomacro-control-plane.daspallab202391.workers.dev",
  token:"a".repeat(64),
  fetchImpl:async()=>Response.json({ok:true,archived:1,
   independent_d1_archive_ack_verified:false,rights_verified:false,payments:0}),
 });
 assert.equal(result.archived,0);
 assert.equal(result.deferred,1);
 assert.equal(result.d1_ack_verified,false);
 assert.equal(result.all_selected_originals_archived,false);
});
test("one duplicate cannot block a genuine fresh B2/D1 ACK in the same original batch",async()=>{
 const r2=buildPhase2hPrivateRawRecords([{
  category:"geopolitics",
  title:"Government announces new regional border security measures",
  sourceId:"government",articleUrl:"https://government.example.org/border",
  publishedAt:"2026-11-03T19:35:00.000Z",credit:null,
 }],{now,derive:()=>[]}).records[0];
 const selected=[...rows,r2],calls=[];
 const receipt={storage_confirmed:true,rows:selected,record_count:2,
  object_sha256:"e".repeat(64)};
 const result=await acknowledgeB2FirstD1({
  receipt,postResult:{stored:1,duplicate:1,rejected_conflicts:0,
   verified_originals:2,readback_verified:true},
  endpoint:"https://geomacro-control-plane.daspallab202391.workers.dev",
  token:"a".repeat(64),
  fetchImpl:async(url,opts)=>{
   const body=JSON.parse(opts.body);
   assert.equal(body.items.length,1);
   const id=body.items[0].record_id;
   calls.push(id);
   return id===r2.record_id?
    Response.json({ok:false,error:"PRIVATE_ARCHIVE_ACK_READBACK_UNVERIFIED"},{status:503}):
    Response.json({ok:true,archived:1,independent_d1_archive_ack_verified:true,
     rights_verified:false,payments:0});
  },
 });
 assert.deepEqual(calls,selected.map(r=>r.record_id));
 assert.equal(result.archived,1);
 assert.equal(result.deferred,1);
 assert.equal(result.status,"B2_FIRST_PARTIAL_D1_ACK_VERIFIED");
 assert.equal(result.d1_ack_verified,true);
 assert.equal(result.all_selected_originals_archived,false);
});


test("known provider-native lifecycle rejection remains a redacted actionable error",async()=>{
 let puts=0;
 await assert.rejects(stageB2FirstPrivateOriginals({
  rows,now,env,governorFactory,
  lifecycleVerifier:async()=>{throw Error("PHASE2H_B2_72H_AUTOMATIC_DELETION_STILL_ENABLED");},
  b2Factory:()=>{puts++;throw Error("UNREACHABLE");},
 }),/PHASE2H_B2_FIRST_AUTOMATIC_DELETION_STILL_ENABLED/u);
 assert.equal(puts,0);
});
test("untrusted raw lifecycle error strings can never disclose provider details",async()=>{
 await assert.rejects(stageB2FirstPrivateOriginals({
  rows,now,env,governorFactory,
  lifecycleVerifier:async()=>{throw Error("SECRET native raw HTTP bearer");},
 }),/^Error: PHASE2H_B2_FIRST_PROVIDER_LIFECYCLE_UNVERIFIED$/u);
});

test("known provider-native lifecycle rejection remains a redacted actionable error",async()=>{
 let puts=0;
 await assert.rejects(stageB2FirstPrivateOriginals({
  rows,now,env,governorFactory,
  lifecycleVerifier:async()=>{throw Error("PHASE2H_B2_72H_AUTOMATIC_DELETION_STILL_ENABLED");},
  b2Factory:()=>{puts++;throw Error("UNREACHABLE");},
 }),/PHASE2H_B2_FIRST_AUTOMATIC_DELETION_STILL_ENABLED/u);
 assert.equal(puts,0);
});
test("untrusted raw lifecycle error strings can never disclose provider details",async()=>{
 await assert.rejects(stageB2FirstPrivateOriginals({
  rows,now,env,governorFactory,
  lifecycleVerifier:async()=>{throw Error("SECRET native raw HTTP bearer");},
 }),/^Error: PHASE2H_B2_FIRST_PROVIDER_LIFECYCLE_UNVERIFIED$/u);
});

test("immutable collision is isolated and 2 independently readback-verified originals still get B2 ACK",async()=>{
 const additional=buildPhase2hPrivateRawRecords([
  {category:"geopolitics",title:"Government announces regional security border agreement",
   sourceId:"gov",articleUrl:"https://gov.example.org/border",
   publishedAt:"2026-11-03T19:31:00.000Z",credit:null},
  {category:"rare_earth",title:"Government announces lithium mineral export control restrictions",
   sourceId:"minerals",articleUrl:"https://minerals.example.org/export",
   publishedAt:"2026-11-03T19:33:00.000Z",credit:null},
 ],{now,derive:()=>[]}).records;
 assert.equal(additional.length,2);
 const selected=[...rows,...additional];
 let submitted=0;
 const result=await acknowledgeB2FirstD1({
  receipt:{storage_confirmed:true,rows:selected,record_count:3,
   object_sha256:"d".repeat(64)},
  postResult:{stored:1,duplicate:1,rejected_conflicts:1,
   verified_originals:2,readback_verified:true},
  endpoint:"https://geomacro-control-plane.daspallab202391.workers.dev",
  token:"a".repeat(64),
  fetchImpl:async(_url,opts)=>{
   const b=JSON.parse(opts.body);
   assert.equal(b.items.length,1);submitted++;
   return b.items[0].record_id===additional[1].record_id?
    Response.json({ok:false,error:"PRIVATE_ARCHIVE_ACK_READBACK_UNVERIFIED"},
     {status:503}):
    Response.json({ok:true,archived:1,
     independent_d1_archive_ack_verified:true,rights_verified:false,payments:0});
  },
 });
 assert.equal(submitted,3);
 assert.equal(result.archived,2);
 assert.equal(result.deferred,1);
 assert.equal(result.all_selected_originals_archived,false);
 assert.equal(result.status,"B2_FIRST_PARTIAL_D1_ACK_VERIFIED");
});
