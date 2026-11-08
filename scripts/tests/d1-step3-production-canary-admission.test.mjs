import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {signStep3StatusReceipt} from "../lib/d1-step3-recovery-checkpoint.mjs";
import {step3SqlManifests} from "../lib/d1-step3-migration-contract.mjs";
import {sha256MigrationSet} from "../lib/d1-step3-migration-ledger.mjs";
import {admitSignedStep3ProductionForCanary}
 from "../lib/d1-step3-production-canary-admission.mjs";
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const privateJwk=JSON.stringify(privateKey.export({format:"jwk"}));
const publicJwk=JSON.stringify(publicKey.export({format:"jwk"}));
const head="c".repeat(40),runId="42498631644";
const database="11111111-2222-4333-8444-555555555555";
const manifests=step3SqlManifests();
const sha=s=>createHash("sha256").update(s).digest("hex");
const valid=()=>({
 schema:"geomacro.step3.migrations-execution.v1",
 operation_kind:"production",proof_scope:"REAL_PROVIDER_PRODUCTION",
 status:"PASS",started_at:new Date(Date.now()-70_000).toISOString(),
 completed_at:new Date().toISOString(),
 reviewed_source_sha:head,
 github_repository:"blocknine0/geomacro",github_ref:"refs/heads/main",
 github_run_id:runId,
 production_database_uuid_sha256:sha(database),
 migration_sha256:sha256MigrationSet(manifests),
 ordered_ids:["0204","0211","0212","0213"],
 source_migrations:manifests.map(m=>({id:m.id,sql_sha256:m.sql_sha256})),
 verified:manifests.map(m=>({id:m.id,migration_history_and_schema_valid:true,
  ledger_status:"VERIFIED"})),
 stage1_admission:{status:"PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION"},
 recovery_checkpoint_verified:true,migration_ledger_verified:true,
 shadow_test_proven:true,post_migration_readback_explicit_PASS:true,
 production_b2_archive_proof:{
  status:"PASS_REAL_B2_BYTE_READBACK",independent_b2_full_get_verified:true
 },
 production_reference_table:{stage1_shadow_hmac_attestation_required:true,
  mode:"EMPTY_OPT_IN_TABLE_SCHEMA_VERIFIED",
  zero_pointer_table_vacuous_proof:true,
  real_production_pointer_hmac_verified:false},
 hold_file_untouched:true,production_release_authorized:false
});
const options=receipt=>({
 signed:signStep3StatusReceipt(receipt,privateJwk),
 publicJwk,headSha:head,runId,productionDatabaseUuid:database,
 manifests
});
test("a real physical exact-main signed 4-migration Stage2 is accepted as canary preflight ONLY",()=>{
 const p=admitSignedStep3ProductionForCanary(options(valid()));
 assert.equal(p.status,"PASS_REAL_PROVIDER_PRODUCTION");
 assert.equal(p.canary_traffic_altered,false);
 assert.equal(p.release_hold_removed,false);
 assert.equal(p.no_funds,true);
});
test("local PASS, stale, wrong run, wrong DB, missing archive, incomplete ledger all HOLD",()=>{
 const mutations=[
  p=>{p.proof_scope="LOCAL_SIMULATION_ONLY"},
  p=>{p.completed_at=new Date(Date.now()-2*3_600_000).toISOString()},
  p=>{p.github_run_id="42498631645"},
  p=>{p.production_database_uuid_sha256=sha("wrong")},
  p=>{p.production_b2_archive_proof.independent_b2_full_get_verified=false},
  p=>{p.verified.pop()},
  p=>{p.stage1_admission.status="LOCAL_SIMULATION_ONLY"},
  p=>{p.hold_file_untouched=false},
  p=>{p.production_release_authorized=true}
 ];
 for(const update of mutations){
  const original=valid();update(original);
  assert.throws(()=>admitSignedStep3ProductionForCanary(options(original)),
   /STEP3_CANARY_(FOUR_MIGRATIONS_OR_PHYSICAL_PROOFS_MISSING|STALE_OR_NONMONOTONIC_PHYSICAL_PROOF)/u);
 }
});
test("tampered or forged signer never passes canary admission",()=>{
 const signed=signStep3StatusReceipt(valid(),privateJwk);
 signed.receipt.status="NOT_YET_VERIFIED";
 assert.throws(()=>admitSignedStep3ProductionForCanary({
  ...options(valid()),signed}),/STEP3_CANARY_SIGNATURE_OR_TRUSTED_SIGNER_UNVERIFIED/u);
 const other=generateKeyPairSync("ed25519");
 assert.throws(()=>admitSignedStep3ProductionForCanary({
  ...options(valid()),publicJwk:JSON.stringify(other.publicKey.export({format:"jwk"}))
 }),/STEP3_CANARY_SIGNATURE_OR_TRUSTED_SIGNER_UNVERIFIED/u);
});
