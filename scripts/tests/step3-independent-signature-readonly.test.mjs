import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {signStep3StatusReceipt} from '../lib/d1-step3-recovery-checkpoint.mjs';
import {auditStage2Signature} from '../ops/verify-step3-production-signer-readonly.mjs';
const sha='a'.repeat(40),runId='42959866871';
const dbId='db057ca9-9f6e-4957-ac28-144f3b798f9b';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const priv=JSON.stringify(privateKey.export({format:'jwk'}));
const pub=JSON.stringify(publicKey.export({format:'jwk'}));
const {createHash}=await import('node:crypto');
const digest=x=>createHash('sha256').update(x).digest('hex');
const receipt=()=>({
 schema:'geomacro.step3.migrations-execution.v1',
 operation_kind:'production',proof_scope:'REAL_PROVIDER_PRODUCTION',
 status:'PASS',code:'STEP3_PRODUCTION_FOUR_MIGRATIONS_B2_READBACK_PASS',
 reviewed_source_sha:sha,github_run_id:runId,
 github_repository:'blocknine0/geomacro',github_ref:'refs/heads/main',
 production_database_uuid_sha256:digest(dbId),
 stage1_admission:{status:'PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION'},
 recovery_checkpoint_verified:true,migration_ledger_verified:true,
 post_migration_readback_explicit_PASS:true,
 production_b2_archive_proof:{status:'PASS_REAL_B2_BYTE_READBACK',
   independent_b2_full_get_verified:true},
 verified:['0204','0211','0212','0213'].map(id=>({
  id,ledger_status:'VERIFIED',migration_history_and_schema_valid:true
 })),
 production_reference_table:{mode:'EMPTY_OPT_IN_TABLE_SCHEMA_VERIFIED',
  real_production_pointer_hmac_verified:false,zero_pointer_table_vacuous_proof:true},
 hold_file_untouched:true,production_release_authorized:false
});
const audit=(s,overrides={})=>auditStage2Signature({
 signed:s,publicJwk:pub,runId,runSha:sha,dbId,...overrides
});
test('independently verifies authentic production Ed25519 signature without authorizing canary',()=>{
 const signed=signStep3StatusReceipt(receipt(),priv);
 const out=audit(signed);
 assert.equal(out.status,'PASS_TRUSTED_ED25519_SIGNATURE_HISTORICAL_ONLY');
 assert.equal(out.current_canary_admission_not_granted,true);
 assert.equal(out.release_hold_removed,false);
 assert.equal(out.traffic_promoted,false);
 assert.equal(out.payments,0);
});
test('tampered receipt, wrong trusted signer, wrong run or wrong db all HOLD',()=>{
 const signed=signStep3StatusReceipt(receipt(),priv);
 const tampered=structuredClone(signed);tampered.receipt.status='NOT_YET_VERIFIED';
 assert.throws(()=>audit(tampered),/ED25519_SIGNATURE_OR_SIGNER_INVALID/);
 const other=generateKeyPairSync('ed25519');
 assert.throws(()=>audit(signed,{publicJwk:JSON.stringify(other.publicKey.export({format:'jwk'}))}),
  /ED25519_SIGNATURE_OR_SIGNER_INVALID/);
 assert.throws(()=>audit(signed,{runId:'42959866872'}),
  /SIGNED_RECEIPT_PHYSICAL_CLAIMS_OR_IDENTITY_INVALID/);
 assert.throws(()=>audit(signed,{dbId:'f0000000-0000-4000-8000-000000000000'}),
  /SIGNED_RECEIPT_PHYSICAL_CLAIMS_OR_IDENTITY_INVALID/);
});
test('a validly signed zero-provider or falsified B2 receipt cannot pass',()=>{
 const r=receipt();r.production_b2_archive_proof.status='NOT_YET_VERIFIED';
 assert.throws(()=>audit(signStep3StatusReceipt(r,priv)),
  /SIGNED_RECEIPT_PHYSICAL_CLAIMS_OR_IDENTITY_INVALID/);
});
