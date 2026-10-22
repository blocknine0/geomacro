#!/usr/bin/env node
// Real protected D1 research and Worker secret-name census, no source secrets.
// Not partner sign-off or migration of the 10 old Edge Function callers.
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {runContinuityCheck} from "./verify-predge-pilot-continuity.mjs";
const REF="ldpwajisioljyjtojvfx",OUTPUT="artifacts/legacy-exit/edge-predge-d1-caller-acceptance.json";
const EDGE_SLUGS=["live-gdelt-ingest","live-structure-intelligence","live-flash-ingest",
 "live-flash-corroborate","public-risk-indices","public-early-warning",
 "gro-archive-read","gro-archive-maintain","raw-snapshot-read","archive-verify-read"];
const out={schema:"geomacro.legacy-edge-predge-no-funds-caller-census.v1",
 source_project:REF,
 preserved_deployed_function_sources:10,
 predge_research_authenticated_d1:false,
 predge_partner_independent_cutover_accepted:false,
 cloudflare_worker_secret_name_inventory_verified:false,
 deployed_edge_secret_parity_verified:false,
 all_ten_old_edge_callers_migrated:false,
 old_supabase_deletion_authorized:false,
 payments:0,source_supabase_writes:0,source_storage_deletions:0,
 status:"BLOCKED_NO_DELETION"};
function emit(code){out.reason=code;mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(out,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(out))}
function grepFiles(needle){
 const r=spawnSync("git",["grep","-l","--fixed-strings",needle,"--","src","server","workers"],{
 encoding:"utf8",maxBuffer:200000,timeout:25000,stdio:["ignore","pipe","pipe"]});
 if(r.status!==0&&r.status!==1)return null;
 return r.stdout.split("\n").map(x=>x.trim()).filter(Boolean);
}
async function main(){
 const account=process.env.CLOUDFLARE_ACCOUNT_ID??"";
 const token=process.env.CLOUDFLARE_API_TOKEN??"";
 if(!/^[a-f0-9]{32}$/u.test(account)||!token)
   return emit("PROTECTED_CLOUDFLARE_ACCOUNT_CONFIG_MISSING");
 const edges={};
 for(const slug of EDGE_SLUGS){
  const names=grepFiles(slug);
  if(!names)return emit("EDGE_CALLER_SOURCE_CENSUS_FAILED");
  edges[slug]={repo_runtime_source_reference_files:names.length,
   code_scan_is_not_live_caller_acceptance:true};
 }
 out.old_edge_slug_source_reference_counts=Object.fromEntries(
  EDGE_SLUGS.map(slug=>[slug,edges[slug].repo_runtime_source_reference_files]));
 const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+
  account+"/workers/scripts/geomacro-control-plane/secrets",{
   headers:{Authorization:"Bearer "+token},redirect:"error",
   signal:AbortSignal.timeout(20000)}).catch(()=>null);
 if(response?.ok){
  const parsed=await response.json().catch(()=>null);
  const list=parsed?.result;
  if(parsed?.success===true&&Array.isArray(list)&&list.length<=150&&
    list.every(x=>typeof x.name==="string"&&/^[A-Z0-9_]{3,128}$/.test(x.name))){
   const names=new Set(list.map(x=>x.name));
   const expected=["PREDGE_RESEARCH_NEWS_TOKEN","CONTROL_PLANE_TOKEN"];
   out.cloudflare_worker_secret_name_inventory_verified=true;
   out.cloudflare_predge_research_secret_name_present=names.has(expected[0]);
   out.cloudflare_admin_secret_name_present=names.has(expected[1]);
   out.cloudflare_predge_risk_gate_secret_name_present=names.has("PREDGE_RISK_GATE_TOKEN");
   // No value or fingerprint from Cloudflare secret is ever read or logged.
  }
 }
 const bearer=String(process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE??"");
 if(!/^[a-f0-9]{64}$/.test(bearer)){
  out.status="BLOCKED_NO_DELETION";
  return emit("PROTECTED_PREDGE_RESEARCH_CREDENTIAL_NOT_PROVIDED");
 }
 let receipt;
 try{receipt=await runContinuityCheck(bearer)}
 catch{return emit("PREDGE_AUTHENTICATED_D1_LIVE_CONTRACT_OR_PUBLIC_PARITY_FAILED")}
 if(receipt.authenticated_research_verified!==true||
   receipt.shared_d1_items_verified!==true||
   receipt.supabase_requests!==0||receipt.payments!==0||
   receipt.paid_launch_approved!==false||receipt.execution_authorized!==false)
   return emit("PREDGE_LIVE_RESEARCH_BOUNDARY_NOT_ACCEPTED");
 out.predge_research_authenticated_d1=true;
 out.predge_category_counts=receipt.category_counts;
 out.predge_pilot_end=receipt.pilot_end;
 out.predge_signed_risk_gate_ready=receipt.signed_risk_gate_ready;
 out.status="PREDGE_D1_RESEARCH_VERIFIED_OLD_EDGE_CALLER_CUTOVER_PENDING";
 emit("RUNTIME_EDGE_SECRETS_CUSTOMER_IDENTITY_AND_EXTERNAL_PARTNER_SIGNOFF_PENDING");
}
try{await main()}catch{emit("EDGE_PREDGE_PRIVATE_DIAGNOSTIC_UNAVAILABLE")}
