import {test} from "node:test";
import assert from "node:assert/strict";
import {seedShadowArchivedPointer} from "../lib/d1-step3-shadow-pointer-seed.mjs";

const env={
 GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED:"YES",
 GEOMACRO_D1_SHADOW_DATABASE_ID:"11111111-2222-4333-8444-555555555555",
 D1_DATABASE_ID:"99999999-8888-4777-8666-555555555555",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"isolated-shadow-ref-only",
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"offline-only-never-production-token",
 PHASE2H_R2_REFERENCE_HMAC_KEY:"f".repeat(64)
};
test("offline: no genuine archived source means NOT_YET_VERIFIED and ZERO D1/R2 writes",async()=>{
 let writes=0,requests=0;
 const result=await seedShadowArchivedPointer({
  env,readD1:async()=>[],writeD1:async()=>{writes++},
  fetchImpl:async()=>{requests++;throw Error("must-not-call")},
  now:Date.parse("2026-11-08T12:00:00.000Z")
 });
 assert.equal(result.status,"NOT_YET_VERIFIED");
 assert.equal(result.code,"NO_REAL_B2_ACKNOWLEDGED_SHADOW_RECORD");
 assert.equal(writes,0);assert.equal(requests,0);
});
test("offline: shadow ID same as prod and absent dedicated approval never writes",async()=>{
 for(const e of [
  {...env,GEOMACRO_D1_SHADOW_DATABASE_ID:env.D1_DATABASE_ID},
  {...env,GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED:"NO"},
  {...env,PHASE2H_R2_REFERENCE_HMAC_KEY:""},
 ]){
  await assert.rejects(seedShadowArchivedPointer({
   env:e,readD1:async()=>{throw Error("not allowed")},
   writeD1:async()=>{throw Error("not allowed")}}
  ),/STEP3_SHADOW_SEED_SHADOW_ISOLATION_OR_CREDENTIAL_UNVERIFIED/u);
 }
});
test("offline: forged B2 ACK identifier cannot produce an R2 pointer",async()=>{
 const forged={
  record_id:"not-a-record-id",raw_sha256:"b".repeat(64),
  b2_object_sha256:"c".repeat(64),
  category:"macro",raw_json:"{}".padEnd(320," "),
  original_published_at:"2026-11-08T12:00:00.000Z",
  first_ingested_at:"2026-11-08T12:00:00.000Z",
  b2_archived_at:"2026-11-08T12:00:00.000Z",
  risk_country_iso3:"USA"
 };
 await assert.rejects(seedShadowArchivedPointer({
  env,readD1:async()=>[forged],
  writeD1:async()=>{throw Error("not allowed")},
  fetchImpl:async()=>{throw Error("not allowed")}
 }),/STEP3_SHADOW_SEED_ARCHIVED_SOURCE_IDENTITY_INVALID/u);
});
