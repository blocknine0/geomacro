import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {signStep3StatusReceipt} from "../lib/d1-step3-recovery-checkpoint.mjs";
import {sha256MigrationSet} from "../lib/d1-step3-migration-ledger.mjs";
import {admitSignedStep3ShadowReceipt}
 from "../lib/d1-step3-receipt-admission.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const head="a".repeat(40),shadow="11111111-2222-4333-8444-555555555555";
const manifests=["0204","0211","0212","0213"].map((id,i)=>({
 id,sql_sha256:(i+1).toString(16).repeat(64)
}));
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const secret=JSON.stringify(privateKey.export({format:"jwk"}));
const env={
 GEOMACRO_STEP3_EXACT_SHA:head,
 GEOMACRO_D1_SHADOW_DATABASE_ID:shadow,
 GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK:
  JSON.stringify(publicKey.export({format:"jwk"})),
 GITHUB_RUN_ID:"42489480676"
};
const good=()=>({
 schema:"geomacro.step3.shadow-rehearsal.v1",
 status:"PASS",proof_scope:"REAL_PROVIDER_SHADOW",operation_kind:"shadow",
 reviewed_source_sha:head,migration_sha256:sha256MigrationSet(manifests),
 github_repository:"blocknine0/geomacro",github_ref:"refs/heads/main",
 github_run_id:env.GITHUB_RUN_ID,ordered_ids:manifests.map(x=>x.id),
 source_migrations:manifests.map(x=>({...x})),
 shadow_database_uuid_sha256:sha(shadow),production_sql_mutated:false,
 hold_file_untouched:true,real_shadow_database_identity_verified:true,
 recovery_checkpoint_verified:true,migration_ledger_verified:true,
 migrations_0204_0211_0212_0213_provider_verified:true,
 verified:manifests.map(x=>({id:x.id})),
 legacy_worker_rollback_verified:true,new_worker_hydration_verified:true,
 b2_physical_parity_verified:true,post_migration_readback_explicit_PASS:true,
 post_migration_hmac:{cryptographic_readback_verified:true,
  b2_physical_parity:"PASS_REAL_B2_BYTE_READBACK"}
});
const verify=(receipt,{envOverride={},signedOverride}={})=>{
 const signed=signedOverride??signStep3StatusReceipt(receipt,secret);
 return admitSignedStep3ShadowReceipt({
  env:{...env,...envOverride},currentHead:head,manifests,
  read:()=>JSON.stringify(signed)
 });
};
test("well-formed signed live-provider receipt satisfies pure admission verifier (fixture only)",()=>{
 const r=verify(good());
 assert.equal(r.status,"PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION");
 assert.equal(r.github_run_id,env.GITHUB_RUN_ID);
});
test("local Miniflare PASS is never a production proof",()=>{
 assert.throws(()=>verify({...good(),proof_scope:"LOCAL_SIMULATION_ONLY"}),
  /STEP3_ADMISSION_REAL_SHADOW_IDENTITY_OR_SCOPE_UNVERIFIED/u);
});
test("signed NOT_YET_VERIFIED or missing physical B2 / dual worker is held",()=>{
 assert.throws(()=>verify({...good(),status:"NOT_YET_VERIFIED"}),/STEP3_ADMISSION_/u);
 assert.throws(()=>verify({...good(),b2_physical_parity_verified:false}),/STEP3_ADMISSION_/u);
 assert.throws(()=>verify({...good(),legacy_worker_rollback_verified:false}),/STEP3_ADMISSION_/u);
 assert.throws(()=>verify({...good(),new_worker_hydration_verified:false}),/STEP3_ADMISSION_/u);
});
test("signature tamper, unrelated signer and wrong migration set are held",()=>{
 const signed=signStep3StatusReceipt(good(),secret);
 signed.receipt.source_migrations[0].sql_sha256="f".repeat(64);
 assert.throws(()=>verify(good(),{signedOverride:signed}),/STEP3_ADMISSION_SIGNATURE_OR_SIGNER_NOT_TRUSTED/u);
 assert.throws(()=>verify({...good(),source_migrations:[
  {...manifests[0],sql_sha256:"f".repeat(64)},...manifests.slice(1)]}),/STEP3_ADMISSION_/u);
 const other=generateKeyPairSync("ed25519").publicKey.export({format:"jwk"});
 assert.throws(()=>verify(good(),{envOverride:{
  GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK:JSON.stringify(other)}}),/STEP3_ADMISSION_SIGNATURE_OR_SIGNER_NOT_TRUSTED/u);
});
test("unbound approved run, changed HEAD, no receipt, wrong isolation are held",()=>{
 assert.throws(()=>verify(good(),{envOverride:{GITHUB_RUN_ID:"42489480677"}}),/STEP3_ADMISSION_/u);
 assert.throws(()=>verify(good(),{envOverride:{GEOMACRO_STEP3_EXACT_SHA:"b".repeat(40)}}),
  /STEP3_ADMISSION_REVIEWED_HEAD_NOT_PINNED/u);
 assert.throws(()=>admitSignedStep3ShadowReceipt({env,currentHead:head,manifests,
  read:()=>{throw Error("ENOENT")}}),/STEP3_ADMISSION_SIGNED_SHADOW_RECEIPT_NOT_FOUND/u);
 assert.throws(()=>verify({...good(),shadow_database_uuid_sha256:sha("different")}),
  /STEP3_ADMISSION_PHYSICAL_RECOVERY_MIGRATION_WORKER_B2_PROOFS_MISSING/u);
});
