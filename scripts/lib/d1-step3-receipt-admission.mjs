/**
 * Stage 2 mandatory signed Stage 1 admission, BEFORE any production provider IO.
 * LOCAL_SIMULATION_ONLY (including Miniflare/workerd) can never authorize
 * Cloudflare D1 DDL. A valid signature is integrity, not proof of live work.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {verifyStep3StatusReceipt} from "./d1-step3-recovery-checkpoint.mjs";
import {sha256MigrationSet} from "./d1-step3-migration-ledger.mjs";

export const STEP3_SHADOW_RECEIPT_PATH =
 "artifacts/release/step3-shadow-rehearsal-receipt.json";
const SHA40=/^[a-f0-9]{40}$/u, HEX64=/^[a-f0-9]{64}$/u;
const fail=code=>{throw Error("STEP3_ADMISSION_"+code)};
const hash=value=>createHash("sha256").update(value).digest("hex");
const expectedIds=["0204","0211","0212","0213"];
const sameList=(a,b)=>Array.isArray(a)&&a.length===b.length&&
 a.every((v,i)=>v===b[i]);

export function admitSignedStep3ShadowReceipt({
 env=process.env,currentHead,manifests,
 read=readFileSync,receiptPath=STEP3_SHADOW_RECEIPT_PATH,
 now=Date.now()
}={}){
 if(!SHA40.test(currentHead??"")||
    currentHead!==env.GEOMACRO_STEP3_EXACT_SHA)
  fail("REVIEWED_HEAD_NOT_PINNED");
 if(!Array.isArray(manifests)||manifests.length!==4||
    !sameList(manifests.map(x=>x.id),expectedIds)||
    manifests.some(x=>!HEX64.test(x.sql_sha256??"")))
  fail("FOUR_SQL_MANIFESTS_INVALID");
 if(typeof env.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK!=="string"||
    env.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK.length<70)
  fail("TRUSTED_SIGNER_PUBLIC_JWK_MISSING");
 const acceptedRun=env.GEOMACRO_STEP3_ADMITTED_SHADOW_RUN_ID||
  env.GITHUB_RUN_ID;
 if(!/^[1-9][0-9]{5,20}$/u.test(acceptedRun??""))
  fail("APPROVED_SHADOW_RUN_ID_MISSING");
 let signed;
 try{
  // Fixed, non-user-selected artifact path. No production network access.
  signed=JSON.parse(read(receiptPath,"utf8"));
 }catch{fail("SIGNED_SHADOW_RECEIPT_NOT_FOUND")}
 let receipt;
 try{
  receipt=verifyStep3StatusReceipt(
   signed,env.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK);
 }catch{fail("SIGNATURE_OR_SIGNER_NOT_TRUSTED")}
 // Receipt is from this exact approved run and must be recent enough to
 // establish a live prerequisite. Signer authenticity alone is insufficient.
 const startedAt=Date.parse(receipt.started_at??"");
 const completedAt=Date.parse(receipt.completed_at??"");
 if(!Number.isFinite(startedAt)||!Number.isFinite(completedAt)||
    startedAt>completedAt||completedAt>now+120_000||
    now-completedAt>3_600_000||
    completedAt-startedAt>3_600_000)
  fail("STALE_OR_INCONSISTENT_REAL_SHADOW_RECEIPT");
 const expectedSetSha=sha256MigrationSet(manifests);
 const reported=receipt.source_migrations;
 const expectedFiles=manifests.map(x=>x.sql_sha256);
 if(receipt.schema!=="geomacro.step3.shadow-rehearsal.v1"||
    receipt.operation_kind!=="shadow"||
    receipt.status!=="PASS"||
    receipt.proof_scope!=="REAL_PROVIDER_SHADOW"||
    receipt.reviewed_source_sha!==currentHead||
    receipt.migration_sha256!==expectedSetSha||
    receipt.github_run_id!==acceptedRun||
    receipt.github_repository!=="blocknine0/geomacro"||
    receipt.github_ref!=="refs/heads/main"||
    !sameList(receipt.ordered_ids,expectedIds)||
    !Array.isArray(reported)||reported.length!==4||
    !sameList(reported.map(x=>x.id),expectedIds)||
    !sameList(reported.map(x=>x.sql_sha256),expectedFiles))
  fail("REAL_SHADOW_IDENTITY_OR_SCOPE_UNVERIFIED");
 if(receipt.production_sql_mutated!==false||
    receipt.hold_file_untouched!==true||
    receipt.real_shadow_database_identity_verified!==true||
    receipt.shadow_database_uuid_sha256!==hash(
     String(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"").toLowerCase())||
    receipt.recovery_checkpoint_verified!==true||
    receipt.migration_ledger_verified!==true||
    receipt.migrations_0204_0211_0212_0213_provider_verified!==true||
    !Array.isArray(receipt.verified)||receipt.verified.length!==4||
    !sameList(receipt.verified.map(x=>x.id),expectedIds)||
    receipt.legacy_worker_rollback_verified!==true||
    receipt.new_worker_hydration_verified!==true||
    receipt.b2_physical_parity_verified!==true||
    receipt.post_migration_readback_explicit_PASS!==true||
    receipt.post_migration_hmac?.cryptographic_readback_verified!==true||
    receipt.post_migration_hmac?.b2_physical_parity!=="PASS_REAL_B2_BYTE_READBACK")
  fail("PHYSICAL_RECOVERY_MIGRATION_WORKER_B2_PROOFS_MISSING");
 return Object.freeze({
  status:"PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION",
  github_run_id:acceptedRun,
  reviewed_source_sha:currentHead,
  migration_sha256:expectedSetSha,
  attestation_algorithm:signed.attestation.algorithm,
  trusted_signer_sha256:signed.attestation.public_key_sha256,
  receipt_sha256:hash(read(receiptPath,"utf8"))
 });
}
