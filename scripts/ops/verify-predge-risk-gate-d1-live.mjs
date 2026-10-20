#!/usr/bin/env node
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
   const risk=actual.data.risk_gate;
   if(actual.data.ok!==true||risk?.schema_version!=="risk-gate-1.0"||
      risk.execution_authorized!==false||risk.risk?.verification_status!=="VERIFIED"||
      risk.risk?.commercial_eligibility_status!=="VERIFIED"||
      !["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"].includes(risk.decision))
      throw Error("SIGNED_RISK_GATE_INVALID");
   console.log("PASS: D1 signed-GRO Risk Gate served a verified non-authorizing decision.");
 }else if(actual.status===503&&
   actual.data.error==="CURRENT_SIGNED_GRO_UNAVAILABLE"){
   console.log("PASS: route authenticated but NO CURRENT VERIFIED COMMERCIAL GRO. Paid launch NOT READY.");
 }else throw Error("RISK_GATE_D1_PRODUCTION_ACCEPTANCE_FAILED_"+actual.status);
}
main().catch(e=>{console.error("RISK_GATE_D1_ACCEPTANCE_FAILED:",String(e.message).slice(0,120));process.exitCode=1;});
