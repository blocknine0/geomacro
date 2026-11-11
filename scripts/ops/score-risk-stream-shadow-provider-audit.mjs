#!/usr/bin/env node
/**
 * Fail-closed provider shadow acceptance scorecard. Only the verified private
 * shadow receipts count; queued INDEX_ONLY hints cannot satisfy GRO acceptance.
 * Never removes canary hold, authorizes customer traffic or raises B2 quotas.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
function read(name){
 try{return JSON.parse(readFileSync(".shadow-audit/"+name,"utf8"))}
 catch{return null}
}
const meta=read("metadata.json");
const gov=read("b2-governor-parity.json");
const candidate=read("candidate-governor-parity.json");
const tel=read("live-telemetry.json");
const n=x=>Number.isSafeInteger(x)&&x>=0?x:0;
const checks={
 isolated_shadow_resources:meta?.shadow_db==="geomacro-risk-stream-shadow"&&
  meta?.shadow_bucket==="geomacro-risk-stream-shadow-private"&&
  meta?.shadow_queue==="geomacro-risk-stream-shadow"&&
  meta?.shadow_dlq==="geomacro-risk-stream-shadow-dlq"&&
  meta?.commercial_delivery===false&&meta?.risk_stream_active===false,
 isolated_candidate_governor_policy_parity:
  candidate?.status==="SHADOW_CANDIDATE_D1_POLICY_MATCH"&&
  candidate?.source_sha===meta?.executed_commit&&
  candidate?.verified_route==="SHADOW_CANDIDATE_ISOLATED_WORKERS_DEV"&&
  candidate?.shadow_db==="geomacro-risk-stream-shadow"&&
  candidate?.unauthenticated_http_401_verified===true&&
  candidate?.cloudflare_deployed_candidate_readback===true&&
  candidate?.imported_production_quota_module===true&&
  candidate?.production_d1_ledger_verified===false&&
  candidate?.live_production_governor_parity_not_inferred===true&&
  candidate?.expected_b2_network_ops_for_shadow===0,
 observed_20_to_30_real_index_events:
  n(tel?.submitted_events)>=20&&n(tel?.submitted_events)<=30&&
  n(tel?.acknowledged_events)>=n(tel?.submitted_events),
 zero_observed_d1_503:tel?.d1_observed_503===0&&
  n(tel?.canonical_batch_receipts)>0,
 independent_attester_public_keys:meta?.independent_attester_keys===true,
 ten_signed_gros_with_d1_ed25519_readback:
  n(tel?.signed_gro_count)>=10&&
  n(tel?.verified_signature_readback_count)>=10&&
  tel?.independent_signed_gro_acceptance===true
};
const passed=Object.values(checks).every(Boolean);
const report={
 schema:"geomacro.shadow-provider-terminal-scorecard.v1",
 status:passed?"SHADOW_AUDIT_PASS":"HOLD_INCOMPLETE_SHADOW_PROOF",
 scope:"ISOLATED_SHADOW_ONLY_NO_FUNDS",
 production_live_governor_parity_verified:gov?.status==="D1_SHARED_GOVERNOR_MATCH"&&
  gov?.expected_b2_network_ops_for_shadow===0&&
  ["PRIMARY_CUSTOM_DOMAIN","PINNED_CONTROL_PLANE_WORKERS_DEV"].includes(gov?.verified_route),
 production_deployment_hold_not_bypassed:true,
 checks,observations:n(tel?.submitted_events),
 acknowledgements:n(tel?.acknowledged_events),
 observed_d1_503:tel?.d1_observed_503??null,
 d1_write_p95_ms:tel?.max_observed_batch_d1_write_p95_ms??null,
 signed_gros:n(tel?.signed_gro_count),
 verified_ed25519_readbacks:n(tel?.verified_signature_readback_count),
 customer_delivery:false,canary_hold_retained:true,
 backblaze_provider_usage_independently_verified:false
};
mkdirSync(".shadow-audit",{recursive:true});
writeFileSync(".shadow-audit/scorecard.json",JSON.stringify(report,null,2));
console.log("SHADOW_TERMINAL_SCORECARD "+JSON.stringify(report));
if(!passed)process.exitCode=1;
