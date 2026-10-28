import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {observeRiskIndicesContinuity,safeIndicesWatchSummary} from "../ops/observe-risk-indices-continuity.mjs";

const NOW=Date.parse("2026-10-28T15:00:00.000Z");
const asOf=new Date(NOW-10*60_000).toISOString();
const hash=x=>createHash("sha256").update(x).digest("hex");
function parent(){
 const r=()=>({readingStatus:"current",readingAsOf:asOf,
  series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{}]}}});
 const value={schema:"geomacro.public-global-risk-live.v1",
  source_project:"ldpwajisioljyjtojvfx",
  generated_at:new Date(NOW-2*60_000).toISOString(),
  data:{snapshotAsOf:asOf,methodologyVersion:"gri-v1.2.0",
   verificationStatus:"verified",auditPersisted:true,
   proofHash:"a".repeat(64),evidenceHash:"b".repeat(64),calculationHash:"c".repeat(64),
   domainIndices:{geopolitics:r(),macro:r(),rare_earth:r()}}};
 const json=JSON.stringify(value);
 return {ok:true,product:"global-risk",schema:value.schema,
  proof_schema:"geomacro.public-global-risk-live-proof.v1",
  verification_mode:"direct-b2-readback",
  b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
  full_b2_readback_verified:true,exact_gzip_restore_verified:true,
  b2_sha256:"d".repeat(64),payload_sha256:hash(json),payload_json:json,
  source_as_of:asOf,generated_at:value.generated_at,
  expires_at:new Date(NOW+90*60_000).toISOString()};
}
const env={};
function fetchParent(p=parent(),http=200){
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push({url,method:options.method});
  return Response.json(p,{status:http});
 };
 return {fetchImpl,calls};
}
const verified=async()=>({ok:true,three_independent_indices_verified:true,
 edge_readback_verified:true,d1_readback_verified:true});
const failed=async()=>{throw Error("EDGE_UNAVAILABLE")};
test("genuine reviewed parent plus exact independently validated D1/Edge three indices is green",async()=>{
 const f=fetchParent();
 const r=await observeRiskIndicesContinuity({now:NOW,env,fetchImpl:f.fetchImpl,verifier:verified});
 assert.equal(r.status,"CURRENT_SIGNED_THREE_INDICES_VERIFIED");
 assert.equal(r.current_signed_numerical_parent_verified,true);
 assert.equal(r.current_three_indices_public_d1_edge_verified,true);
 assert.equal(r.payments,0);
 assert.equal(f.calls.length,1);
});
test("fresh authenticated parent but unavailable index edge fails as actionable delivery incident",async()=>{
 const r=await observeRiskIndicesContinuity({now:NOW,env,
  fetchImpl:fetchParent().fetchImpl,verifier:failed});
 assert.equal(r.status,"CURRENT_SIGNED_PARENT_INDICES_DELIVERY_NOT_VERIFIED");
 assert.equal(r.safe_operational_action,"EXISTING_GUARDED_INDICES_REPAIR_AND_EDGE_ACCEPTANCE");
 assert.match(safeIndicesWatchSummary(r),/NOT VERIFIED/);
});
test("no independent reviewer inputs never signs or upgrades internal research into certified parent",async()=>{
 for(const p of [null,{ok:true,product:"global-risk"},{...parent(),source_as_of:new Date(NOW-4*3600_000).toISOString()}]){
  const r=await observeRiskIndicesContinuity({now:NOW,env,
   fetchImpl:fetchParent(p).fetchImpl,verifier:failed});
  assert.equal(r.status,"NO_CURRENT_SIGNED_GRI_PARENT");
  assert.equal(r.current_signed_numerical_parent_verified,false);
  assert.equal(r.genuine_reviewed_input_pointer_present,false);
  assert.equal(r.d1_writes,0);
  assert.equal(r.b2_direct_requests,0);
  assert.equal(r.payments,0);
  assert.doesNotMatch(JSON.stringify(r),/ed25519_private/i);
 }
});
test("unavailable D1 parent is distinguished from absent signed reviewer without false source claims",async()=>{
 const r=await observeRiskIndicesContinuity({now:NOW,env,
  fetchImpl:fetchParent(null,503).fetchImpl,verifier:failed});
 assert.equal(r.status,"PARENT_HTTP_UNAVAILABLE");
 assert.equal(r.current_three_indices_public_d1_edge_verified,false);
});
test("SHA hints alone cannot authorize a current signed score, and no details leak to summary",async()=>{
 const r=await observeRiskIndicesContinuity({now:NOW,
  env:{GRI_READY_REVIEWED_SHA256:"a".repeat(64),
   GRI_READY_CERTIFICATES_SHA256:"b".repeat(64),
   GRI_READY_APPROVED_AT:new Date(NOW-5*60_000).toISOString()},
  fetchImpl:fetchParent(null).fetchImpl,verifier:failed});
 assert.equal(r.genuine_reviewed_input_pointer_present,true);
 assert.equal(r.current_signed_numerical_parent_verified,false);
 const summary=safeIndicesWatchSummary(r);
 assert.doesNotMatch(summary,/[a-f0-9]{64}/);
 assert.equal(summary.includes("REVIEWED_CERTIFICATES_SHA256"),false);
});
test("existing no-funds recovery workflow runs watcher without adding another cron or touching public site",()=>{
 const wf=readFileSync(new URL("../../.github/workflows/risk-indices-verified-parent-backstop.yml",import.meta.url),"utf8");
 assert.equal((wf.match(/cron:/g)??[]).length,1);
 assert.match(wf,/node scripts\/ops\/observe-risk-indices-continuity\.mjs/u);
 assert.match(wf,/scripts\/lib\/risk-indices-continuity-watchdog\.test\.mjs/u);
 assert.doesNotMatch(wf,/COINBASE_API_KEY|PREDGE_RISK_GATE_TOKEN|src\/routes\/risk-indices\.tsx/u);
});

test("main push read-only acceptance is separate from protected review and does not request publication",()=>{
 const workflow=readFileSync(new URL("../../.github/workflows/risk-indices-verified-parent-backstop.yml",import.meta.url),"utf8");
 const job=workflow.split("  read-only-acceptance-on-main-update:")[1]?.split("  dispatch-only-after-verified-parent:")[0]??"";
 assert.ok(job.includes("github.event_name == 'push'"));
 assert.ok(job.includes("github.ref == 'refs/heads/main'"));
 assert.ok(job.includes("node scripts/ops/observe-risk-indices-continuity.mjs"));
 assert.ok(job.includes("persist-credentials: false"));
 assert.ok(job.includes("test \"$EXPECTED_CANONICAL_MAIN_SHA\" = \"$(git rev-parse HEAD)\""));
 assert.ok(job.includes("contents: read"));
 for(const forbidden of ["secrets.", "actions: write", "dispatch-gri-", "publish-supabase-free-global-risk",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY", "PREDGE", "COINBASE"])
  assert.equal(job.includes(forbidden),false);
});
