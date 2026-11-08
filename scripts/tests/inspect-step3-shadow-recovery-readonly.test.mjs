import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {inspectExactShadowRecovery}
 from "../ops/inspect-step3-shadow-recovery-readonly.mjs";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const BUCKET="geomacro-d1-recovery-private";
const KEY=Buffer.alloc(32,11).toString("base64");
const SIGNER=JSON.stringify(generateKeyPairSync("ed25519").privateKey.export({format:"jwk"}));
const env=()=>({
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"a".repeat(40),CLOUDFLARE_ACCOUNT_ID:ACCOUNT,
 D1_DATABASE_ID:"db057ca9-9f6e-4957-ac28-144f3b798f9b",
 GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_D1_RECOVERY_R2_BUCKET:BUCKET,
 GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"YES",
 CLOUDFLARE_API_TOKEN:"t".repeat(40),
 GEOMACRO_D1_RECOVERY_AES256_KEY_B64:KEY,SIGNING_JWK:SIGNER
});
function fakeProvider({error=null}={}){
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,opts});
  assert.equal(opts.method,"GET");
  assert.equal(opts.body,undefined);
  assert.equal(opts.redirect,"error");
  if(url.includes("/time_travel/bookmark")){
   if(error==="BOOKMARK")return Response.json({success:false},{status:403});
   return Response.json({success:true,result:{bookmark:"00000001-00000002-00004e2f-0a83ea2fceebc654de0640c422be4653"}});
  }
  assert(url.endsWith("/r2/buckets/"+BUCKET));
  if(error==="R2")return Response.json({success:false},{status:403});
  return Response.json({success:true,result:{name:BUCKET}});
 };
 return {calls,fetchImpl};
}
test("pinned read-only credentials, bookmark and R2 metadata preflight uses exactly two GETs",async()=>{
 const p=fakeProvider();
 const r=await inspectExactShadowRecovery({env:env(),fetchImpl:p.fetchImpl});
 assert.equal(r.status,"READONLY_RECOVERY_PREREQUISITES_VERIFIED_NOT_CHECKPOINT");
 assert.equal(r.bookmark_available,true);
 assert.equal(r.private_recovery_bucket_metadata_verified,true);
 assert.equal(r.signer_identity_verified,true);
 assert.equal(r.encrypted_checkpoint_verified,false);
 assert.equal(r.r2_object_writes,0);
 assert.equal(r.r2_object_reads,0);
 assert.equal(r.production_d1_queries,0);
 assert.equal(p.calls.length,2);
 assert(!JSON.stringify(r).includes(KEY));
 assert(!JSON.stringify(r).includes(SIGNER));
 assert(!JSON.stringify(r).includes("00004e2f"));
});
test("wrong production UUID, branch or account rejects all provider calls",async()=>{
 for(const patch of [
  {GITHUB_REF:"refs/heads/feature"},
  {D1_DATABASE_ID:SHADOW},
  {GEOMACRO_D1_SHADOW_DATABASE_ID:env().D1_DATABASE_ID},
  {CLOUDFLARE_ACCOUNT_ID:"f".repeat(32)}
 ]){
  const p=fakeProvider();
  const r=await inspectExactShadowRecovery({env:{...env(),...patch},fetchImpl:p.fetchImpl});
  assert.equal(r.status,"HOLD");
  assert.equal(p.calls.length,0);
 }
});
test("bad AES or signer is reported safely before network access",async()=>{
 for(const patch of [
  {GEOMACRO_D1_RECOVERY_AES256_KEY_B64:"missing"},
  {SIGNING_JWK:"invalid"},
  {GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"NO"}
 ]){
  const p=fakeProvider();
  const r=await inspectExactShadowRecovery({env:{...env(),...patch},fetchImpl:p.fetchImpl});
  assert.equal(r.status,"HOLD");
  assert.match(r.code,/^STEP3_RECOVERY_[A-Z0-9_]+$/u);
  assert.equal(p.calls.length,0);
  assert.equal(r.encrypted_checkpoint_verified,false);
 }
});
test("bookmark GET and R2 metadata failures have distinct secret-safe HOLD codes",async()=>{
 for(const error of ["BOOKMARK","R2"]){
  const p=fakeProvider({error});
  const r=await inspectExactShadowRecovery({env:env(),fetchImpl:p.fetchImpl});
  assert.equal(r.status,"HOLD");
  assert.equal(r.code,error==="BOOKMARK"?
   "STEP3_RECOVERY_CLOUDFLARE_BOOKMARK_GET_HTTP_OR_NETWORK_UNVERIFIED":
   "STEP3_RECOVERY_CLOUDFLARE_R2_BUCKET_METADATA_GET_HTTP_OR_NETWORK_UNVERIFIED");
  assert.equal(r.r2_object_reads,0);
  assert.equal(r.r2_object_writes,0);
  assert.equal(p.calls.length,error==="BOOKMARK"?1:2);
 }
});
