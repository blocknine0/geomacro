#!/usr/bin/env node
/**
 * Non-vacuous Hot50 20-minute source transport acceptance (no D1, B2 or funds).
 * The existing two mutually exclusive protected collectors MUST execute at
 * least one actual publisher sweep for a scheduled/dispatch workflow PASS.
 * Source runtime evidence is not a B2/GRO/RiskGate coverage certificate.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const iso=d=>typeof d==="string"?Date.parse(d):NaN;
export function inspectHot50ActualSourceHealth(proof,{mode,now=Date.now()}={}){
 const held=reason=>({schema:"geomacro.hot50.source-sweep-acceptance.v1",
  accepted:false,reason,mode,d1_mutations_allowed:false,
  b2_physical_parity_proven:false,signed_risk_gate_150_cells_proven:false,
  payments_enabled:false});
 if(!Number.isFinite(now)||!["ADMITTED","HELD"].includes(mode)||
  proof?.schema!=="geomacro.direct20m.sourcewise-health.v1"||
  !Number.isSafeInteger(proof?.source_endpoints_configured)||
  proof.source_endpoints_configured<1||proof.source_endpoints_configured>512||
  !Number.isSafeInteger(proof?.source_category_checks_expected)||
  !Number.isSafeInteger(proof?.category_checks_with_runtime_state)||
  proof.category_checks_with_runtime_state<1||
  proof.category_checks_with_runtime_state>proof.source_category_checks_expected||
  !Array.isArray(proof?.sources)||
  proof.sources.length!==proof.source_category_checks_expected||
  proof.original_article_urls_included!==false||
  proof.raw_article_content_included!==false||
  proof.producer_publication_success_not_inferred!==true)
  return held("HOT50_PUBLISHER_RUNTIME_RECEIPT_UNVERIFIED");
 const checked=iso(proof.checked_at);
 if(!Number.isFinite(checked)||checked>now+30000||now-checked>20*60000)
  return held("HOT50_PUBLISHER_SWEEP_TIMESTAMP_INVALID");
 const actual=proof.sources.filter(row=>row?.transport_parser_state!=="NOT_CHECKED");
 if(actual.length!==proof.category_checks_with_runtime_state||
  actual.some(row=>typeof row.source_id!=="string"||!row.source_id||
    !CATEGORIES.has(row.category)||
    typeof row.transport_parser_state!=="string"||
    row.transport_parser_state.length<2||
    "url" in row||"original_url" in row||"article_url" in row))
  return held("HOT50_SOURCE_PER_CATEGORY_RUNTIME_STATES_INVALID");
 // Must have live native publisher checks across all three business categories,
 // even if the publisher returned EMPTY or DENIED (not a successful event).
 const covered=new Set(actual.map(row=>row.category));
 if(covered.size!==3)return held("HOT50_THREE_CATEGORY_SWEEP_INCOMPLETE");
 if(mode==="HELD"&&
   (proof.d1_selected_batch_readback_verified!==false||
    proof.b2_original_archive_readback_verified!==false))
  return held("HOT50_HELD_SPOOL_CLAIMS_FORBIDDEN_ACK");
 if(mode==="ADMITTED"&&
   (typeof proof.d1_selected_batch_readback_verified!=="boolean"||
    typeof proof.b2_original_archive_readback_verified!=="boolean"))
  return held("HOT50_ADMITTED_READBACK_BOOLEAN_REQUIRED");
 return {schema:"geomacro.hot50.source-sweep-acceptance.v1",
  accepted:true,reason:"HOT50_NATIVE_SOURCE_CHECKS_ACTUALLY_EXECUTED",
  mode,source_endpoints_configured:proof.source_endpoints_configured,
  category_states_checked:actual.length,
  categories_with_runtime_checks:[...covered].sort(),
  d1_originals_readback_verification:mode==="ADMITTED"?
    proof.d1_selected_batch_readback_verified:false,
  source_transport_attempted:true,all_sources_success_not_claimed:true,
  all_150_fresh_country_category_cells_not_proven:true,
  b2_physical_parity_proven:false,signed_risk_gate_150_cells_proven:false,
  payments_enabled:false,extra_d1_reads:0,extra_d1_writes:0,
  source_content_logged:false};
}
export function inspectHot50ScheduledRun(needs,{event}={}){
 const res=k=>needs?.[k]?.result??"";
 const reply=(ok,reason,lane)=>({schema:"geomacro.hot50.scheduled-runtime.v1",
  accepted:ok,reason,executed_lane:lane??null,
  source_fetch_verified_only_by_per_job_proof:ok,
  b2_physical_parity_proven:false,signed_risk_gate_150_cells_proven:false,
  payments_enabled:false,extra_d1_reads:0,extra_d1_writes:0});
 if(!["schedule","workflow_dispatch"].includes(event))
  return reply(false,"HOT50_NOT_A_PRODUCTION_SOURCE_SCHEDULE",null);
 if(res("source-contract")!=="success")
  return reply(false,"HOT50_SOURCE_CONTRACT_FAILED",null);
 const admitted=res("collect-direct-20m");
 const held=res("encrypted-held-three-domain-20m");
 const quota=res("quota-admission");
 if(!["success","failure","skipped"].includes(quota))
  return reply(false,"HOT50_QUOTA_PROVIDER_RUN_UNAVAILABLE",null);
 if(admitted==="success"&&held==="skipped"&&quota==="success")
  return reply(true,"HOT50_ADMITTED_SOURCE_SWEEP_EXECUTED","ADMITTED");
 if(held==="success"&&["failure","skipped"].includes(admitted))
  return reply(true,"HOT50_ENCRYPTED_HELD_SOURCE_SWEEP_EXECUTED","HELD");
 return reply(false,"HOT50_NO_EXCLUSIVE_COMPLETED_SOURCE_SWEEP",null);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv[2]==="--source-health"&&process.argv.length===4){
   // File selection and path validation remain in GitHub's protected shell.
   // The verifier consumes only an already-open stdin descriptor; no
   // externally controlled path reaches a filesystem API.
   const result=inspectHot50ActualSourceHealth(JSON.parse(
    readFileSync(0,"utf8")),{mode:process.argv[3]});
   console.log(JSON.stringify(result));
   if(!result.accepted)process.exitCode=2;
  }else if(process.argv[2]==="--scheduled-run"&&process.argv.length===3){
   const result=inspectHot50ScheduledRun(JSON.parse(
    process.env.GEOMACRO_HOT50_NEEDS_JSON??"{}"),{
    event:process.env.GITHUB_EVENT_NAME});
   console.log(JSON.stringify(result));
   if(!result.accepted)process.exitCode=3;
  }else throw Error("HOT50_CONTINUITY_PROOF_ARGUMENTS_INVALID");
 }catch{
  console.error(JSON.stringify({schema:"geomacro.hot50.continuity-verification.v1",
   accepted:false,error:"HOT50_PROOF_UNVERIFIED",payments_enabled:false,
   d1_write_authorized:false}));
  process.exitCode=4;
 }
}
