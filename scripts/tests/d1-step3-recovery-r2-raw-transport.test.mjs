import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {
 captureDurableD1Checkpoint,withVerifiedD1RecoveryBookmark
} from "../lib/d1-step3-recovery-checkpoint.mjs";

const DB="c4add153-229d-412a-b1bd-489526b7e02f";
const ACCOUNT="fddd57d28199bad07a768445e7237693";
const BUCKET="geomacro-d1-recovery-private";
const SHA="a".repeat(64);
const BOOKMARK="00000001-00000002-00004e2f-0a83ea2fceebc654de0640c422be4653";
const jwk=JSON.stringify(generateKeyPairSync("ed25519").privateKey.export({format:"jwk"}));
const env=()=>({
 CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:"t".repeat(40),
 GEOMACRO_D1_RECOVERY_R2_BUCKET:BUCKET,
 GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"YES",
 GEOMACRO_D1_RECOVERY_AES256_KEY_B64:Buffer.alloc(32,13).toString("base64"),
 SIGNING_JWK:jwk
});
const BASE="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/r2/buckets/"+BUCKET+"/objects/";
const BOOKMARK_URL="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/d1/database/"+DB+"/time_travel/bookmark";
function provider({rejectPut=false,corruptGet=false}={}){
 const stored=new Map(),calls=[];
 return {
  calls,
  fetchImpl:async(url,options)=>{
   calls.push({url,method:options.method,body:options.body,headers:options.headers});
   assert.equal(options.redirect,"error");
   if(url===BOOKMARK_URL){
    assert.equal(options.method,"GET");
    assert.equal(options.body,undefined);
    return Response.json({success:true,result:{bookmark:BOOKMARK}});
   }
   assert(url.startsWith(BASE),"unexpected or Production URL");
   assert(!url.includes("%2F"),"object key slashes must stay literal");
   if(options.method==="PUT"){
    assert.equal(options.headers["Content-Type"],"application/octet-stream");
    assert(Buffer.isBuffer(options.body),"R2 PUT must use raw Buffer");
    assert(!("get" in options.body),"multipart must never be passed");
    if(rejectPut)return new Response("no access",{status:403});
    stored.set(url,Buffer.from(options.body));
    return Response.json({success:true,result:{key:url.slice(BASE.length),size:String(options.body.length)}});
   }
   assert.equal(options.method,"GET");
   assert.equal(options.body,undefined);
   const b=stored.get(url);
   if(!b)return new Response("not found",{status:404});
   const data=corruptGet?Buffer.concat([b,Buffer.from("x")]):b;
   return new Response(data,{status:200});
  }
 };
}
test("R2 API receives raw encrypted and signed byte bodies and real GET parity verifies both",async()=>{
 const p=provider();
 const result=await captureDurableD1Checkpoint({
  env:env(),dbId:DB,migrationSha:SHA,fetchImpl:p.fetchImpl,
  now:new Date("2026-11-09T00:01:02.000Z")
 });
 assert.equal(result.status,"PASS_REAL_PROVIDER_R2_BYTE_READBACK");
 assert.equal(result.private_r2_encrypted_readback_verified,true);
 assert.equal(result.signed_manifest_readback_verified,true);
 assert.equal(result.real_provider_bookmark_observed,true);
 assert.equal(result.plaintext_bookmark_leaked_to_artifact,false);
 assert.equal(result.encrypted_payload_leaked_to_artifact,false);
 assert.equal(p.calls.length,5);
 assert.deepEqual(p.calls.map(x=>x.method),["GET","PUT","GET","PUT","GET"]);
 assert(p.calls.filter(x=>x.method==="PUT").every(x=>Buffer.isBuffer(x.body)));
 assert(p.calls.every(x=>!x.url.includes(DB.replaceAll("-",""))||x.url===BOOKMARK_URL));
 assert(!JSON.stringify(result).includes(BOOKMARK));
 assert(!JSON.stringify(result).includes(env().SIGNING_JWK));
 let observedBookmark="";
 const restored=await withVerifiedD1RecoveryBookmark({
  env:env(),objectKey:result.object_key,expectedDbId:DB,
  expectedMigrationSha:SHA,fetchImpl:p.fetchImpl,
  onBookmark:async value=>{observedBookmark=value;return "VERIFIED_ONLY"}
 });
 assert.equal(restored.status,"PASS_SIGNED_ENCRYPTED_RECOVERY_READBACK");
 assert.equal(restored.result,"VERIFIED_ONLY");
 assert.equal(observedBookmark,BOOKMARK);
});
test("R2 permission failure reports only fixed encrypted PUT stage and never authorizes DDL",async()=>{
 const p=provider({rejectPut:true});
 await assert.rejects(
  captureDurableD1Checkpoint({env:env(),dbId:DB,migrationSha:SHA,fetchImpl:p.fetchImpl}),
  e=>e.message==="STEP3_RECOVERY_CLOUDFLARE_ENCRYPTED_OBJECT_PUT_HTTP_OR_NETWORK_UNVERIFIED"
 );
 assert(p.calls.length===2);
 assert(!String(p.calls[1].body).includes(BOOKMARK));
});
test("malformed recovery key and private signing key fail before provider I/O",async()=>{
 for(const patch of [
  {GEOMACRO_D1_RECOVERY_AES256_KEY_B64:"bad"},
  {SIGNING_JWK:"INVALID"},
  {GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"NO"}
 ]){
  let called=0;
  await assert.rejects(captureDurableD1Checkpoint({
   env:{...env(),...patch},dbId:DB,migrationSha:SHA,
   fetchImpl:async()=>{called++;throw Error("unwanted")}
  }),/STEP3_RECOVERY_/);
  assert.equal(called,0);
 }
});
test("corrupted encrypted bytes are rejected, no plaintext bookmark or secret leaked",async()=>{
 const p=provider({corruptGet:true});
 await assert.rejects(
  captureDurableD1Checkpoint({env:env(),dbId:DB,migrationSha:SHA,fetchImpl:p.fetchImpl}),
  e=>e.message==="STEP3_RECOVERY_ENCRYPTED_R2_READBACK_MISMATCH"
 );
 assert.equal(p.calls.length,3);
});
