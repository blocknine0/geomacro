import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertPrivateR2FreeLifecycle,verifyPrivateR2FreeLifecycle,
 PRIVATE_R2_MAX_CIPHERTEXT_BYTES,PRIVATE_R2_FREE_TIER}
 from "./private-osint-free-r2-guard.mjs";
const bucket="geomacro-private-osint-stage";
const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"test-restricted-read-only-token-abc123",
 GEOMACRO_PRIVATE_OSINT_R2_BUCKET:bucket};
const lifecycle=(prefix="geomacro/private-osint-held/v1/",maxAge=172800)=>({
 success:true,result:{rules:[{id:"scoped-two-day",enabled:true,
  conditions:{prefix},deleteObjectsTransition:{
   condition:{type:"Age",maxAge}}}]}
});
test("R2 private mirror requires real provider lifecycle for >= entire private prefix with <=48h expiry",()=>{
 for(const prefix of ["geomacro/private-osint-held/v1/",
  "geomacro/private-osint-held/",""]){
  assert.equal(assertPrivateR2FreeLifecycle(lifecycle(prefix)).
   lifecycle_rule_verified,true);
 }
 for(const body of [
  lifecycle("geomacro/private-osint-held/v1/2026/"),
  lifecycle("geomacro/private-osint-held/v1/",172801),
  lifecycle("geomacro/private-osint-held/v1/",0),
  {success:true,result:{rules:[]}},
  {success:false,result:{rules:lifecycle().result.rules}},
  {success:true,result:{rules:[{...lifecycle().result.rules[0],enabled:false}]}},
 ]){
  assert.throws(()=>assertPrivateR2FreeLifecycle(body),
   /PRIVATE_OSINT_R2_FREE_TIER_/u);
 }
});
test("R2 lifecycle preflight is read-only and never puts an object on unverified policy",async()=>{
 const calls=[],mock=async(url,options)=>{
  calls.push({url,method:options.method});
  assert.equal(options.method,"GET");
  assert.equal(url,"https://api.cloudflare.com/client/v4/accounts/"+
   env.CLOUDFLARE_ACCOUNT_ID+"/r2/buckets/"+bucket+"/lifecycle");
  return new Response(JSON.stringify(lifecycle()),
   {status:200,headers:{"content-type":"application/json"}});
 };
 const receipt=await verifyPrivateR2FreeLifecycle({env,fetchImpl:mock});
 assert.equal(receipt.lifecycle_rule_verified,true);
 assert.equal(receipt.other_account_usage_verified,false);
 assert.equal(receipt.no_r2_write_by_this_check,true);
 assert.deepEqual(calls.map(x=>x.method),["GET"]);
 for(const bad of [
  {...env,CLOUDFLARE_API_TOKEN:undefined},
  {...env,GEOMACRO_PRIVATE_OSINT_R2_BUCKET:"geomacro-public-news"},
 ]){
  await assert.rejects(()=>verifyPrivateR2FreeLifecycle({env:bad,fetchImpl:mock}),
   /PRIVATE_OSINT_R2_FREE_TIER_/u);
 }
 await assert.rejects(()=>verifyPrivateR2FreeLifecycle({
  env,fetchImpl:async()=>new Response(null,{status:403})}),
  /PRIVATE_OSINT_R2_FREE_TIER_PROVIDER_LIFECYCLE_NOT_ADMITTED/u);
});
test("provider included limits are explicit, with no claim of account-wide budget proof",()=>{
 assert.equal(PRIVATE_R2_FREE_TIER.storage_gb_month,10);
 assert.equal(PRIVATE_R2_FREE_TIER.class_a_month,1_000_000);
 assert.equal(PRIVATE_R2_FREE_TIER.class_b_month,10_000_000);
 assert.equal(PRIVATE_R2_MAX_CIPHERTEXT_BYTES,1_500_000);
 const mirror=readFileSync(new URL("../ops/private-osint-mirror-held-to-r2.mjs",import.meta.url),"utf8");
 assert.ok(mirror.indexOf("await verifyPrivateR2FreeLifecycle()")<
  mirror.indexOf("await mirrorEncryptedOsintToPrivateR2("));
 for(const file of ["private-global-osint-15m.yml",
  "private-osint-d1-quota-held-spool.yml"]){
  const w=readFileSync(new URL("../../.github/workflows/"+file,import.meta.url),"utf8");
  assert.match(w,/node --test scripts\/lib\/private-osint-free-r2-guard.test.mjs/u);
  assert.match(w,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets.CLOUDFLARE_API_TOKEN \}\}/u);
  assert.match(w,/retention-days: 2/u);
 }
});
