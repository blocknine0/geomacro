import {test} from "node:test";
import assert from "node:assert/strict";
import {assessStep3ProductionFinal}
 from "../lib/d1-step3-production-final-acceptance.mjs";

const verified=["0204","0211","0212","0213"].map(id=>({
 id,migration_history_and_schema_valid:true,ledger_status:"VERIFIED"
}));
const validState=()=>({
 stage1_admission:{status:"PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION"},
 recovery_checkpoint_verified:true,migration_ledger_verified:true,
 verified:verified.map(x=>({...x})),production_sql_mutated:false
});
const physicalB2=()=>({
 status:"PASS_REAL_B2_BYTE_READBACK",
 b2_bytes_sha256_verified:true,b2_original_identity_verified:true,
 independent_b2_full_get_verified:true
});
const emptyPointer=()=>({
 status:"NOT_YET_VERIFIED",reason:"NO_REAL_R2_POINTER_ROWS",
 real_provider_pointer_count:0,cryptographic_readback_verified:false
});
const realPointer=()=>({
 status:"PASS_REAL_WORKER_HMAC_R2_POINTER_BYTES_ONLY",
 cryptographic_readback_verified:true,all_hmac_and_r2_bytes_verified:true,
 verified_count:1
});
test("verified four migrations + actual production B2 GET + empty opt-in table is truthful PASS",()=>{
 const out=assessStep3ProductionFinal({
  state:validState(),pointerProof:emptyPointer(),b2Proof:physicalB2()
 });
 assert.equal(out.status,"PASS");
 assert.equal(out.post_migration_readback_explicit_PASS,true);
 assert.equal(out.production_reference_table.mode,"EMPTY_OPT_IN_TABLE_SCHEMA_VERIFIED");
 assert.equal(out.production_reference_table.real_production_pointer_hmac_verified,false);
 assert.equal(out.production_reference_table.zero_pointer_table_vacuous_proof,true);
});
test("verified provider pointer readback allows existing production references",()=>{
 const out=assessStep3ProductionFinal({
  state:validState(),pointerProof:realPointer(),b2Proof:physicalB2()
 });
 assert.equal(out.status,"PASS");
 assert.equal(out.production_reference_table.real_production_pointer_hmac_verified,true);
});
test("synthetic HMAC, missing B2 bytes or an unrelated signed status never authorize",()=>{
 const cases=[
  {state:validState(),pointerProof:{status:"PASS",real_provider_pointer_count:0,
   reason:"NO_REAL_R2_POINTER_ROWS",cryptographic_readback_verified:true},b2Proof:physicalB2()},
  {state:validState(),pointerProof:emptyPointer(),b2Proof:{...physicalB2(),
   independent_b2_full_get_verified:false}},
  {state:{...validState(),stage1_admission:{status:"LOCAL_SIMULATION_ONLY"}},
   pointerProof:realPointer(),b2Proof:physicalB2()},
  {state:{...validState(),verified:verified.slice(0,3)},pointerProof:realPointer(),
   b2Proof:physicalB2()},
  {state:{...validState(),recovery_checkpoint_verified:false},
   pointerProof:emptyPointer(),b2Proof:physicalB2()},
  {state:{...validState(),migration_ledger_verified:false},
   pointerProof:realPointer(),b2Proof:physicalB2()}
 ];
 for(const c of cases){
  const r=assessStep3ProductionFinal(c);
  assert.equal(r.status,"NOT_YET_VERIFIED");
  assert.equal(r.post_migration_readback_explicit_PASS,false);
 }
});
test("already applied migrations can be reverified without inventing new writes",()=>{
 const s=validState();s.production_sql_mutated=false;
 const r=assessStep3ProductionFinal({state:s,
  pointerProof:emptyPointer(),b2Proof:physicalB2()});
 assert.equal(r.status,"PASS");
});
