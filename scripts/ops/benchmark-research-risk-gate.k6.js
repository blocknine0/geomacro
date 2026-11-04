// Run only against your OWN authenticated research endpoint:
// GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN=... k6 run scripts/ops/benchmark-research-risk-gate.k6.js
// This measures END-TO-END network latency, not only in-process decision time.
// 10ms is an acceptance TARGET, never a claimed result without real samples.
// Do not run against /api/commercial/risk-gate, Predge or payment routes.
import http from "k6/http";
import {check,fail} from "k6";
export const options={
 vus:50,duration:"10s",
 thresholds:{
  http_req_duration:["p(95)<10"],
  http_req_failed:["rate<0.01"],
 },
};
const url=__ENV.GEOMACRO_RESEARCH_RISK_GATE_URL||
 "https://geomacro.live/api/research-risk-gate";
const token=__ENV.GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN||"";
if(!/^https:\/\/[a-zA-Z0-9.-]+\/api\/research-risk-gate$/u.test(url)||
   token.length<32)fail("OWNER_RESEARCH_BENCHMARK_ENDPOINT_OR_SECRET_REQUIRED");
export default function(){
 const res=http.post(url,JSON.stringify({
  origin_country:"UKR",destination_country:"USA",policy_threshold:70,
 }),{headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+token},redirects:0,timeout:"5s"});
 let body=null;try{body=res.json()}catch{/* not a positive acceptance */}
 check(res,{
  "signed research API status 200":r=>r.status===200,
  "execution never authorized":()=>body?.execution_authorized===false,
  "commercial never eligible":()=>body?.commercial_eligible===false,
  "provisional signed state verified":()=>body?.ok===true&&
   body?.verification_status==="PROVISIONAL_RESEARCH_ONLY",
  "end-to-end response under 10ms":r=>r.timings.duration<10,
 });
}
