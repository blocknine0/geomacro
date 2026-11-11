import test from "node:test";
import assert from "node:assert/strict";
import {verifyLiveIndicesBody,probeWarmRiskIndices}
 from "../ops/probe-risk-indices-warm-http.mjs";

const NOW=Date.parse("2026-11-12T00:00:00.000Z");
const stamp=new Date(NOW-1000).toISOString();
const body={ok:true,data:{
 contractVersion:"risk-indices-v1.1.0",
 parentMethodologyVersion:"gri-v1.2.0",
 verificationStatus:"verified",proofHash:"a".repeat(64),
 snapshotAsOf:stamp,
 indices:["geopolitics","macro","critical_minerals"].map(key=>({
  key,status:"available",readingStatus:"current",readingAsOf:stamp,score:50,
  series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{}]}}
 }))
}};
test("outside-in scorecard PASS requires genuinely current three-domain contract",async()=>{
 assert.equal(verifyLiveIndicesBody(body,NOW),true);
 let t=0;
 const result=await probeWarmRiskIndices({now:()=>NOW,clock:()=>t+=4,
  fetchImpl:async()=>Response.json(body),
  verifyParent:async()=>({ok:true,three_independent_indices_verified:true,
   b2_readback_verified:true,d1_readback_verified:true,
   edge_readback_verified:true})});
 assert.equal(result.results.length,2);
 for(const x of result.results){
  assert.equal(x.status,"PASS_VERIFIED_PARENT_HTTP_AND_P95");
  assert.equal(x.p95_ms,4);
  assert.equal(x.measured_warm_count,6);
 }
 assert.equal(result.scored_gri_synthesized,false);
});
test("stale unsigned, incomplete or forged index is NEVER a warm cache PASS",async()=>{
 assert.equal(verifyLiveIndicesBody({...body,data:{...body.data,proofHash:"missing"}},NOW),false);
 assert.equal(verifyLiveIndicesBody({...body,data:{...body.data,snapshotAsOf:"2026-10-01T00:00:00Z"}},NOW),false);
 assert.equal(verifyLiveIndicesBody({...body,data:{...body.data,indices:body.data.indices.slice(0,2)}},NOW),false);
 const result=await probeWarmRiskIndices({now:()=>NOW,clock:()=>100,
  fetchImpl:async()=>Response.json({ok:false},{status:503}),
  verifyParent:async()=>{throw Error("PARENT_UNAVAILABLE")}});
 for(const x of result.results){
  assert.equal(x.status,"HOLD_UNVERIFIED_PARENT_OR_HTTP_OR_SLO");
  assert.equal(x.http_current_three_domain_contract_verified,false);
  assert.equal(x.independent_b2_d1_edge_parent_continuity_verified,false);
  assert.equal(x.p95_ms,null);
 }
});

test("valid-looking three-domain JSON never passes without independent D1/B2 proof",async()=>{
 let t=0;
 const report=await probeWarmRiskIndices({now:()=>NOW,clock:()=>t+=5,
  fetchImpl:async()=>Response.json(body),
  verifyParent:async()=>({ok:false})});
 assert.ok(report.results.every(x=>x.status==="HOLD_UNVERIFIED_PARENT_OR_HTTP_OR_SLO"));
 assert.ok(report.results.every(x=>x.http_current_three_domain_contract_verified===true));
 assert.ok(report.results.every(x=>x.independent_b2_d1_edge_parent_continuity_verified===false));
});
