import {test} from "node:test";
import assert from "node:assert/strict";
import {seedShadowArchivedPointer,shadowR2ObjectUrl,shadowR2Request}
 from "../lib/d1-step3-shadow-pointer-seed.mjs";

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

test("offline: Cloudflare REST R2 key keeps literal slash separators",()=>{
 const key="geomacro/private/phase2h/ref-only/v1/a b.json";
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,key);
 assert.match(url,/\/objects\/geomacro\/private\/phase2h\/ref-only\/v1\/a%20b\\.json$/u);
 assert.doesNotMatch(url,/%2F/iu);
});
test("offline: provider rejection retains only HTTP and numeric CF code",async()=>{
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,"safe/object");
 for(const [status,code] of [[403,10000],[401,10002],[429,10058]]){
  await assert.rejects(shadowR2Request(url,env,"PUT",async()=>new Response(
   JSON.stringify({success:false,errors:[{code,message:"DO_NOT_LEAK_BODY"}]}),
   {status,headers:{"Content-Type":"application/json"}}
  ),Buffer.from("fixture")),e=>{
   assert.equal(e.message,
    "STEP3_SHADOW_SEED_R2_PUT_HTTP_"+status+"_CF_"+code);
   assert.doesNotMatch(e.message,/DO_NOT_LEAK_BODY/u);
   return true;
  });
 }
 await assert.rejects(shadowR2Request(url,env,"GET",async()=>
  new Response("opaque HTML response",{status:503})
 ),/STEP3_SHADOW_SEED_R2_GET_HTTP_503_CF_UNKNOWN/u);
});
test("offline: R2 PUT requires successful provider envelope and matching metadata",async()=>{
 const key="geomacro/private/phase2h/ref-only/v1/fixture.json";
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,key);
 const bytes=Buffer.from("immutable-test-fixture");
 const response=await shadowR2Request(url,env,"PUT",async(_url,init)=>{
  assert.equal(init.method,"PUT");
  assert.ok(init.body instanceof FormData);
  return new Response(JSON.stringify({
   success:true,result:{key,size:String(bytes.length)}
  }),{status:200,headers:{"Content-Type":"application/json"}});
 },bytes);
 assert.equal(response.status,200);
 await assert.rejects(shadowR2Request(url,env,"PUT",async()=>new Response(
  JSON.stringify({success:false,errors:[{code:1000}]}),{status:200}
 ),bytes),/STEP3_SHADOW_SEED_R2_PUT_ACK_INVALID/u);
 await assert.rejects(shadowR2Request(url,env,"PUT",async()=>new Response(
  JSON.stringify({success:true,result:{key:"other",size:String(bytes.length)}}),
  {status:200}
 ),bytes),/STEP3_SHADOW_SEED_R2_PUT_ACK_KEY_MISMATCH/u);
});
test("offline: R2 GET returns original bytes; exceptions remain sanitized",async()=>{
 const key="geomacro/private/phase2h/ref-only/v1/fixture.json";
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,key);
 const bytes=Buffer.from("immutable-test-fixture");
 const res=await shadowR2Request(url,env,"GET",async(_url,init)=>{
  assert.equal(init.method,"GET");
  return new Response(bytes,{status:200});
 });
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);
 await assert.rejects(shadowR2Request(url,env,"PUT",async()=>{
  throw Error("SECRET_SHOULD_NOT_LEAK");
 },bytes),e=>{
  assert.equal(e.message,"STEP3_SHADOW_SEED_R2_PROVIDER_UNAVAILABLE");
  return true;
 });
});
