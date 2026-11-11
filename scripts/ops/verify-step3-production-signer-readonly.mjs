#!/usr/bin/env node
/**
 * Independent cryptographic audit of an already completed Stage2 receipt.
 * Historical verification only: no live freshness claim, provider call,
 * payment, migration, version deployment, or HOLD modification.
 */
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyStep3StatusReceipt} from '../lib/d1-step3-recovery-checkpoint.mjs';
const SHA=/^[a-f0-9]{40}$/u;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const fail=x=>{throw Error('STEP3_SIGNATURE_AUDIT_'+x)};
const digest=s=>createHash('sha256').update(s).digest('hex');
const IDS=['0204','0211','0212','0213'];
export function auditStage2Signature({signed,publicJwk,runId,runSha,dbId}={}){
 if(!/^[1-9][0-9]{5,20}$/u.test(String(runId??''))||
    !SHA.test(runSha??'')||!UUID.test(dbId??'')||
    typeof publicJwk!=='string'||publicJwk.length<70)
  fail('PINNED_RUN_OR_TRUSTED_KEY_MISSING');
 let r;
 try{r=verifyStep3StatusReceipt(signed,publicJwk)}
 catch{fail('ED25519_SIGNATURE_OR_SIGNER_INVALID')}
 const refs=r?.production_reference_table;
 const referenceOk=refs?.mode==='EMPTY_OPT_IN_TABLE_SCHEMA_VERIFIED'&&
  refs.real_production_pointer_hmac_verified===false&&
  refs.zero_pointer_table_vacuous_proof===true||
  refs?.mode==='EXISTING_PRODUCTION_POINTERS_CRYPTOGRAPHICALLY_VERIFIED'&&
  refs.real_production_pointer_hmac_verified===true;
 if(r.status!=='PASS'||r.code!=='STEP3_PRODUCTION_FOUR_MIGRATIONS_B2_READBACK_PASS'||
    r.operation_kind!=='production'||r.proof_scope!=='REAL_PROVIDER_PRODUCTION'||
    r.github_run_id!==String(runId)||
    r.github_repository!=='blocknine0/geomacro'||
    r.github_ref!=='refs/heads/main'||
    r.reviewed_source_sha!==runSha||
    r.production_database_uuid_sha256!==digest(dbId.toLowerCase())||
    r.stage1_admission?.status!=='PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION'||
    r.recovery_checkpoint_verified!==true||
    r.migration_ledger_verified!==true||
    r.post_migration_readback_explicit_PASS!==true||
    r.production_b2_archive_proof?.status!=='PASS_REAL_B2_BYTE_READBACK'||
    r.production_b2_archive_proof?.independent_b2_full_get_verified!==true||
    r.verified?.map(x=>x.id).join(',')!==IDS.join(',')||
    r.verified.some(x=>x.ledger_status!=='VERIFIED'||x.migration_history_and_schema_valid!==true)||
    r.hold_file_untouched!==true||
    r.production_release_authorized!==false||
    !referenceOk)
  fail('SIGNED_RECEIPT_PHYSICAL_CLAIMS_OR_IDENTITY_INVALID');
 return Object.freeze({
  schema:'geomacro.step3.production-independent-signature.v1',
  status:'PASS_TRUSTED_ED25519_SIGNATURE_HISTORICAL_ONLY',
  source_sha:runSha,stage2_run_id:String(runId),
  trusted_signer_sha256:signed.attestation.public_key_sha256,
  signed_receipt_sha256:digest(JSON.stringify(signed)),
  migration_count:4,encrypted_r2_checkpoint_claim_verified:true,
  genuine_b2_archive_claim_verified:true,
  original_provider_readback_was_signed:true,
  historical_proof_only:true,current_provider_state_not_rechecked:true,
  current_canary_admission_not_granted:true,
  traffic_promoted:false,release_hold_removed:false,payments:0
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const signed=JSON.parse(readFileSync(
   'artifacts/release/step3-production-physical-pass.json','utf8'));
  const result=auditStage2Signature({
   signed,publicJwk:process.env.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK,
   runId:process.env.STEP3_PROOF_RUN_ID,
   runSha:process.env.STEP3_PROOF_SOURCE_SHA,
   dbId:process.env.D1_DATABASE_ID
  });
  mkdirSync('artifacts/release',{recursive:true,mode:0o700});
  writeFileSync('artifacts/release/step3-production-independent-signature.json',
   JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
 }catch(e){
  console.error(JSON.stringify({status:'HOLD',
   code:/^STEP3_SIGNATURE_AUDIT_[A-Z0-9_]+$/.test(e?.message??'')?
    e.message:'STEP3_SIGNATURE_AUDIT_UNVERIFIED',traffic_promoted:false,payments:0}));
  process.exitCode=2;
 }
}
