import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {
 shadowArchivedSourceQuery,verifyRealShadowB2Parity,
 verifyRealShadowDualWorkers
} from "../lib/d1-step3-real-shadow-proofs.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const a="a".repeat(64),d1="11111111-2222-4333-8444-555555555555";
const original={record_id:a,raw_sha256:"b".repeat(64),category:"macro",
 ingested_at:new Date().toISOString(),
 original:{original_published_at:new Date().toISOString()}};
const compressed=gzipSync(Buffer.from(JSON.stringify({
 schema:"geomacro.phase2h.private-raw-b2-object.v1",
 record_count:1,rows:[original]
})),{mtime:0});
const source={
 record_id:a,raw_sha256:original.raw_sha256,
 b2_object_sha256:sha(compressed),
 b2_archived_at:"2026-11-08T10:00:00.000Z",
 raw_json:JSON.stringify(original)
};
const env={
 B2_ACCOUNT_QUOTA_REQUIRED:"1",
 B2_ARCHIVE_READ_KEY_ID:"read-test-credential",
 B2_ARCHIVE_READ_APPLICATION_KEY:"read-secret-placeholder",
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"test-cloudflare-token-placeholder-very-long",
 CONTROL_PLANE_TOKEN:"test-control-plane-token-placeholder-long",
 GEOMACRO_D1_SHADOW_DATABASE_ID:d1,
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"private-shadow-r2",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:"geomacro-step3-shadow.demo.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:"geomacro-step3-shadow-legacy.demo.workers.dev"
};
test("live B2 parity verifier enforces complete byte GET, gzip identity and governed key",async()=>{
 let expected=null;
 const b2Factory=()=>({get:async key=>{
  expected=key;return compressed;
 }});
 const r=await verifyRealShadowB2Parity({env,source,b2Factory});
 assert.equal(r.status,"PASS_REAL_B2_BYTE_READBACK");
 assert.equal(r.independent_b2_full_get_verified,true);
 assert.match(expected,/phase2h-raw-news\/2026\/11\/08\//u);
 await assert.rejects(verifyRealShadowB2Parity({env,source:{
  ...source,b2_object_sha256:"c".repeat(64)},b2Factory}),/STEP3_PHYSICAL_INDEPENDENT_B2_BYTES_OR_SHA256_MISMATCH/u);
 await assert.rejects(verifyRealShadowB2Parity({env:{
  ...env,B2_ACCOUNT_QUOTA_REQUIRED:"0"},source,b2Factory}),/STEP3_PHYSICAL_B2_SOURCE_OR_GOVERNED_READ_CREDENTIAL_UNVERIFIED/u);
});
function fakeProvider({wrongShadow=false,newR2Missing=false}={}){
 const calls=[];
 const fetchImpl=async (url,req={})=>{
  calls.push(url);
  const isNew=url.includes("/workers/scripts/geomacro-step3-shadow/");
  const version="33333333-4444-4555-8666-777777777777";
  let data;
  if(req.method==="PUT"&&url.endsWith("/v1/internal/phase2h-raw-news")){
   data={ok:true,schema:"geomacro.phase2h.private-d1-receipt.v1",
    accepted:0,unchanged:1,d1_exact_readback_verified:true,
    per_original_readback_verified:true,per_original_verified_count:1,
    all_submitted_five_parts_exact:true,payments:0};
  }else if(url.endsWith("/settings")){
   data={success:true,result:{bindings:[
    {name:"DB",type:"d1",database_id:wrongShadow?"bad-uuid":d1},
    ...isNew&&!newR2Missing?[{
     type:"r2_bucket",name:"PHASE2H_PRIVATE_R2",bucket_name:"private-shadow-r2"}]:[]
   ]}};
  }else if(url.endsWith("/deployments")){
   data={success:true,result:{deployments:[{
    created_on:"2026-11-08T10:00:00.000Z",
    versions:[{version_id:version,percentage:100}]
   }]}};
  }else if(url.includes("raw-object-ref")){
   data={ok:true,schema:"geomacro.phase2h.private-r2-reference-readback.v1",
    pointer_and_object_verified:true,legacy_fallback:false,
    record:{record_id:a,raw_sha256:original.raw_sha256},paid_eligible:false};
  }else{
   data={ok:true,schema:"geomacro.phase2h.private-question-fivepart.v1",
    question_matches:[{record_id:a,category:"macro",archive_d1_ack_present:true}],
    paid_eligible:false};
  }
  return new Response(JSON.stringify(data),{status:200});
 };
 return {fetchImpl,calls};
}
test("two deployed shadow identities must each bind to the exact shadow DB",async()=>{
 const p=fakeProvider();
 const r=await verifyRealShadowDualWorkers({env,source,fetchImpl:p.fetchImpl});
 assert.equal(r.status,"PASS_REAL_DISTINCT_SHADOW_WORKER_ROLLBACK_READBACK");
 assert.equal(r.legacy_worker_rollback_verified,true);
 assert.equal(r.legacy_worker_idempotent_write_verified,true);
 assert(p.calls.some(x=>x.endsWith("/v1/internal/phase2h-raw-news")));
 assert.equal(r.new_worker_hydration_verified,true);
 assert(p.calls.some(x=>x.endsWith("/settings")));
 await assert.rejects(verifyRealShadowDualWorkers({env,source,
  fetchImpl:fakeProvider({wrongShadow:true}).fetchImpl}),
 /STEP3_PHYSICAL_WORKER_NOT_BOUND_TO_SHADOW_UUID/u);
 await assert.rejects(verifyRealShadowDualWorkers({env,source,
  fetchImpl:fakeProvider({newR2Missing:true}).fetchImpl}),
 /STEP3_PHYSICAL_NEW_WORKER_NOT_BOUND_TO_PRIVATE_SHADOW_R2/u);
});
test("a localhost or only one Worker URL cannot prove production dual-version compatibility",async()=>{
 await assert.rejects(verifyRealShadowDualWorkers({env:{
  ...env,GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:"shadow-worker.local"
 },source,fetchImpl:fakeProvider().fetchImpl}),
 /STEP3_PHYSICAL_TWO_REAL_SHADOW_WORKER_PREREQUISITES_MISSING/u);
 assert.match(shadowArchivedSourceQuery(),/LIMIT 1$/u);
});
