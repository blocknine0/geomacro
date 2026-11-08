import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,randomBytes} from "node:crypto";
import {
 captureDurableD1Checkpoint,buildRecoveryObjectKey,
 verifyRecoveryManifest,withVerifiedD1RecoveryBookmark,
 signStep3StatusReceipt,verifyStep3StatusReceipt
} from "../lib/d1-step3-recovery-checkpoint.mjs";
import {
 assertRealPointerMac,pointerEnvelope,inspectPointerProofCount,
 verifyRealPhase2hPointerRows
} from "../lib/d1-step3-crypto-proof.mjs";
import {
 createStep3LedgerSQL,verifyStep3LedgerRows,step3LedgerStartSQL,
 step3LedgerStatusSQL,sha256MigrationSet,decideResume
} from "../lib/d1-step3-migration-ledger.mjs";

const uuid="11111111-2222-4333-8444-555555555555";
const sha="a".repeat(64);
const at=new Date("2026-11-08T10:00:00.000Z");
const signKey=generateKeyPairSync("ed25519").privateKey.export({format:"jwk"});
const env={
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"test-nonproduction-token-placeholder-long",
 GEOMACRO_D1_RECOVERY_R2_BUCKET:"isolated-shadow-recovery-tests",
 GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"YES",
 GEOMACRO_D1_RECOVERY_AES256_KEY_B64:randomBytes(32).toString("base64"),
 SIGNING_JWK:JSON.stringify(signKey),
};
function provider({corrupt=false,bookmark="opaque-proven-bookmark-value"}={}){
 const objects=new Map(),calls=[];
 const fetchImpl=async (url,req)=>{
  calls.push({method:req.method,url});
  if(url.includes("/time_travel/bookmark"))
   return new Response(JSON.stringify({success:true,result:{bookmark}}),{status:200});
  if(req.method==="PUT"){
   // Cloudflare R2 Objects REST API uploads exact raw binary bytes.
   assert(Buffer.isBuffer(req.body),"R2 PUT must contain a raw Buffer");
   assert.equal(req.headers["Content-Type"],"application/octet-stream");
   objects.set(url,Buffer.from(req.body));
   return new Response(null,{status:200});
  }
  if(req.method==="GET"&&objects.has(url)){
   let data=objects.get(url);
   if(corrupt&&url.endsWith(".enc"))data=Buffer.concat([data,Buffer.from("corrupt")]);
   return new Response(data,{status:200});
  }
  return new Response("not found",{status:404});
 };
 return {fetchImpl,calls,objects};
}
test("offline simulation: real checkpoint implementation encrypts, signs and readbacks; no plaintext files",async()=>{
 const p=provider();
 const r=await captureDurableD1Checkpoint({
  env,dbId:uuid,migrationSha:sha,now:at,fetchImpl:p.fetchImpl});
 assert.equal(r.status,"PASS_REAL_PROVIDER_R2_BYTE_READBACK");
 assert.equal(r.private_r2_encrypted_readback_verified,true);
 assert.equal(r.signed_manifest_readback_verified,true);
 assert(p.calls.some(x=>x.method==="PUT"&&x.url.endsWith(".enc")));
 assert(p.calls.some(x=>x.method==="GET"&&x.url.endsWith(".enc")));
 const objects=[...p.objects.values()].map(x=>x.toString("utf8"));
 assert(objects.every(x=>!x.includes("opaque-proven-bookmark-value")));
 assert(!JSON.stringify(r).includes("opaque-proven-bookmark-value"));
 assert(r.object_key.startsWith("backups/d1/manifests/"+uuid));
});
test("offline negative: no R2 full byte readback = no checkpoint",async()=>{
 await assert.rejects(captureDurableD1Checkpoint({
  env,dbId:uuid,migrationSha:sha,now:at,
  fetchImpl:provider({corrupt:true}).fetchImpl
 }),/STEP3_RECOVERY_ENCRYPTED_R2_READBACK_MISMATCH/u);
});
test("offline negative: missing real encryption key and provider bookmark are blocked",async()=>{
 await assert.rejects(captureDurableD1Checkpoint({
  env:{...env,GEOMACRO_D1_RECOVERY_AES256_KEY_B64:""},
  dbId:uuid,migrationSha:sha,now:at,fetchImpl:provider().fetchImpl
 }),/STEP3_RECOVERY_AES_KEY/u);
 await assert.rejects(captureDurableD1Checkpoint({
  env,dbId:uuid,migrationSha:sha,now:at,fetchImpl:provider({bookmark:"x"}).fetchImpl
 }),/STEP3_RECOVERY_REAL_D1_BOOKMARK_UNVERIFIED/u);
});
test("offline safety: empty pointer table always NOT_YET_VERIFIED",()=>{
 assert.equal(inspectPointerProofCount([]).status,"NOT_YET_VERIFIED");
 assert.throws(()=>inspectPointerProofCount(new Array(11)),/STEP3_POINTER_/u);
});
test("offline: real SHA256 pointer envelope rejects tamper with an independent signer",()=>{
 const row={
  record_id:"a".repeat(64),category:"macro",
  original_published_at:"2026-11-08T10:00:00.000Z",
  first_ingested_at:"2026-11-08T10:00:00.000Z",
  raw_sha256:"b".repeat(64),object_sha256:"c".repeat(64),
  object_key:"geomacro/private/phase2h/ref-only/v1/"+"c".repeat(64)+".json",
  bundle_bytes:400,record_sha256:"d".repeat(64),record_bytes:350,
  bundle_index:0,signed_at:"2026-11-08T10:00:00.000Z",
  pointer_hmac_sha256:"0".repeat(64),risk_country_iso3:"USA",
  storage_backend:"private_r2"
 };
 const key="f".repeat(64);
 const {createHmac}=requireTestCrypto();
 row.pointer_hmac_sha256=createHmac("sha256",Buffer.from(key,"hex"))
  .update(pointerEnvelope(row)).digest("hex");
 assert.equal(assertRealPointerMac(row,key),true);
 assert.throws(()=>assertRealPointerMac({...row,record_bytes:351},key),
  /STEP3_POINTER_HMAC_SHA256_REJECTED/u);
});
function requireTestCrypto(){
 // No runtime require() in the actual ESM production libraries.
 return {createHmac:(...args)=>createHmacImported(...args)};
}
import {createHmac as createHmacImported} from "node:crypto";
test("offline: ledger SQL is append/reconcile only and rejects ambiguous partial writes",()=>{
 assert.match(createStep3LedgerSQL(),/CREATE TABLE IF NOT EXISTS _geomacro_migration_ledger/u);
 assert.doesNotMatch(createStep3LedgerSQL(),/DROP TABLE|DELETE FROM/u);
 const manifests=["0204","0211","0212","0213"].map((id,i)=>({
  id,sql_sha256:(i+1).toString(16).repeat(64)
 }));
 assert.match(sha256MigrationSet(manifests),/^[a-f0-9]{64}$/u);
 const m=manifests[0];
 const created=step3LedgerStartSQL(m,"2026-11-08T10:00:00.000Z");
 assert.match(created,/ON CONFLICT\(migration_id\) DO NOTHING/u);
 assert.match(step3LedgerStatusSQL(m,"VERIFIED","2026-11-08T10:01:00.000Z",300),
  /duration_ms=300/u);
 const running={migration_id:m.id,sql_sha256:m.sql_sha256,
  status:"STARTED",started_at:"2026-11-08T10:00:00.000Z",
  finished_at:null,duration_ms:null};
 assert.equal(verifyStep3LedgerRows([running],manifests).size,1);
 assert.equal(decideResume({entry:running,manifest:m,nativePending:true,
  objectsVerified:false}),"HOLD_AMBIGUOUS_PARTIAL_MIGRATION");
 assert.equal(decideResume({entry:running,manifest:m,nativePending:false,
  objectsVerified:true}),"RECONCILE_COMPLETED");
 assert.equal(decideResume({entry:null,manifest:m,nativePending:true,
  objectsVerified:false}),"APPLY_REVIEWED_SQL");
});

test("offline: cold restore reads signed ciphertext without writing or logging plaintext bookmark",async()=>{
 const p=provider();
 const checkpoint=await captureDurableD1Checkpoint({
  env,dbId:uuid,migrationSha:sha,now:at,fetchImpl:p.fetchImpl});
 let callbackCount=0;
 const receipt=await withVerifiedD1RecoveryBookmark({
  env,expectedDbId:uuid,expectedMigrationSha:sha,
  objectKey:checkpoint.object_key,fetchImpl:p.fetchImpl,
  onBookmark:async bookmark=>{
   callbackCount++;
   assert.equal(bookmark,"opaque-proven-bookmark-value");
   return "REVIEWED_RESTORE_ONLY_NOT_EXECUTED";
  }
 });
 assert.equal(callbackCount,1);
 assert.equal(receipt.status,"PASS_SIGNED_ENCRYPTED_RECOVERY_READBACK");
 assert.equal(receipt.result,"REVIEWED_RESTORE_ONLY_NOT_EXECUTED");
 assert(!JSON.stringify(receipt).includes("opaque-proven-bookmark-value"));
});
test("offline: signed truthful shadow status rejects tamper, never invents provider PASS",()=>{
 const secret=JSON.stringify(signKey);
 const pub=generateFromTestSignKey(signKey);
 const receipt={status:"NOT_YET_VERIFIED",
  cloudflare_shadow_worker_rollback_verified:false};
 const signed=signStep3StatusReceipt(receipt,secret);
 assert.deepEqual(verifyStep3StatusReceipt(signed,pub),receipt);
 signed.receipt.cloudflare_shadow_worker_rollback_verified=true;
 assert.throws(()=>verifyStep3StatusReceipt(signed,pub),
  /STEP3_RECOVERY_STATUS_SIGNATURE_INVALID/u);
});
import {createPrivateKey as testPrivateKey,createPublicKey as testPublicKey}
 from "node:crypto";
function generateFromTestSignKey(jwk){
 return JSON.stringify(testPublicKey(testPrivateKey({key:jwk,format:"jwk"}))
  .export({format:"jwk"}));
}
