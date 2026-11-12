import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {pointerEnvelope} from "../lib/d1-step3-crypto-proof.mjs";
import {verifyShadowRetentionBoundPointers,classifyShadowPointerRetention}
 from "../lib/d1-step3-shadow-retention-proof.mjs";
const now=Date.parse("2026-11-12T16:00:00.000Z");
const HOST="geomacro-step3-shadow.daspallab202391.workers.dev";
const env={CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 D1_DATABASE_ID:"db057ca9-9f6e-4957-ac28-144f3b798f9b",
 GEOMACRO_D1_SHADOW_DATABASE_ID:"c4add153-229d-412a-b1bd-489526b7e02f",
 GEOMACRO_STEP3_VERIFIED_WORKER_HOST:HOST,
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:HOST,
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 CLOUDFLARE_API_TOKEN:"test-not-a-credential-placeholder",
 CONTROL_PLANE_TOKEN:"e".repeat(64),
 PHASE2H_R2_REFERENCE_HMAC_KEY:"f".repeat(64)};
const sha=x=>createHash("sha256").update(x).digest("hex");
function fixture(c,stamp){
 const record={schema:"geomacro.phase2h.private-raw-observation.v1",
  record_id:c.repeat(64),raw_sha256:"b".repeat(64),category:"macro",
  ingested_at:stamp,original:{original_published_at:stamp},
  fixture_padding:"z".repeat(300)};
 const raw=JSON.stringify(record);
 const bundle=Buffer.from(JSON.stringify({
  schema:"geomacro.phase2h.r2-private-reference-bundle.v1",records:[raw]}));
 const hash=sha(bundle);
 const pointer={record_id:record.record_id,category:"macro",
  original_published_at:stamp,first_ingested_at:stamp,raw_sha256:record.raw_sha256,
  object_sha256:hash,object_key:"geomacro/private/phase2h/ref-only/v1/"+hash+".json",
  bundle_bytes:bundle.length,record_sha256:sha(raw),record_bytes:Buffer.byteLength(raw),
  bundle_index:0,signed_at:stamp,pointer_hmac_sha256:"0".repeat(64),
  risk_country_iso3:"USA",storage_backend:"private_r2"};
 pointer.pointer_hmac_sha256=createHmac("sha256",Buffer.from(env.PHASE2H_R2_REFERENCE_HMAC_KEY,"hex"))
  .update(pointerEnvelope(pointer)).digest("hex");
 return {record,pointer,bundle};
}
test("real expiration requires authenticated 410 PLUS exact HMAC and R2 bytes; fresh still 200",async()=>{
 const old=fixture("d","2026-11-09T08:00:00.000Z");
 const live=fixture("a","2026-11-12T15:00:00.000Z");
 assert.equal(classifyShadowPointerRetention(old.pointer,now),"EXPIRED");
 assert.equal(classifyShadowPointerRetention(live.pointer,now),"ACTIVE");
 let workerReads=0,r2Reads=0;
 const makeFetch=(badCode=410,badExpiredBytes=false,badActiveBytes=false)=>async(url,request)=>{
  const u=new URL(String(url));
  if(u.origin==="https://"+HOST){
   workerReads++;
   if(u.searchParams.get("record_id")===old.record.record_id)
    return new Response(null,{status:badCode});
   return Response.json({ok:true,schema:"geomacro.phase2h.private-r2-reference-readback.v1",
    pointer_and_object_verified:true,legacy_fallback:false,
    paid_eligible:false,b2_archive_verified:false,record:live.record});
  }
  assert.equal(u.origin,"https://api.cloudflare.com");
  assert.equal(request.method,"GET");
  r2Reads++;
  const key=decodeURIComponent(u.pathname.split("/objects/")[1]??"");
  if(key===old.pointer.object_key)
   return new Response(badExpiredBytes?Buffer.from("wrong"):old.bundle,{status:200});
  if(key===live.pointer.object_key)
   return new Response(badActiveBytes?Buffer.from("wrong"):live.bundle,{status:200});
  throw Error("UNEXPECTED_R2_OBJECT");
 };
 const args={rows:[old.pointer,live.pointer],env,now,sleepImpl:async()=>{}};
 const p=await verifyShadowRetentionBoundPointers({...args,fetchImpl:makeFetch()});
 assert.equal(p.active_worker_200_verified,1);
 assert.equal(p.expired_worker_410_and_physical_r2_verified,1);
 assert.equal(p.cryptographic_readback_verified,true);
 assert.equal(p.b2_physical_parity,"NOT_YET_VERIFIED");
 assert.equal(p.all_step3_acceptance_proven,false);
 assert.equal(r2Reads,2);assert.equal(workerReads,2);
 assert.equal(p.authenticated_active_r2_gets,1);
 assert.equal(p.authenticated_expired_r2_gets,1);
 assert.equal(p.independent_full_object_r2_gets,2);
 assert.equal(p.all_pointers_independent_full_r2_byte_readback_verified,true);
 await assert.rejects(verifyShadowRetentionBoundPointers({
  ...args,fetchImpl:makeFetch(403)
 }),/EXPIRED_WORKER_EXPECTED_410_GOT_403/);
 await assert.rejects(verifyShadowRetentionBoundPointers({
  ...args,fetchImpl:makeFetch(410,true)
 }),/EXPIRED_R2_BUNDLE_BYTES_OR_SHA_INVALID/);
 await assert.rejects(verifyShadowRetentionBoundPointers({
  ...args,fetchImpl:makeFetch(410,false,true)
 }),/ACTIVE_R2_BUNDLE_BYTES_OR_SHA_INVALID/);
 old.pointer.pointer_hmac_sha256="0".repeat(64);
 await assert.rejects(verifyShadowRetentionBoundPointers({
  ...args,fetchImpl:makeFetch()
 }),/STEP3_POINTER_HMAC_SHA256_REJECTED/);
 await assert.rejects(verifyShadowRetentionBoundPointers({
  ...args,rows:[old.pointer],fetchImpl:makeFetch()
 }),/NO_CURRENT_AUTHENTICATED_POINTER/);
});
test("production retains unchanged strict full pointer verifier",async()=>{
 const {readFileSync}=await import("node:fs");
 const x=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(x,/const proof=shadow\?/);
 assert.match(x,/verifyShadowRetentionBoundPointers/);
 assert.match(x,/verifyRealPhase2hPointerRows\(\{rows:result\.rows,env\}\)/);
 assert.match(x,/\},\{shadow:true\}\)/);
 assert.match(x,/SHADOW_REAL_ARCHIVED_POINTER_NOT_VERIFIED/);
 assert.match(x,/await verifyRealShadowB2Parity\(/);
});
