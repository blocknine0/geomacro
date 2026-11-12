import test from "node:test";
import assert from "node:assert/strict";
import {inspectShadowPointerWorker,shadowPointerDiagnosticScope}
 from "../ops/diagnose-step3-shadow-pointer-http.mjs";

const sha="f".repeat(40);
const base={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:sha,
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 D1_DATABASE_ID:"db057ca9-9f6e-4957-ac28-144f3b798f9b",
 GEOMACRO_D1_SHADOW_DATABASE_ID:"c4add153-229d-412a-b1bd-489526b7e02f",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:
  "geomacro-step3-shadow.daspallab202391.workers.dev",
 CLOUDFLARE_API_TOKEN:"fake-provider-read-only-token-do-not-log",
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:"fake-shadow-auth-bearer-key-not-for-logs"
};
const NOW=Date.parse("2026-11-12T15:40:00.000Z");
const fresh={record_id:"a".repeat(64),first_ingested_at:
 "2026-11-12T15:30:00.000Z"};
const expired={record_id:"b".repeat(64),first_ingested_at:
 "2026-11-09T14:00:00.000Z"};
function provider({rows=[fresh,expired],statuses=[200,410],rowsRead=3,rowsWritten=0}={}){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,method:init.method});
  if(url.includes("/d1/database/")){
   assert.equal(init.method,"POST");
   assert.equal(JSON.parse(init.body).sql,
    "SELECT record_id,first_ingested_at FROM phase2h_raw_object_refs_v1 "+
    "ORDER BY record_id ASC LIMIT 11");
   return Response.json({success:true,result:[{success:true,results:rows,
    meta:{rows_read:rowsRead,rows_written:rowsWritten}}]});
  }
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"manual");
  assert.equal(init.headers.Authorization,"Bearer "+
   base.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN);
  const n=calls.filter(x=>x.method==="GET").length-1;
  return new Response(null,{status:statuses[n]??200});
 };
 return {fetchImpl,calls};
}
test("genuine exact-main shadow scope rejects prod target, unknown worker and non-owner ref",()=>{
 assert.equal(shadowPointerDiagnosticScope(base),true);
 for(const env of [
  {...base,GEOMACRO_D1_SHADOW_DATABASE_ID:base.D1_DATABASE_ID},
  {...base,GITHUB_REF:"refs/pull/1/merge"},
  {...base,GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:"api.geomacro.live"},
  {...base,CLOUDFLARE_API_TOKEN:""}
 ])assert.throws(()=>shadowPointerDiagnosticScope(env),
  /STEP3_POINTER_DIAGNOSTIC_EXACT_MAIN_SHADOW_AND_CREDENTIAL_SCOPE_UNVERIFIED/);
});
test("same bounded query identifies expired historical reference and real 410 without pretending Stage2 passed",async()=>{
 const p=provider();
 const r=await inspectShadowPointerWorker({env:base,now:NOW,fetchImpl:p.fetchImpl});
 assert.equal(r.status,"HOLD");
 assert.equal(r.code,"NON_200_WORKER_POINTER_OBSERVED");
 assert.deepEqual(r.requests.map(x=>x.http_status),[200,410]);
 assert.deepEqual(r.requests.map(x=>x.age_band),
  ["WITHIN_72H_RETENTION","OVER_72H_RETENTION"]);
 assert.equal(r.d1_rows_read,3);
 assert.equal(r.worker_gets,2);
 assert.equal(r.production_d1_mutations,0);
 assert.equal(r.shadow_d1_mutations,0);
 assert.equal(r.b2_requests,0);
 assert.equal(r.stage2_authorized,false);
 assert.equal(r.full_hmac_r2_b2_proof_claimed,false);
 const safe=JSON.stringify(r);
 assert.doesNotMatch(safe,/fake-shadow-auth|fake-provider-read|a{64}|b{64}|https:\/\/geomacro-step3/);
});
test("even two HTTP 200s are diagnostic only; no provider HMAC/R2/B2 PASS granted",async()=>{
 const p=provider({statuses:[200,200]});
 const r=await inspectShadowPointerWorker({env:base,now:NOW,fetchImpl:p.fetchImpl});
 assert.equal(r.status,"OBSERVATION_ONLY");
 assert.equal(r.code,"ALL_HTTP_200_NOT_CRYPTOGRAPHIC_PROOF");
 assert.equal(r.full_hmac_r2_b2_proof_claimed,false);
});
test("negative D1 metadata and over-ten rows stop before any Worker requests",async()=>{
 for(const options of [
  {rows:new Array(11).fill(fresh)},
  {rowsRead:1001},
  {rowsWritten:1},
  {rows:[{...fresh,record_id:"untrusted"}]},
  {rows:[{...fresh,first_ingested_at:"not-a-date"}]}
 ]){
  const p=provider(options);
  const r=await inspectShadowPointerWorker({env:base,now:NOW,fetchImpl:p.fetchImpl});
  assert.equal(r.status,"HOLD");
  assert.equal(r.worker_gets,0);
  assert.equal(p.calls.filter(x=>x.method==="GET").length,0);
  assert.equal(r.b2_requests,0);
 }
});
