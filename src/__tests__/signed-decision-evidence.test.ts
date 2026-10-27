import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRiskObject } from "../lib/risk-object-signing.server";
import { GRO_SCHEMA_VERSION, COUNTRY_RISK_METHOD_VERSION,
  type GeomacroRiskObject } from "../lib/risk-object-contract";
import { buildSignedDecisionEvidence } from "../lib/signed-decision-evidence.server";
const when=new Date("2026-10-24T13:00:00.000Z");
function fixture():GeomacroRiskObject {
 return {
  schema_version:GRO_SCHEMA_VERSION,object_id:"gro_test_IND",
  subject:{type:"country",id:"IND",name:"India"},
  risk:{score:45,label:"WATCH",previous_score:44,delta:1,direction:"escalating"},
  attribution:[{driver:"currency_fx",score_contribution:45,delta_contribution:1,event_count:1,weight:1}],
  confidence:0.8,evidence:[],evidence_coverage:null,
  evidence_summary:{event_count:1,evidence_count:1,independent_source_count:1},
  methodology_version:COUNTRY_RISK_METHOD_VERSION,
  observed_at:"2026-10-24T12:00:00.000Z",generated_at:"2026-10-24T12:01:00.000Z",
  expires_at:"2026-10-24T15:01:00.000Z",
  issuer:"Geomacro",
  commercial_eligibility:{status:"VERIFIED",reason_codes:[]},
  verification:{status:"VERIFIED",reason_codes:[],last_verified_at:"2026-10-24T12:02:00.000Z"},
  integrity:{input_hash:"a".repeat(64),data_hash:"b".repeat(64),calculation_hash:"c".repeat(64),
   payload_hash:null,canonicalization:null,signature:null,signature_scheme:null,signing_key_id:null},
  provenance:{structure_versions:[],scoring_versions:[],relevance_versions:[],country_versions:[],story_versions:[]},
 };
}
function signed(){
 const key=generateKeyPairSync("ed25519");
 const keyId="decision-fixture-key";
 const object=signRiskObject(fixture(),{key_id:keyId,
   private_key_pkcs8_b64:key.privateKey.export({type:"pkcs8",format:"der"}).toString("base64")});
 const options={now:when,verification_keys:{[keyId]:key.publicKey.export({type:"spki",format:"der"}).toString("base64")}};
 return {object,options};
}
const advisory={policy_version:"test-policy-v1",
  evaluated_at:"2026-10-24T12:30:00.000Z",disposition:"REVIEW" as const,reason_codes:["manual_review"]};
describe("signed GRO evidence and separate policy advisory",()=>{
 it("verifies real Ed25519 bytes and exposes only bounded signed risk metadata",()=>{
   const {object,options}=signed();
   const res=buildSignedDecisionEvidence(object,{...options,advisory});
   expect(res.signed_risk_object.cryptographically_verified).toBe(true);
   expect(res.signed_risk_object.signature).toBe(object.integrity.signature);
   expect(res.signed_risk_object.risk_drivers[0].driver).toBe("currency_fx");
   expect(res.policy_advisory?.disposition).toBe("REVIEW");
   expect(res.policy_advisory?.independently_signed).toBe(false);
   expect(res.execution_authorized).toBe(false);
   expect(JSON.stringify(res)).not.toContain("source_url");
 });
 it("rejects tampering and unknown verification keys",()=>{
   const {object,options}=signed();
   expect(()=>buildSignedDecisionEvidence({...object,risk:{...object.risk,score:92}},options))
      .toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
   expect(()=>buildSignedDecisionEvidence(object,{...options,verification_keys:{}}))
      .toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
 });
 it("rejects expired objects and commercially ineligible signed objects",()=>{
   const {object,options}=signed();
   expect(()=>buildSignedDecisionEvidence(object,{...options,now:new Date("2026-10-24T16:00:00.000Z")}))
      .toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
   const denied=signed();
   // Re-sign a negative commercial status to avoid a tamper-only failure.
   const key=generateKeyPairSync("ed25519"); const keyId="denied-key";
   const deniedObject=signRiskObject({...fixture(),commercial_eligibility:{status:"INELIGIBLE",reason_codes:["test"]}},
     {key_id:keyId,private_key_pkcs8_b64:key.privateKey.export({type:"pkcs8",format:"der"}).toString("base64")});
   const keys={[keyId]:key.publicKey.export({type:"spki",format:"der"}).toString("base64")};
   expect(()=>buildSignedDecisionEvidence(deniedObject,{now:when,verification_keys:keys}))
     .toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
   expect(denied.object.object_id).toContain("IND");
 });
 it("rejects unsigned advisory scope escalation or mismatching policy version",()=>{
   const {object,options}=signed();
   expect(()=>buildSignedDecisionEvidence(object,{...options,
     advisory:{...advisory,disposition:"EXECUTE" as any}})).toThrow("ADVISORY_INVALID");
   expect(()=>buildSignedDecisionEvidence({...object,decision_readiness:{
      status:"READY",policy_version:"old-policy",reason_codes:[],evaluated_at:object.generated_at
     }},{...options,advisory})).toThrow();
 });
});
