import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {reportGriFourGates} from "../ops/report-gri-four-gates-readiness.mjs";
const NOW=new Date("2026-10-18T17:20:00.000Z");
const sourceAt=new Date(NOW.getTime()-10*60_000).toISOString();
const sha=s=>createHash("sha256").update(s).digest("hex");
const h="a".repeat(64);
function worklist(count=0){
  const categories=["geopolitics","macro","rare_earth"].map((category,i)=>({
    category,
    review_targets:i===0&&count?[{
      candidate_within_90m_new_gri_window:true,country_iso3:"IND",
    }]:[],
    within_90m_new_gri_window:i===0?count:0,
    within_90m_and_country_mapped:i===0?count:0,
  }));
  return {
    schema:"geomacro.material-gri-country-evidence-worklist.v1",
    generated_at:NOW.toISOString(),
    canonical_country_registry_count:195,
    trigger_only_after_verified_signed_inputs:true,
    real_signed_gri_scoring_permission_inferred:false,
    numerical_gri_recomputed:false,signed_gri_or_country_certificate_created:false,
    original_content_or_urls_included:false,public_gri_or_indices_written:false,
    categories,current_native_original_90m_review_targets:count,
    current_native_original_90m_country_mapped_targets:count,
  };
}
const response=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json"},
});
function signedParent(){
  const reading=()=>({readingStatus:"current",readingAsOf:sourceAt,
    series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{}]}}});
  const payload={schema:"geomacro.public-global-risk-live.v1",
    source_project:"ldpwajisioljyjtojvfx",
    generated_at:new Date(NOW.getTime()-2*60_000).toISOString(),
    data:{methodologyVersion:"gri-v1.2.0",verificationStatus:"verified",
      auditPersisted:true,snapshotAsOf:sourceAt,
      proofHash:h,evidenceHash:h,calculationHash:h,
      domainIndices:{geopolitics:reading(),macro:reading(),rare_earth:reading()}},
  };
  const payload_json=JSON.stringify(payload);
  return {ok:true,product:"global-risk",schema:payload.schema,
    proof_schema:"geomacro.public-global-risk-live-proof.v1",
    verification_mode:"direct-b2-readback",
    b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
    b2_sha256:h,payload_sha256:sha(payload_json),
    source_as_of:sourceAt,generated_at:payload.generated_at,
    expires_at:new Date(NOW.getTime()+20*60_000).toISOString(),
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,payload_json};
}
function child(parent){
  const payload={schema:"geomacro.public-risk-indices-live.v1",
    generated_at:parent.generated_at,
    parent_global_risk_b2_sha256:parent.b2_sha256,
    parent_global_risk_payload_sha256:parent.payload_sha256,
    data:{parentMethodologyVersion:"gri-v1.2.0",snapshotAsOf:sourceAt}};
  const payload_json=JSON.stringify(payload);
  return {ok:true,product:"risk-indices",schema:payload.schema,
    proof_schema:"geomacro.public-risk-indices-live-proof.v1",
    verification_mode:"direct-b2-readback",
    b2_object_key:"geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    b2_sha256:h,payload_sha256:sha(payload_json),
    source_as_of:sourceAt,expires_at:parent.expires_at,
    full_b2_readback_verified:true,current_b2_readback_verified:true,
    exact_gzip_restore_verified:true,payload_json};
}
const hints={
  GRI_READY_REVIEWED_SHA256:"a".repeat(64),
  GRI_READY_CERTIFICATES_SHA256:"b".repeat(64),
  GRI_READY_APPROVED_AT:new Date(NOW.getTime()-5*60_000).toISOString(),
};
function mock({parent=null,indices=null,code=503}={}){
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    calls.push({url:String(url),method:options.method});
    if(String(url).endsWith("/global-risk"))
      return parent?response(parent):response({ok:false},code);
    if(String(url).endsWith("/risk-indices"))
      return indices?response(indices):response({ok:false},code);
    throw Error("UNEXPECTED_URL");
  }};
}
test("zero fresh source, absent pointers and public 503 all report blocked truthfully",async()=>{
  const f=mock();
  const result=await reportGriFourGates({
    worklist:worklist(),env:{},now:NOW,fetchImpl:f.fetchImpl,
  });
  assert.equal(result.genuine_native_90m_review_candidates,0);
  assert.equal(result.approved_signed_gri_pointer_hints_present,false);
  assert.equal(result.current_numerical_gri_v12_product_verified,false);
  assert.equal(result.current_risk_indices_exact_parent_verified,false);
  assert.equal(result.unresolved_gates.length,4);
  assert.equal(result.payments,0);assert.equal(result.b2_requests,0);
  assert.equal(result.numerical_recomputation_performed_in_this_job,false);
  assert.equal(f.calls.length,1);
});
test("one candidate and valid SHA hints never substitute for GRI or source permission",async()=>{
  const f=mock();
  const result=await reportGriFourGates({
    worklist:worklist(1),env:hints,now:NOW,fetchImpl:f.fetchImpl,
  });
  assert.equal(result.country_mapped_native_90m_review_candidates,1);
  assert.equal(result.approved_signed_gri_pointer_hints_present,true);
  assert.equal(result.real_reviewed_gri_input_verified_in_this_job,false);
  assert.equal(result.current_numerical_gri_v12_product_verified,false);
  assert.equal(result.paid_delivery_authorized,false);
});
test("actual current signed GRI D1 and exact-parent indices independently pass",async()=>{
  const parent=signedParent(),indices=child(parent);
  const f=mock({parent,indices});
  const result=await reportGriFourGates({
    worklist:worklist(),env:{},now:NOW,fetchImpl:f.fetchImpl,
  });
  assert.equal(result.current_numerical_gri_v12_product_verified,true);
  assert.equal(result.current_risk_indices_exact_parent_verified,true);
  assert.equal(result.risk_indices_repair_eligible,false);
  assert.equal(result.approved_signed_gri_pointer_hints_present,false);
  assert.equal(result.country_certificates_issued_in_this_job,false);
  assert.equal(result.unresolved_gates.length,2);
  assert.equal(f.calls.length,2);
  assert.equal(JSON.stringify(result).includes("payload_json"),false);
});
test("verified GRI parent with expired indices reports eligible repair, not completed",async()=>{
  const p=signedParent(),bad=child(p);bad.expires_at=new Date(NOW.getTime()-1000).toISOString();
  const f=mock({parent:p,indices:bad});
  const result=await reportGriFourGates({worklist:worklist(),env:hints,now:NOW,fetchImpl:f.fetchImpl});
  assert.equal(result.current_numerical_gri_v12_product_verified,true);
  assert.equal(result.current_risk_indices_exact_parent_verified,false);
  assert.equal(result.risk_indices_repair_eligible,true);
  assert.equal(result.d1_writes,0);
});
test("fake GRI score, stale clock, invalid worklist or URL cannot produce current readiness",async()=>{
  const stale=signedParent();stale.source_as_of="2026-10-15T00:00:00Z";
  for(const bad of [
    {...signedParent(),proof_schema:"fake"},
    stale,
    {...signedParent(),payload_json:"{}"},
  ]){
    const f=mock({parent:bad});
    const r=await reportGriFourGates({worklist:worklist(),env:hints,now:NOW,fetchImpl:f.fetchImpl});
    assert.equal(r.current_numerical_gri_v12_product_verified,false);
    assert.equal(r.current_risk_indices_exact_parent_verified,false);
  }
  await assert.rejects(()=>reportGriFourGates({
    worklist:{...worklist(),current_native_original_90m_review_targets:999},
    env:{},now:NOW,fetchImpl:mock().fetchImpl,
  }),/COUNTS_MISMATCH/);
});
