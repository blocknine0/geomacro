import {test} from "node:test";
import assert from "node:assert/strict";
import {phase2ReadinessReceipt,runPhase2Readiness} from
  "../ops/phase2-gri-recovery-readiness.mjs";
const now=new Date("2026-10-19T08:40:00Z");
const hist={schema:"geomacro.gri-pinned-history-existing-d1-readonly.v1",
  status:"PINNED_HISTORICAL_D1_ROW_ABSENT_REQUIRES_B2_PROOF",
  already_present:false,current_gri_signed:false,b2_requests:0,d1_writes:0};
const quota={schema:"geomacro.gri-historical-shared-quota-preflight.v1",
  quota_allows_attempt:false,remaining_reserved_get:0,
  remaining_reserved_total:53,b2_requests:0,d1_writes:0};
const signers={schema:"geomacro.gri-v12-signed-input-blockers.v1",
  externally_approved_fresh_hint_valid:false,
  reviewed_signed_input_pointer_valid:false,
  independent_country_certificates_pointer_valid:false,
  missing_requirements:["REAL_INDEPENDENTLY_REVIEWER_SIGNED_GRI_INPUT",
    "SEPARATE_SIGNED_COUNTRY_CATEGORY_CERTIFICATES",
    "RECENT_AUTHENTIC_REVIEW_APPROVAL_WINDOW"]};
test("P2 reports actual 25/25 B2 GET exhaustion and missing genuine signed handoff without claiming publication",()=>{
  const r=phase2ReadinessReceipt({history:hist,quota,signers,now});
  assert.equal(r.phase2_inputs_preflight_complete,true);
  assert.equal(r.remaining_reserved_get,0);
  assert.equal(r.next_safe_action,"WAIT_FOR_GOVERNED_B2_GET_HEADROOM");
  assert.equal(r.current_gri_v12_available,false);
  assert.equal(r.eligible_to_run_current_signed_gri_publisher_now,false);
  assert.equal(r.immutable_historical_b2_readback_now_verified,false);
  assert.deepEqual([r.b2_requests,r.d1_writes,r.payments],[0,0,0]);
  assert.ok(!JSON.stringify(r).includes("sha256"));
});
test("existing historical D1 row is not proof of a current B2 immutable readback",()=>{
  const r=phase2ReadinessReceipt({history:{...hist,already_present:true,
    status:"PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY"},
    quota:{...quota,quota_allows_attempt:true,remaining_reserved_get:10},
    signers,now});
  assert.equal(r.historical_d1_metadata_recorded,true);
  assert.equal(r.immutable_historical_b2_readback_now_verified,false);
  assert.equal(r.next_safe_action,"STAGE_REAL_EXTERNAL_REVIEW_AND_COUNTRY_CERTIFICATES");
  assert.equal(r.current_signed_publication_verified,false);
});
test("valid SHA-shaped pointers are still unverified signed material, not permission to publish",()=>{
  const r=phase2ReadinessReceipt({history:{...hist,already_present:true,
    status:"PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY"},
    quota:{...quota,quota_allows_attempt:true,remaining_reserved_get:10},
    signers:{...signers,externally_approved_fresh_hint_valid:true,
      reviewed_signed_input_pointer_valid:true,
      independent_country_certificates_pointer_valid:true,missing_requirements:[]},now});
  assert.equal(r.signed_pointer_hint_present,true);
  assert.equal(r.independently_verified_reviewer_signature_now,false);
  assert.equal(r.eligible_to_run_current_signed_gri_publisher_now,false);
  assert.equal(r.next_safe_action,"PROTECTED_GRI_PUBLISHER_MUST_REVALIDATE_ALL_EVIDENCE");
});
test("D1 read errors are unknown, never guessed as missing or restored",async()=>{
  const r=await runPhase2Readiness({
    env:{GITHUB_ACTIONS:"false"},now,
    checkHistory:async()=>{throw Error("secret denied")},
    checkQuota:async()=>({...quota,quota_allows_attempt:true}),
  });
  assert.equal(r.phase2_inputs_preflight_complete,false);
  assert.equal(r.historical_route,"HISTORICAL_D1_VERIFICATION_UNAVAILABLE");
  assert.equal(r.next_safe_action,"VERIFY_HISTORICAL_D1_ANCHOR_AND_ACCOUNT_GOVERNOR");
  assert.equal(r.immutable_historical_b2_readback_now_verified,false);
  assert.ok(!JSON.stringify(r).includes("secret denied"));
});
test("never contacts B2 or even runs independent probes with funds/Supabase present",async()=>{
 const calls=[];
 await assert.rejects(runPhase2Readiness({
   env:{SUPABASE_URL:"blocked"},now,
   checkHistory:async()=>{calls.push("history")},
   checkQuota:async()=>{calls.push("quota")},
 }),/PHASE2_FUNDS_OR_SUPABASE_FORBIDDEN/);
 assert.deepEqual(calls,[]);
});
test("rejects fabricated historical metadata or quota receipts",()=>{
 const r=phase2ReadinessReceipt({
   history:{...hist,already_present:true,
     status:"PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY",b2_requests:1},
   quota:{...quota,quota_allows_attempt:true,d1_writes:1},
   signers,now});
 assert.equal(r.phase2_inputs_preflight_complete,false);
 assert.equal(r.quota_allows_bounded_immutable_history_attempt,false);
 assert.equal(r.historical_d1_metadata_recorded,false);
});
