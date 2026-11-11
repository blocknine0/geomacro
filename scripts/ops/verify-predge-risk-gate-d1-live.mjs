#!/usr/bin/env node
import {createHash,createPublicKey,verify as verifyEd25519} from "node:crypto";
// No-funds, no-source-payload, no-token logging acceptance for the D1 Risk Gate.
const origin=String(process.env.CONTROL_PLANE_URL??"").replace(/\/+$/,"");
const token=String(process.env.PREDGE_RISK_GATE_TOKEN??"");
const research=String(process.env.PREDGE_RESEARCH_NEWS_TOKEN??"");
const endpoint=origin+"/v1/partner/predge/risk-gate";
const headers={"content-type":"application/json"};
const policy={
 policy_id:"geomacro-production-risk-gate-no-funds-smoke",
 policy_version:"1",
 continue_max_score:20,reduce_limit_max_score:45,
 require_approval_max_score:70,
 minimum_confidence_for_auto_continue:0.9,
 require_commercial_verification_for_continue:true,
};
const body=JSON.stringify({request_id:"smoke-"+String(process.env.GITHUB_RUN_ID??"local")+"-"+Date.now(),
 subject:{type:"country",country_iso3:"USA"},policy});
async function post(credential){
 const h={...headers};
 if(credential)h.authorization="Bearer "+credential;
 const r=await fetch(endpoint,{method:"POST",headers:h,body,
   redirect:"manual",signal:AbortSignal.timeout(12000)});
 if(r.status>=300&&r.status<400)throw Error("REDIRECT_FORBIDDEN");
 const txt=await r.text();
 if(txt.length>128*1024)throw Error("OVERSIZED");
 let data;try{data=JSON.parse(txt)}catch{throw Error("INVALID_JSON");}
 if(data.execution_authorized!==false)throw Error("EXECUTION_BOUNDARY");
 return {status:r.status,data};
}
async function main(){
 if(!/^https:\/\/[A-Za-z0-9._-]+(?::443)?$/.test(origin))throw Error("INVALID_WORKER_ORIGIN");
 if(!/^[a-f0-9]{64}$/.test(token)){
   const noSecret=await post();
   if(noSecret.status!==503||noSecret.data.error!=="RISK_GATE_CREDENTIAL_NOT_CONFIGURED")
     throw Error("EXPECTED_CLOSED_UNPROVISIONED_GATE");
   console.log("PASS: Risk Gate disabled safely; dedicated credential not configured.");
   return;
 }
 const anon=await post();
 if(anon.status!==401||anon.data.error!=="RISK_GATE_UNAUTHORIZED")
   throw Error("ANONYMOUS_NOT_DENIED");
 if(/^[a-f0-9]{64}$/.test(research)&&research!==token){
   const wrong=await post(research);
   if(wrong.status!==401||wrong.data.error!=="RISK_GATE_UNAUTHORIZED")
     throw Error("RESEARCH_TOKEN_ACCEPTED_FOR_RISK_GATE");
 }
 const actual=await post(token);
 if(actual.status===200){
   const data=actual.data,risk=data.risk_gate;
   if(data.ok!==true||risk?.schema_version!=="risk-gate-1.0"||
      risk.execution_authorized!==false||data.execution_authorized!==false||
      data.context?.payment_authorized!==false||
      !Number.isFinite(risk.risk?.score)||risk.risk.score<0||risk.risk.score>100||
      !["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"].includes(risk.decision)||
      !["BASIC_0_10","STANDARD_0_15","COMPLEX_0_25"].includes(data.tier)||
      data.tier_activation_matrix?.basic?.status!=="ACTIVE"||
      data.decision_signature_scheme!=="Ed25519"||
      data.decision_signature_scope!=="geomacro.progressive-risk-gate-decision.v1")
      throw Error("SIGNED_PROGRESSIVE_RISK_GATE_INVALID");
   const complex=data.tier==="COMPLEX_0_25";
   const matrix=data.tier_activation_matrix;
   const standard=matrix?.standard?.active===true;
   const complexProof=standard && matrix?.complex?.signed_gro_ready===true &&
     matrix?.complex?.seven_day_rollup_ready===true;
   if(matrix?.standard?.status!==(standard?"ACTIVE":"PENDING")||
      matrix?.complex?.active!==complexProof||
      matrix?.complex?.status!==(complexProof?"ACTIVE":"LOCKED")||
      complex!==complexProof||
      (data.tier==="STANDARD_0_15")!==(standard&&!complexProof)||
      (data.tier==="BASIC_0_10")!==(!standard))
     throw Error("RISK_GATE_TIER_ROLLUP_TRUTH_MISMATCH");
   if(complex ? (
     risk.risk.verification_status!=="VERIFIED"||
     risk.risk.commercial_eligibility_status!=="VERIFIED"||
     data.context?.verified_signed_gro!==true
   ) : (
     risk.risk.verification_status!=="INCOMPLETE"||
     risk.risk.commercial_eligibility_status!=="UNVERIFIED"||
     data.context?.verified_signed_gro!==false||
     !["OBSERVATION_DENSITY_PROXY","NO_DATA_POLICY_SENTINEL"].includes(
       data.context?.risk_metric_semantics)||
     !["PAUSE","REQUIRE_APPROVAL"].includes(risk.decision)
   ))throw Error("PROGRESSIVE_PROVENANCE_BOUNDARY_INVALID");
   const pubResponse=await fetch(origin+"/v1/public/risk-gate-decision-key",{
     redirect:"manual",signal:AbortSignal.timeout(5000)});
   if(pubResponse.status!==200)throw Error("PROGRESSIVE_ED25519_PUBLIC_KEY_UNAVAILABLE");
   const publicInfo=await pubResponse.json();
   if(publicInfo.ok!==true||publicInfo.scheme!=="Ed25519"||
      publicInfo.key_id!==data.decision_signature_key_id||
      typeof publicInfo.public_key_spki_b64!=="string")
     throw Error("PROGRESSIVE_ED25519_PUBLIC_KEY_MISMATCH");
   const canonical=v=>v===null||typeof v!=="object"?JSON.stringify(v):
     Array.isArray(v)?"["+v.map(canonical).join(",")+"]":
     "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
   const payload=data.decision_signed_payload;
   if(!payload||payload.tier!==data.tier||
      payload.execution_authorized!==false||
      canonical(payload.risk_gate)!==canonical(risk)||
      canonical(payload.tier_activation_matrix)!==canonical(data.tier_activation_matrix))
      throw Error("PROGRESSIVE_ED25519_SCOPE_INVALID");
   const bytes=Buffer.from(canonical(payload));
   if(createHash("sha256").update(bytes).digest("hex")!==data.decision_payload_sha256||
      !verifyEd25519(null,bytes,createPublicKey({
         key:Buffer.from(publicInfo.public_key_spki_b64,"base64"),
         format:"der",type:"spki"}),
       Buffer.from(data.decision_signature_b64,"base64")))
      throw Error("PROGRESSIVE_ED25519_SIGNATURE_INVALID");
   console.log("PASS: authenticated D1 "+data.tier+" advisory, Ed25519 verified; execution forbidden; no funds.");
 }else throw Error("RISK_GATE_D1_PRODUCTION_ACCEPTANCE_FAILED_"+actual.status);
}
main().catch(e=>{console.error("RISK_GATE_D1_ACCEPTANCE_FAILED:",String(e.message).slice(0,120));process.exitCode=1;});
