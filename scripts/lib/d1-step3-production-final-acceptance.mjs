/**
 * Production Step3 final acceptance, separating DDL/empty ref schema from
 * actual provider HMAC objects. Never manufacture a production pointer
 * cryptographic proof for a deliberately empty opt-in table.
 */
const IDS=["0204","0211","0212","0213"];
const fail=x=>{throw Error("STEP3_PRODUCTION_FINAL_"+x)};
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&
 a.every((v,i)=>v===b[i]);

export function assessStep3ProductionFinal({
 state,pointerProof,b2Proof
}={}){
 if(!state||!pointerProof||!b2Proof)fail("MISSING_INDEPENDENT_PROOFS");
 const empty=pointerProof.real_provider_pointer_count===0&&
  pointerProof.reason==="NO_REAL_R2_POINTER_ROWS"&&
  pointerProof.cryptographic_readback_verified===false&&
  pointerProof.status==="NOT_YET_VERIFIED";
 const realPointers=pointerProof.cryptographic_readback_verified===true&&
  pointerProof.all_hmac_and_r2_bytes_verified===true&&
  Number.isSafeInteger(pointerProof.verified_count)&&
  pointerProof.verified_count>=1&&pointerProof.verified_count<=10;
 const reference_table={
  mode:empty?"EMPTY_OPT_IN_TABLE_SCHEMA_VERIFIED":
   realPointers?"EXISTING_PRODUCTION_POINTERS_CRYPTOGRAPHICALLY_VERIFIED":
   "POINTER_ACCEPTANCE_NOT_VERIFIED",
  real_production_pointer_hmac_verified:realPointers,
  zero_pointer_table_vacuous_proof:empty,
  stage1_shadow_hmac_attestation_required:true
 };
 const fresh=state.final_schema_readback;
 const schemaReadback=fresh?.status===
  "PASS_REAL_PRODUCTION_FOUR_MIGRATIONS_DIRECT_SCHEMA_READBACK"&&
  same(fresh.migration_ids,IDS)&&
  fresh.native_history_directly_observed===true&&
  fresh.ledger_four_checksums_and_verified_statuses===true&&
  fresh.production_schema_and_columns_directly_observed===true&&
  fresh.readback_queries===10&&
  same(fresh.tables?.map(x=>x.table),[
   "materialized_cache","p0b_committed_day_totals",
   "phase2h_pending_hourly_v1","phase2h_raw_object_refs_v1"
  ])&&
  fresh.tables.every(x=>Number.isSafeInteger(x.columns_verified)&&
   x.columns_verified>0);
 const certified=state.stage1_admission?.status===
  "PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION"&&
  state.recovery_checkpoint_verified===true&&
  state.migration_ledger_verified===true&&
  schemaReadback===true&&
  same(state.verified?.map(x=>x.id),IDS)&&
  state.verified.every(x=>x.migration_history_and_schema_valid===true&&
   x.ledger_status==="VERIFIED")&&
  b2Proof.status==="PASS_REAL_B2_BYTE_READBACK"&&
  b2Proof.b2_bytes_sha256_verified===true&&
  b2Proof.b2_original_identity_verified===true&&
  b2Proof.independent_b2_full_get_verified===true&&
  (empty||realPointers);
 return Object.freeze({
  status:certified?"PASS":"NOT_YET_VERIFIED",
  code:certified?"STEP3_PRODUCTION_FOUR_MIGRATIONS_B2_READBACK_PASS":
   "STEP3_PRODUCTION_FINAL_INDEPENDENT_PROOF_MISSING",
  post_migration_readback_explicit_PASS:certified,
  production_reference_table:Object.freeze(reference_table)
 });
}
