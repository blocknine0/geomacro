import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {verifyRiskIndicesLiveContinuity} from "../ops/verify-risk-indices-live-continuity.mjs";

const NOW=Date.parse("2026-10-28T15:00:00.000Z");
const asOf=new Date(NOW-10*60_000).toISOString();
const sha=s=>createHash("sha256").update(s).digest("hex");
const categories=[["geopolitics","geopolitics"],["macro","macro"],["critical_minerals","rare_earth"]];
function fixture(){
 const value={schema:"geomacro.public-risk-indices-live.v1",
  source_project:"ldpwajisioljyjtojvfx",
  generated_at:new Date(NOW-2*60_000).toISOString(),
  data:{contractVersion:"risk-indices-v1.1.0",
   parentMethodologyVersion:"gri-v1.2.0",
   proofScope:"verified-category-projection",
   verificationStatus:"verified",
   snapshotId:"original-indices-123",snapshotAsOf:asOf,proofHash:"a".repeat(64),
   indices:categories.map(([key,sourceCategory])=>({key,sourceCategory,
    status:"available",readingStatus:"current",readingAsOf:asOf,
    readingSnapshotId:"original-indices-123",score:57,rawScore:57,
    series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{}]}}
   }))}};
 const raw=JSON.stringify(value);
 const hot={ok:true,product:"risk-indices",schema:value.schema,
  proof_schema:"geomacro.public-risk-indices-live-proof.v1",
  verification_mode:"direct-b2-readback",
  b2_object_key:"geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
  full_b2_readback_verified:true,current_b2_readback_verified:true,
  exact_gzip_restore_verified:true,b2_sha256:"b".repeat(64),
  payload_sha256:sha(raw),payload_json:raw,source_as_of:asOf,
  expires_at:new Date(NOW+90*60_000).toISOString()};
 return {value,hot};
}
function reader(hot,value,headers={}){
 const calls=[];
 const fetchImpl=async url=>{
  calls.push(url);
  if(String(url).includes("hot-snapshot/risk-indices"))
   return Response.json(hot);
  if(String(url).includes("geomacro-risk-indices."))
   return Response.json(value,{headers:{
    "x-geomacro-authority":"backblaze-b2-risk-indices-edge",
    "x-geomacro-native-clock-contract":"live-60m-v1",
    "x-geomacro-source-as-of":asOf,...headers
   }});
  throw Error("UNEXPECTED_URL");
 };
 return {fetchImpl,calls};
}
test("independent D1->edge live certified exact-package proof, no funds or private originals",async()=>{
 const {hot,value}=fixture(),r=reader(hot,value);
 const proof=await verifyRiskIndicesLiveContinuity({now:NOW,fetchImpl:r.fetchImpl});
 assert.equal(proof.ok,true);
 assert.equal(proof.three_independent_indices_verified,true);
 assert.equal(proof.exact_d1_edge_payload_sha256,hot.payload_sha256);
 assert.equal(proof.raw_sources_logged,false);
 assert.equal(proof.supabase_requests,0);
 assert.equal(proof.payment_transactions,0);
 assert.equal(r.calls.length,2);
});
test("all mismatches, fabricated values, old clocks and missing categories fail before claiming edge parity",async()=>{
 for(const change of [
  ({hot})=>{hot.full_b2_readback_verified=false;},
  ({hot})=>{hot.payload_json+='tampered';},
  ({hot})=>{hot.expires_at=new Date(NOW-1).toISOString();},
  ({value})=>{value.data.indices.pop();},
  ({value})=>{value.data.indices[0].status="unavailable";},
  ({value})=>{value.data.indices[0].readingAsOf=new Date(NOW-70*60_000).toISOString();},
  ({value})=>{value.data.indices[0].score=null;},
  ({value})=>{value.data.indices[1].series["7D"].buckets=[];},
  ({value})=>{value.data.verificationStatus="internally-scored";},
  ({value})=>{value.data.proofHash="fake";},
 ]){
  const {hot,value}=fixture();
  change({hot,value});
  const r=reader(hot,value);
  await assert.rejects(()=>verifyRiskIndicesLiveContinuity({now:NOW,fetchImpl:r.fetchImpl}),
   /INDICES_LIVE_CONTINUITY_/);
 }
 const {hot,value}=fixture();
 await assert.rejects(()=>verifyRiskIndicesLiveContinuity({
  now:NOW,fetchImpl:reader(hot,value,{"x-geomacro-authority":"not-a-risk-authority"}).fetchImpl
 }),/EDGE_AUTHORITY/);
});
test("production workflow runs the strict live edge proof only after signed publication",()=>{
 const w=readFileSync(new URL("../../.github/workflows/risk-indices-verified-d1-parent.yml",import.meta.url),"utf8");
 const publish=w.indexOf("Promote only genuinely current verified parent");
 const verify=w.indexOf("Verify live Risk Indices edge exact D1 readback");
 assert.ok(publish>0 && verify>publish);
 assert.match(w,/node scripts\/ops\/verify-risk-indices-live-continuity\.mjs/u);
 assert.match(w,/scripts\/lib\/risk-indices-live-continuity\.test\.mjs/u);
 for(const denied of ["src/components/","src/routes/risk-indices.tsx","PREDGE_RISK_GATE_TOKEN",
  "GEOMACRO_MACHINE_FACTS_PRIVATE","COINBASE_API_KEY"])
  assert.equal(w.includes(denied),false);
});
