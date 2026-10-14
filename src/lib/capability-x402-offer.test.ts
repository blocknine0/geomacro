import {describe,it,expect} from "vitest";
import {buildAgentQueryPlan} from "./agent-query-plan";
import {qualifyVerifiedPreparedCapability} from "./capability-x402-offer.server";
import type {AgentQueryDeliverability} from "./agent-query-deliverability.server";

const plan=buildAgentQueryPlan({
  subjects:[{type:"country",country_iso3:"IND"}],
  topics:["risk_object"],intent:"single_subject",
});
const ready:AgentQueryDeliverability={
 deliverable:true,code:"AVAILABLE",query_plan_hash:plan.query_plan_hash,
 checked_at:new Date().toISOString(),missing_modules:[],stale_modules:[],
 ineligible_source_ids:[],source_contracts:[],subjects:[],
};
const signed={query_plan_hash:plan.query_plan_hash,execution_authorized:false,
 signed_risk_objects:[{object:{
  risk_object_id:"test-proof-only",
  verification:{status:"VERIFIED"},commercial_eligibility_status:"VERIFIED",
  integrity:{payload_hash:"f".repeat(64),signature_scheme:"Ed25519",signing_key_id:"test-key"},
 }}]};
describe("price qualification requires existing genuinely trusted paid evidence (UNIT ONLY)",()=>{
 it("accepts a structurally verified signed risk object proof without authorizing funds",()=>{
  expect(qualifyVerifiedPreparedCapability(plan,ready,signed))
    .toMatchObject({evidence_verified:true,rights_verified:true,
      signing_verified:true,deliverable:true,signed_object_lifecycle:"existing"});
 });
 it("rejects rights holds, stale sources, unsigned or malformed evidence",()=>{
  for(const alt of [
   {...ready,deliverable:false}, {...ready,ineligible_source_ids:["blocked"]},
   {...ready,stale_modules:["signed_risk_object"]},
   {...ready,query_plan_hash:"0".repeat(64)},
  ]){
   expect(()=>qualifyVerifiedPreparedCapability(plan,alt,signed)).toThrow();
  }
  for(const p of [
   {...signed,signed_risk_objects:[]},
   {...signed,signed_risk_objects:[{object:{
     ...signed.signed_risk_objects[0].object,
     commercial_eligibility_status:"UNVERIFIED"}}]},
   {...signed,signed_risk_objects:[{object:{
     ...signed.signed_risk_objects[0].object,
     integrity:{payload_hash:"f".repeat(64),signature_scheme:"none",signing_key_id:"test"}}}]},
   {...signed,query_plan_hash:"0".repeat(64)},
  ]){
   expect(()=>qualifyVerifiedPreparedCapability(plan,ready,p)).toThrow();
  }
 });
});
