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
 assert.match(url,/\/objects\/geomacro\/private\/phase2h\/ref-only\/v1\/a%20b\.json$/u);
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
  assert.ok(Buffer.isBuffer(init.body));
  assert.deepEqual(init.body,bytes);
  assert.equal(init.headers["Content-Type"],"application/octet-stream");
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

test("offline: invalid payload or GET-with-body cannot touch R2",async()=>{
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,"safe/object");
 let calls=0;const never=async()=>{calls++;throw Error("do not call")};
 await assert.rejects(shadowR2Request(url,env,"PUT",never,
  Buffer.alloc(0)),/STEP3_SHADOW_SEED_R2_PUT_BODY_INVALID/u);
 await assert.rejects(shadowR2Request(url,env,"PUT",never,
  "not-bytes"),/STEP3_SHADOW_SEED_R2_PUT_BODY_INVALID/u);
 await assert.rejects(shadowR2Request(url,env,"GET",never,
  Buffer.from("not-a-get")),/STEP3_SHADOW_SEED_R2_GET_BODY_INVALID/u);
 assert.equal(calls,0);
});


test("offline: existing Shadow pointer requires signed HMAC + independent R2 byte GET, zero new writes",async()=>{
 const {createHash,createHmac}=await import("node:crypto");
 const {pointerEnvelope}=await import("../lib/d1-step3-crypto-proof.mjs");
 const {verifyExistingShadowArchivedPointer}=await import(
  "../lib/d1-step3-shadow-pointer-seed.mjs");
 const sha=x=>createHash("sha256").update(x).digest("hex");
 const row={
  record_id:"a".repeat(64),raw_sha256:"b".repeat(64),
  b2_object_sha256:"c".repeat(64),b2_archived_at:"2026-11-08T12:01:00.000Z",
  first_ingested_at:"2026-11-08T12:00:00.000Z",
  original_published_at:"2026-11-08T11:59:00.000Z",
  category:"geopolitics",risk_country_iso3:"USA"
 };
 row.raw_json=JSON.stringify({record_id:row.record_id,
  raw_sha256:row.raw_sha256,category:row.category,
  ingested_at:row.first_ingested_at,
  original:{original_published_at:row.original_published_at}});
 const bundle=Buffer.from(JSON.stringify({
  schema:"geomacro.phase2h.r2-private-reference-bundle.v1",
  records:[row.raw_json]
 }));
 const objectSha=sha(bundle),now=Date.parse("2026-11-09T19:45:00.000Z");
 const pointer={
  record_id:row.record_id,category:row.category,
  original_published_at:row.original_published_at,
  first_ingested_at:row.first_ingested_at,raw_sha256:row.raw_sha256,
  object_sha256:objectSha,
  object_key:"geomacro/private/phase2h/ref-only/v1/"+objectSha+".json",
  bundle_bytes:bundle.length,record_sha256:sha(row.raw_json),
  record_bytes:Buffer.byteLength(row.raw_json),bundle_index:0,
  signed_at:"2026-11-09T19:00:00.000Z",
  pointer_hmac_sha256:"0".repeat(64),risk_country_iso3:"USA",
  storage_backend:"private_r2"
 };
 pointer.pointer_hmac_sha256=createHmac("sha256",
  Buffer.from(env.PHASE2H_R2_REFERENCE_HMAC_KEY,"hex"))
  .update(pointerEnvelope(pointer)).digest("hex");
 let gets=0;
 const fetchImpl=async(url,init)=>{
  assert.equal(init.method,"GET");
  assert.equal(url,shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
   env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,pointer.object_key));
  gets++;return new Response(bundle,{status:200});
 };
 const args={row,pointer,env,fetchImpl,now};
 const ok=await verifyExistingShadowArchivedPointer(args);
 assert.equal(ok.status,"PASS_REAL_SHADOW_ARCHIVED_ORIGINAL_POINTER_STAGING_ONLY");
 assert.equal(ok.reused_existing_pointer,true);
 assert.equal(ok.r2_puts,0);assert.equal(ok.r2_gets,1);
 assert.equal(ok.b2_provider_byte_readback,"NOT_YET_VERIFIED");
 assert.equal(ok.production_d1_mutated,false);
 assert.equal(gets,1);
 await assert.rejects(verifyExistingShadowArchivedPointer({
  ...args,pointer:{...pointer,pointer_hmac_sha256:"d".repeat(64)}
 }),/STEP3_SHADOW_SEED_EXISTING_POINTER_HMAC_INVALID/u);
 for(const mutation of [
  {raw_sha256:"0".repeat(64)},{object_sha256:"0".repeat(64)},
  {record_sha256:"0".repeat(64)},{bundle_bytes:bundle.length+1},
  {risk_country_iso3:"CAN"},{signed_at:"2099-01-01T00:00:00.000Z"}
 ]){
  await assert.rejects(verifyExistingShadowArchivedPointer({
   ...args,pointer:{...pointer,...mutation}
  }),/STEP3_SHADOW_SEED_EXISTING_POINTER_IMMUTABLE_OR_METADATA_MISMATCH/u);
 }
 assert.equal(gets,1);
 await assert.rejects(verifyExistingShadowArchivedPointer({
  ...args,fetchImpl:async()=>new Response(Buffer.from("wrong"),{status:200})
 }),/STEP3_SHADOW_SEED_EXISTING_POINTER_R2_PHYSICAL_BYTE_READBACK_MISMATCH/u);
 await assert.rejects(verifyExistingShadowArchivedPointer({
  ...args,fetchImpl:async()=>new Response("missing",{status:404})
 }),/STEP3_SHADOW_SEED_R2_GET_HTTP_404_CF_UNKNOWN/u);
});
test("offline: duplicate staging must query complete pointer and perform physical readback",async()=>{
 const {readFileSync}=await import("node:fs");
 const code=readFileSync("scripts/lib/d1-step3-shadow-pointer-seed.mjs","utf8");
 assert.match(code,/SELECT record_id,category,original_published_at,first_ingested_at,/u);
 assert.match(code,/if\(old.length\)return verifyExistingShadowArchivedPointer/u);
 assert.doesNotMatch(code,/SHADOW_POINTER_ALREADY_EXISTS_REQUIRES_READBACK/u);
});

test("offline: bounded Shadow R2 GET transport retries preserve strict fail-closed proof",async()=>{
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,"immutable/ref-only.json");
 let calls=0;
 const res=await shadowR2Request(url,env,"GET",async(_url,init)=>{
  calls++;
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"error");
  if(calls<3)throw Error("NETWORK_PRIVATE_RESPONSE_DO_NOT_PRINT");
  return new Response(Buffer.from("exact-existing-object-bytes"),{status:200});
 });
 assert.equal(calls,3);
 assert.equal((await res.text()),"exact-existing-object-bytes");

 let persistent=0;
 await assert.rejects(shadowR2Request(url,env,"GET",async()=>{
  persistent++;
  throw Error("SECRET_NETWORK_DIAGNOSTIC_NOT_FOR_LOG");
 }),e=>{
  assert.equal(e.message,"STEP3_SHADOW_SEED_R2_PROVIDER_UNAVAILABLE");
  assert.doesNotMatch(e.message,/SECRET_NETWORK/u);
  return true;
 });
 assert.equal(persistent,3);

 let forbidden=0;
 await assert.rejects(shadowR2Request(url,env,"GET",async()=>{
  forbidden++;
  return new Response(JSON.stringify({success:false,errors:[{code:10000}]}),
   {status:403,headers:{"Content-Type":"application/json"}});
 }),/STEP3_SHADOW_SEED_R2_GET_HTTP_403_CF_10000/u);
 assert.equal(forbidden,1,"HTTP auth failures MUST NEVER be retried");

 let writes=0;
 await assert.rejects(shadowR2Request(url,env,"PUT",async()=>{
  writes++;
  throw Error("UNKNOWN_PUT_ACK");
 },Buffer.from("fixture")) ,
 /STEP3_SHADOW_SEED_R2_PROVIDER_UNAVAILABLE/u);
 assert.equal(writes,1,"unknown PUT acknowledgement MUST NEVER be retried");
});
