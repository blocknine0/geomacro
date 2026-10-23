import test from "node:test";
import assert from "node:assert/strict";
import {buildPallabSumanHostedHandoff,humanHandoffMarkdown}
  from "../ops/report-pallab-suman-hosted-handoff.mjs";

const NOW=new Date("2026-10-23T12:00:00.000Z");
const hex=a=>a.repeat(64);
const env=Object.freeze({
  GRI_READY_REVIEWED_SHA256:hex("a"),
  GRI_READY_CERTIFICATES_SHA256:hex("b"),
  GRI_READY_APPROVED_AT:"2026-10-23T11:55:00.000Z",
  MACHINE_INTELLIGENCE_READY_INPUT_SHA256:hex("c"),
  MACHINE_INTELLIGENCE_READY_APPROVED_AT:"2026-10-23T11:55:00.000Z",
  GEOMACRO_GRI_AUTO_ENROLLED:"YES_CONSENT_ONLY",
  GEOMACRO_GRI_AUTO_REVOKED:"NO"
});
test("no private inputs means human action rather than fake verified publication",()=>{
  const receipt=buildPallabSumanHostedHandoff({env:{},now:NOW});
  assert.equal(receipt.status,"HUMAN_AND_SOURCE_EVIDENCE_HANDOFF_PENDING");
  assert.equal(receipt.public_machine_intelligence_hint_eligible,false);
  assert.equal(receipt.independent_gri_hints_eligible,false);
  assert.equal(receipt.genuine_pallab_owner_signature_gate_passed,false);
  assert.equal(receipt.real_payments,0);
  assert.deepEqual(receipt.handoff.map(x=>x.role),[
    "APPROVED_FACTS_AND_RIGHTS_CUSTODIANS",
    "SUMAN_INDEPENDENT_GRI_REVIEWER",
    "PALLAB_OWNER",
    "HOSTED_GEOMACRO_PRODUCTION",
    "PALLAB_REAL_MONEY_OWNER"
  ]);
  const msg=humanHandoffMarkdown(receipt);
  assert.match(msg,/Suman Dey/);
  assert.match(msg,/Pallab Das/);
  assert.match(msg,/no laptop/i);
});
test("recent pointers alone do not assert an owner signature or valid product",()=>{
  const receipt=buildPallabSumanHostedHandoff({env,now:NOW});
  assert.equal(receipt.independent_gri_hints_eligible,true);
  assert.equal(receipt.public_machine_intelligence_hint_eligible,true);
  assert.equal(receipt.genuine_pallab_owner_signature_gate_passed,false);
  assert.equal(receipt.status,"HUMAN_AND_SOURCE_EVIDENCE_HANDOFF_PENDING");
  assert.equal(receipt.delegation_scope,"DERIVED_ONLY_POLICY_AUDIT_NOT_NUMERICAL_GRI");
  assert.equal(receipt.current_signed_3_of_3_verified_by_this_report,false);
  assert.equal(receipt.website_deep_health_200_verified_by_this_report,false);
});
test("owner gate pass is bounded to protected gate and NEVER publication",()=>{
  const receipt=buildPallabSumanHostedHandoff({
    env:{...env,GEOMACRO_OWNER_GATE_APPROVED:"true"},now:NOW
  });
  assert.equal(receipt.status,"APPROVED_POINTERS_PRESENT_PROTECTED_PUBLICATION_AND_READBACK_UNVERIFIED");
  assert.equal(receipt.handoff[2].action,
    "EXACT_BATCH_OWNER_SIGNATURE_GATE_PASSED_NO_NEW_OWNER_SIGNATURE_IN_THIS_RUN");
  assert.equal(receipt.article_specific_rights_verified_by_this_report,false);
  assert.equal(receipt.reviewer_signed_input_verified_by_this_report,false);
  assert.equal(receipt.real_payments_authorized,false);
});
test("old SHA hints and forged owner flag stay blocked",()=>{
  const receipt=buildPallabSumanHostedHandoff({
    env:{...env,GRI_READY_APPROVED_AT:"2026-10-23T11:00:00.000Z",
      MACHINE_INTELLIGENCE_READY_APPROVED_AT:"2026-10-23T11:00:00.000Z",
      GEOMACRO_OWNER_GATE_APPROVED:"TRUE"},
    now:NOW
  });
  assert.equal(receipt.independent_gri_hints_eligible,false);
  assert.equal(receipt.public_machine_intelligence_hint_eligible,false);
  assert.equal(receipt.genuine_pallab_owner_signature_gate_passed,false);
});
test("revoked consent is not called a commercial or derived grant",()=>{
  const receipt=buildPallabSumanHostedHandoff({
    env:{...env,GEOMACRO_GRI_AUTO_REVOKED:"YES"},now:NOW
  });
  assert.equal(receipt.delegation_scope,"NO_ACTIVE_DERIVED_ONLY_CONSENT_DETECTED");
});
test("receipt summary cannot print attacker supplied private material",()=>{
  const sensitive="DO_NOT_LEAK_SECRET_SOURCE_ARTICLE_OR_PRIVATE_KEY";
  const receipt=buildPallabSumanHostedHandoff({
    env:{...env,GEOMACRO_PRIVATE_INPUT:sensitive,
      GRI_READY_REVIEWED_SHA256:sensitive,GEOMACRO_OWNER_GATE_APPROVED:sensitive},
    now:NOW
  });
  const output=JSON.stringify(receipt)+humanHandoffMarkdown(receipt);
  assert.equal(output.includes(sensitive),false);
  assert.equal(output.includes(hex("b")),false);
  assert.throws(()=>humanHandoffMarkdown({...receipt,handoff:[
    {role:"BAD",action:sensitive},...receipt.handoff.slice(1)
  ]}),/HUMAN_HANDOFF_RECEIPT_INVALID/);
});
