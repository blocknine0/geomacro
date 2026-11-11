import {describe,it,expect} from "vitest";
import {createHash,generateKeyPairSync,sign as edSign} from "node:crypto";
import {canonicalRiskObjectJson} from "../lib/risk-object-signing.server";
import {validateSignedProgressiveResponse} from "../routes/api.risk-gate";

const keys=generateKeyPairSync("ed25519");
const id="test-progressive-7day";
const publicSpki=keys.publicKey.export({type:"spki",format:"der"}).toString("base64");

function envelope(tier:"BASIC_0_10"|"STANDARD_0_15"|"COMPLEX_0_25",{
 standard,gro,history,active=standard&&gro&&history
}:{standard:boolean;gro:boolean;history:boolean;active?:boolean}){
 const matrix={
  basic:{active:true,status:"ACTIVE"},
  standard:{active:standard,status:standard?"ACTIVE":"PENDING",
   corroboration_sources_count:standard?2:0},
  complex:{active,status:active?"ACTIVE":"LOCKED",
   signed_gro_ready:gro,seven_day_rollup_ready:history},
 };
 const price=tier==="BASIC_0_10"?0.10:tier==="STANDARD_0_15"?0.15:0.25;
 const payload={
  schema:"geomacro.progressive-risk-gate-decision.v1",tier,
  price_per_call_usd:price,execution_authorized:false,
  risk_gate:{decision:"PAUSE",execution_authorized:false},
  context:{verified_signed_gro:tier==="COMPLEX_0_25",payment_authorized:false},
  tier_activation_matrix:matrix,
 };
 const encoded=Buffer.from(canonicalRiskObjectJson(payload),"utf8");
 return {...payload,decision_signed_payload:payload,
  decision_signature_scheme:"Ed25519",decision_signature_scope:"geomacro.progressive-risk-gate-decision.v1",
  decision_signature_key_id:id,decision_payload_sha256:createHash("sha256").update(encoded).digest("hex"),
  decision_signature_b64:edSign(null,encoded,keys.privateKey).toString("base64")};
}

describe("signed Risk Gate tier admission at SSR boundary",()=>{
 it("accepts authentic Basic, verified Standard, and fully proven Complex",()=>{
  for(const [tier,claims] of [
   ["BASIC_0_10",{standard:false,gro:false,history:false}],
   ["STANDARD_0_15",{standard:true,gro:true,history:false}],
   ["COMPLEX_0_25",{standard:true,gro:true,history:true}],
  ] as const){
   expect(validateSignedProgressiveResponse(envelope(tier,claims),publicSpki,id)).toBe(true);
  }
 });
 it("rejects even correctly signed Complex when 7d history or native Standard is absent",()=>{
  for(const claims of [
   {standard:true,gro:true,history:false,active:true},
   {standard:false,gro:true,history:true,active:true},
   {standard:true,gro:false,history:true,active:true},
  ]){
   expect(validateSignedProgressiveResponse(envelope("COMPLEX_0_25",claims),publicSpki,id)).toBe(false);
  }
 });
 it("rejects a signed lower-priced label mismatching readiness, even if the signature is authentic",()=>{
  expect(validateSignedProgressiveResponse(envelope("STANDARD_0_15",{
   standard:true,gro:true,history:true}),publicSpki,id)).toBe(false);
  expect(validateSignedProgressiveResponse(envelope("BASIC_0_10",{
   standard:true,gro:false,history:false}),publicSpki,id)).toBe(false);
 });
 it("rejects mismatched pin or tampering after signature",()=>{
  const record=envelope("COMPLEX_0_25",{standard:true,gro:true,history:true});
  expect(validateSignedProgressiveResponse(record,"",id)).toBe(false);
  expect(validateSignedProgressiveResponse(record,publicSpki,"different")).toBe(false);
  expect(validateSignedProgressiveResponse({...record,price_per_call_usd:0.10},publicSpki,id)).toBe(false);
 });
});
