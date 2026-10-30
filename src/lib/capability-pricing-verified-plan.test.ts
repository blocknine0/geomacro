import { describe, expect, it } from "vitest";
import { buildAgentQueryPlan } from "./agent-query-plan";
import { resolveVerifiedPublishedPlanPrice, type VerifiedCapabilityPriceProof } from "./capability-pricing-verified-plan.server";

const proof: VerifiedCapabilityPriceProof = {
  evidence_verified:true, rights_verified:true, signing_verified:true, deliverable:true,
  signed_object_lifecycle:"existing", change_attribution_verified:false,
};
const subject=[{type:"country" as const,country_iso3:"IND"}];
const plan=(input: Record<string,unknown>)=>buildAgentQueryPlan({
  subjects:subject, topics:["macro_risk"], detail:"compact", ...input,
});
describe("capability prices selected only from verified canonical plans (NO FUNDS)",()=>{
  it("uses focused / standard / complex deterministic criteria, never a client price",()=>{
    expect(resolveVerifiedPublishedPlanPrice(plan({}),proof)).toMatchObject({
      capability:"intelligence_query",variant:"focused",amount_atomic:"20000"});
    expect(resolveVerifiedPublishedPlanPrice(plan({detail:"standard"}),proof)).toMatchObject({
      variant:"standard",amount_atomic:"30000"});
    expect(resolveVerifiedPublishedPlanPrice(plan({detail:"full"}),proof)).toMatchObject({
      variant:"complex_multi_source",amount_atomic:"50000"});
    const multi=plan({topics:["macro_risk","fx_external_risk","conflict_geopolitics","critical_minerals"]});
    expect(resolveVerifiedPublishedPlanPrice(multi,proof).amount_usdc).toBe("0.05");
    expect(resolveVerifiedPublishedPlanPrice(plan({}),proof)).toEqual(resolveVerifiedPublishedPlanPrice(plan({}),proof));
  });
  it("routes signed objects and bundles without adding a second object fee",()=>{
    const gro=plan({topics:["risk_object"],intent:"single_subject"});
    expect(resolveVerifiedPublishedPlanPrice(gro,proof)).toMatchObject({
      capability:"signed_risk_object",variant:"existing_valid_signed",amount_atomic:"30000"});
    expect(resolveVerifiedPublishedPlanPrice(gro,{...proof,signed_object_lifecycle:"new"})).toMatchObject({
      variant:"newly_qualified_signed",amount_atomic:"50000"});
    const gate=plan({topics:["risk_gate"],intent:"risk_gate",
      risk_gate_context:{action_type:"agent_payment",policy_preset:"balanced"}});
    expect(resolveVerifiedPublishedPlanPrice(gate,proof)).toMatchObject({
      capability:"risk_gate_bundle",variant:"existing_proof_preflight",amount_atomic:"30000",
      included_signed_object_charge:"INCLUDED_NO_DOUBLE_CHARGE"});
    expect(resolveVerifiedPublishedPlanPrice(gate,{...proof,signed_object_lifecycle:"new"})).toMatchObject({
      variant:"standard",amount_atomic:"50000"});
    expect(resolveVerifiedPublishedPlanPrice(plan({topics:["risk_gate","macro_risk","conflict_geopolitics","critical_minerals"],
      intent:"risk_gate", risk_gate_context:{action_type:"agent_payment",policy_preset:"balanced"},
      detail:"full"}),proof)).toMatchObject({capability:"risk_gate_bundle",variant:"complex_multi_source",amount_atomic:"50000"});
  });
  it("cannot pretend GRI change attribution or structural rights",()=>{
    const gri=plan({topics:["gri_context"]});
    expect(()=>resolveVerifiedPublishedPlanPrice(gri,proof))
      .toThrow("CAPABILITY_RETIRED_NO_CHARGE");
    const changed=plan({topics:["gri_context"],intent:"change_since",change:{baseline:"previous_published"}});
    expect(()=>resolveVerifiedPublishedPlanPrice(changed,proof)).toThrow("CAPABILITY_RETIRED_NO_CHARGE");
    expect(()=>resolveVerifiedPublishedPlanPrice(changed,{...proof,change_attribution_verified:true}))
      .toThrow("CAPABILITY_RETIRED_NO_CHARGE");
    const structural=plan({delivery_tier:"structural_baseline"});
    // Historical structural digests never claim a signed current GRO.
    expect(resolveVerifiedPublishedPlanPrice(structural,{
      ...proof,signing_verified:false,signed_object_lifecycle:"none",
    })).toMatchObject({capability:"structural_country_digest",amount_atomic:"20000"});
    expect(()=>resolveVerifiedPublishedPlanPrice(structural,proof))
      .toThrow("CAPABILITY_PRICE_STRUCTURAL_ONLY_NO_SIGNED_CLAIMS");
  });
  it("rejects missing evidence, rights, signing and delivery proofs",()=>{
    const p=plan({});
    for(const key of ["evidence_verified","rights_verified","signing_verified","deliverable"] as const){
      expect(()=>resolveVerifiedPublishedPlanPrice(p,{...proof,[key]:false} as VerifiedCapabilityPriceProof))
        .toThrow("CAPABILITY_PRICE_ELIGIBILITY_UNVERIFIED_NO_CHARGE");
    }
    expect(()=>resolveVerifiedPublishedPlanPrice(plan({fulfillment_mode:"live_on_demand"}),proof))
      .toThrow("CAPABILITY_PRICE_PUBLISHED_PROOF_REQUIRED");
    expect(()=>resolveVerifiedPublishedPlanPrice(plan({topics:["risk_object"]}),{
      ...proof,signed_object_lifecycle:"none"})).toThrow();
  });
});
