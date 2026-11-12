import {describe,it,expect} from "vitest";
import {createHash,generateKeyPairSync,sign as edSign} from "node:crypto";
import {canonicalRiskObjectJson} from "../lib/risk-object-signing.server";
import {validateSignedProgressiveResponse} from "../routes/api.risk-gate";

const keys=generateKeyPairSync("ed25519");
const id="test-progressive-7day";
const publicSpki=keys.publicKey.export({type:"spki",format:"der"}).toString("base64");
const terms={
 basic_focused:{structure:"BASIC_FOCUSED_FACTS_DERIVED_V1",price:"0.15",fee:"0.10"},
 standard:{structure:"STANDARD_DUAL_ORIGINAL_GRO_V1",price:"0.20",fee:"0.15"},
 complex_full:{structure:"COMPLEX_7D_CORRIDOR_SYNTHESIS_V1",price:"0.30",fee:"0.25"},
} as const;
function envelope(tier:keyof typeof terms,{
 standard,gro,history,billable=true,fee=terms[tier].fee,
 active=standard&&gro&&history
}:{standard:boolean;gro:boolean;history:boolean;billable?:boolean;fee?:string;active?:boolean}){
 const matrix={
  basic:{active:true,status:"ACTIVE"},
  standard:{active:standard,status:standard?"ACTIVE":"PENDING",corroboration_sources_count:standard?2:0},
  complex:{active,status:active?"ACTIVE":"LOCKED",signed_gro_ready:gro,seven_day_rollup_ready:history},
 };
 const payload={schema:"geomacro.progressive-risk-gate-decision.v1",verdict_id:"123e4567-e89b-52d3-a456-426614174000",
  channel:"predge_b2b",tier,structure_type:terms[tier].structure,
  customer_price_usdc:terms[tier].price,geomacro_fee_usdc:billable?fee:"0.00",
  predge_share_usdc:billable?"0.05":"0.00",billable,
  entry_status:billable?"DELIVERED":"INSUFFICIENT_EVIDENCE",execution_authorized:false,
  risk_gate:{decision:billable?"REQUIRE_APPROVAL":"PAUSE",execution_authorized:false},
  context:{verified_signed_gro:tier==="complex_full"&&billable,payment_authorized:false},
  tier_activation_matrix:matrix,
 };
 const encoded=Buffer.from(canonicalRiskObjectJson(payload),"utf8");
 return {...payload,decision_signed_payload:payload,
  decision_signature_scheme:"Ed25519",decision_signature_scope:"geomacro.progressive-risk-gate-decision.v1",
  decision_signature_key_id:id,decision_payload_sha256:createHash("sha256").update(encoded).digest("hex"),
  decision_signature_b64:edSign(null,encoded,keys.privateKey).toString("base64")};
}

describe("signed Predge paid Risk Gate Addendum v2 at SSR boundary",()=>{
 it("accepts the exact independent tier contracts",()=>{
  for(const [tier,claims] of [
   ["basic_focused",{standard:false,gro:false,history:false}],
   ["standard",{standard:true,gro:false,history:false}],
   ["complex_full",{standard:true,gro:true,history:true}],
  ] as const)expect(validateSignedProgressiveResponse(envelope(tier,claims),publicSpki,id)).toBe(true);
 });
 it("accepts the explicitly locked tier with zero fee when its evidence is insufficient",()=>{
  expect(validateSignedProgressiveResponse(envelope("complex_full",{
   standard:true,gro:true,history:false,billable:false
  }),publicSpki,id)).toBe(true);
 });
 it("rejects billable claims without evidence, pricing drift, or post-signature tampering",()=>{
  expect(validateSignedProgressiveResponse(envelope("complex_full",{
   standard:true,gro:true,history:false
  }),publicSpki,id)).toBe(false);
  const record=envelope("standard",{standard:true,gro:false,history:false});
  expect(validateSignedProgressiveResponse({...record,geomacro_fee_usdc:"0.10"},publicSpki,id)).toBe(false);
  expect(validateSignedProgressiveResponse(record,"",id)).toBe(false);
  expect(validateSignedProgressiveResponse(record,publicSpki,"different")).toBe(false);
 });
 it("rejects a fee on any nonbillable evidence outcome",()=>{
  const record=envelope("basic_focused",{standard:false,gro:false,history:false,billable:false});
  expect(validateSignedProgressiveResponse({...record,geomacro_fee_usdc:"0.10"},publicSpki,id)).toBe(false);
 });
});
