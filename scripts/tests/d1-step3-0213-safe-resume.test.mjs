import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {admitUnsigned0213AppliedEmptyResume}
 from "../lib/d1-step3-0213-safe-resume.mjs";

const structural=()=>({
 schema:"geomacro.step3.0213-empty-ref-only-structure.v1",
 status:"OBSERVED_EMPTY_REFERENCE_STRUCTURAL_ONLY",
 index_schema_count:4,observed_rows:0,
 source_pointer_hmac_verified:false,
 nonvacuous_original_bytes_verified:false,
 b2_original_readback_verified:false,
 encrypted_r2_checkpoint_verified:false,
 production_release_authorized:false,stage2_authorized:false,
 canary_promoted:false,paid_delivery_authorized:false,
 sqlite_full_integrity_check_claimed:false,
 provider_reader_provenance:"REQUIRES_FRESH_SAME_TARGET_D1_CALLER"
});
const refOff=()=>({
 status:"PASS_REAL_PROVIDER_PRODUCTION_REFERENCE_ONLY_SWITCHES_OFF",
 source:"CLOUDFLARE_DEPLOYED_WORKER_SETTINGS_AND_VERSION",
 writer_enabled:false,reader_enabled:false,
 production_hmac_deployed:false,
 real_production_pointer_hmac_verified:false,
 production_cutover_authorized:false,remote_writes:0
});
const approve=(extra={})=>admitUnsigned0213AppliedEmptyResume({
 nativeApplied:true,structuralProof:structural(),
 refOnlyOffProof:refOff(),...extra
});
test("real native-applied 0213 with exact 4-index EMPTY structure can resume ONLY, never certify HMAC or release",()=>{
 const receipt=approve();
 assert.equal(receipt.status,"PASS_NATIVE_0213_EMPTY_PROVIDER_STRUCTURE_RESUME_ONLY");
 assert.equal(receipt.existing_pointer_count,0);
 assert.equal(receipt.production_hmac_present,false);
 assert.equal(receipt.actual_hmac_verified,false);
 assert.equal(receipt.original_pointer_bytes_or_hmac_claimed,false);
 assert.equal(receipt.independent_production_b2_get_still_required,true);
 assert.equal(receipt.ledger_and_four_migration_verification_still_required,true);
 assert.equal(receipt.signed_production_pass_generated,false);
 assert.equal(receipt.production_sql_mutated,false);
 assert.equal(receipt.canary_promoted,false);
});
test("fresh pending 0213 cannot impersonate historical applied empty",()=>{
 assert.throws(()=>approve({nativeApplied:false}),
  /STEP3_UNSIGNED_0213_NATIVE_APPLIED_HISTORY_REQUIRED/u);
});
test("any existing real pointer, HMAC claims, unsigned indices or fake schema HOLD",()=>{
 const corrupt=[
  x=>{x.observed_rows=1;},x=>{x.source_pointer_hmac_verified=true;},
  x=>{x.nonvacuous_original_bytes_verified=true;},
  x=>{x.index_schema_count=3;},x=>{x.status="PASS";},
  x=>{x.schema="NOT_REVIEWED";},x=>{x.b2_original_readback_verified=true;},
  x=>{x.stage2_authorized=true;},x=>{x.canary_promoted=true;},
  x=>{x.encrypted_r2_checkpoint_verified=true;},
  x=>{x.production_release_authorized=true;},
  x=>{x.sqlite_full_integrity_check_claimed=true;},
  x=>{x.provider_reader_provenance="FIXTURE_ONLY"}
 ];
 for(const mutate of corrupt){
  const proof=structural();mutate(proof);
  assert.throws(()=>approve({structuralProof:proof}),
   /STEP3_UNSIGNED_0213_EXISTING_REFERENCE_SCHEMA_INDEX_OR_ZERO_ROWS_NOT_PROVEN/u);
 }
});
test("missing original HMAC is admitted only with actual deployed version ref-only writer/reader disabled",()=>{
 const cases=[
  x=>{x.writer_enabled=true;},
  x=>{x.reader_enabled=true;},
  x=>{x.production_hmac_deployed=true;},
  x=>{x.real_production_pointer_hmac_verified=true;},
  x=>{x.production_cutover_authorized=true;},
  x=>{x.remote_writes=1;},
  x=>{x.status="UNVERIFIED";},
  x=>{x.source="LOCAL_SIMULATED"}
 ];
 for(const mutate of cases){
  const proof=refOff();mutate(proof);
  assert.throws(()=>approve({refOnlyOffProof:proof}),
   /STEP3_UNSIGNED_0213_LIVE_REFERENCE_SWITCHES_OR_DEPLOYED_HMAC_UNVERIFIED/u);
 }
});
test("real Stage2 uses complete same-target live D1 index/zero-row audit; fresh path still refuses unreviewed table",()=>{
 const src=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 const marker=src.indexOf("const applied0213=");
 const history=src.indexOf('state.native_history_preflight.native_applied_ids.includes("0213")');
 const audit=src.indexOf("auditStep30213EmptyRefStructure(checked)",marker);
 const admitted=src.indexOf("admitUnsigned0213AppliedEmptyResume({",marker);
 const checkpoint=src.indexOf("await captureDurableD1Checkpoint({",marker);
 assert(marker>0&&history>marker&&audit>history&&admitted>audit);
 assert(checkpoint>admitted);
 assert.match(src,/UNSIGNED_0213_PRECHECK_READ_BUDGET_EXCEEDED/u);
 assert.match(src,/UNSIGNED_0213_EXISTING_REFERENCE_SCHEMA_UNVERIFIED/u);
 assert.match(src,/verifyProductionRefOnlyOff\(\{env\}\)/u);
 assert.match(src,/verifyHmacNewPointers\(config,env\)/u);
 assert.match(src,/verifyRealShadowB2Parity\(/u);
 assert.match(src,/signStep3StatusReceipt\(state,env\.SIGNING_JWK\)/u);
 assert.match(src,/if\(state\.status!=="PASS"\)fail\("FINAL_PROTECTED_READBACK_HELD"\)/u);
});
