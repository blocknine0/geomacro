#!/usr/bin/env node
/**
 * GeoMacro no-funds Worker version-promotion preflight.
 * Read-only provider API checks: never issues a deployment, D1 SQL or payment.
 * An uploaded version is not the same as a deployed version. Unknown = HOLD.
 */
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {checkD1BundledWork} from "./plan-d1-bundled-work.mjs";
import {SPEND_POLICY_VERIFICATION_ENFORCED} from "../lib/cloudflare-five-usd-spend-guard.mjs";
import {evaluateOwnerD1DailyEnvelope} from "../lib/d1-owner-daily-envelope.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{40}$/;
const STAGES=[0,1,5,25,50,100];
const OWNER_POLICY=JSON.parse(readFileSync(
 new URL("../../config/geomacro-cloudflare-five-usd-budget.json",import.meta.url),"utf8"
)).d1_budget_policy;

export function readBindings(version){
 const raw=version?.resources?.bindings;
 if(!raw||typeof raw!=="object")throw Error("VERSION_BINDINGS_MISSING");
 const rows=Array.isArray(raw)?raw:
  Object.entries(raw).flatMap(([kind,value])=>Array.isArray(value)?
   value.map(x=>({...x,type:x.type??kind})):value&&typeof value==="object"&&value.name?
    [{...value,type:value.type??kind}]:[]);
 if(!rows.length||rows.some(x=>!x?.name||!x?.type))throw Error("VERSION_BINDINGS_UNREADABLE");
 const seen=new Set();
 for(const x of rows){
  if(seen.has(x.name))throw Error("VERSION_DUPLICATE_BINDING");
  seen.add(x.name);
 }
 return rows.map(x=>({name:x.name,type:x.type})).sort((a,b)=>a.name.localeCompare(b.name));
}
function deploymentVersions(v){
 const rows=v?.deployments?.[0]?.versions;
 if(!Array.isArray(rows)||rows.length<1||rows.length>2)throw Error("DEPLOYMENT_UNKNOWN");
 if(rows.some(x=>!UUID.test(x.version_id??"")||
  !Number.isFinite(Number(x.percentage))))throw Error("DEPLOYMENT_VERSION_INVALID");
 if(Math.abs(rows.reduce((s,x)=>s+Number(x.percentage),0)-100)>0.001)
  throw Error("DEPLOYMENT_PERCENTAGE_INVALID");
 return rows;
}
function annotation(version){
 const a=version?.annotations??version?.metadata?.annotations??{};
 return a["workers/message"]??version?.metadata?.message??"";
}
export function assessWorkerPromotion({
 deployment,baselineVersion,candidateVersion,baselineId,candidateId,
 targetPercent,sourceSha,quota,now=new Date(),spendPolicyEnforced=SPEND_POLICY_VERIFICATION_ENFORCED
}){
 const refuse=(reason,detail={})=>Object.freeze({
  schema:"geomacro.hot50.protected-worker-promotion.v1",
  checked_at:now.toISOString(),stage:"READ_ONLY",eligible:false,reason,
  target_percent:targetPercent,provider_mutations:0,payments:0,...detail
 });
 try{
  if(!SHA.test(sourceSha)||!UUID.test(baselineId)||!UUID.test(candidateId)||
     baselineId===candidateId||!STAGES.includes(targetPercent))
   return refuse("INVALID_PROMOTION_INPUT");
  const preceding=STAGES.indexOf(targetPercent)===0?-1:STAGES[STAGES.indexOf(targetPercent)-1];
  const versions=deploymentVersions(deployment);
  const observedBaseline=versions.find(x=>x.version_id.toLowerCase()===baselineId.toLowerCase());
  const observedCandidate=versions.find(x=>x.version_id.toLowerCase()===candidateId.toLowerCase());
  if(preceding===-1){
   if(versions.length!==1||Number(observedBaseline?.percentage)!==100)
    return refuse("BASELINE_NOT_100_PERCENT");
  }else{
   if(versions.length!==2||Number(observedCandidate?.percentage)!==preceding||
      Number(observedBaseline?.percentage)!==100-preceding)
    return refuse("CURRENT_SPLIT_NOT_PREVIOUS_STAGE");
  }
  if(baselineVersion?.id!==baselineId||candidateVersion?.id!==candidateId)
   return refuse("VERSION_IDENTITY_UNVERIFIED");
  const note=annotation(candidateVersion);
  // GET Version API can omit upload annotations. If returned, verify them;
  // otherwise the provider-returned immutable GEOMACRO_SOURCE_SHA binding
  // and version-directed /health are the authoritative checks.
  if(note&&!note.includes("geomacro-main:"+sourceSha))
   return refuse("CANDIDATE_MAIN_SHA_ANNOTATION_MISMATCH");
  const oldBindings=readBindings(baselineVersion);
  const newBindings=readBindings(candidateVersion);
  if(JSON.stringify(oldBindings)!==JSON.stringify(newBindings))
   return refuse("VERSION_BINDING_PARITY_MISMATCH");
  for(const required of ["DB","INGEST_QUEUE","SOURCE_POLL_QUEUE",
   "CONTROL_PLANE_TOKEN","RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64",
   "RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64",
   "RISK_GATE_DECISION_ED25519_KEY_ID"]){
    if(!newBindings.some(x=>x.name===required))
     return refuse("PROTECTED_BINDING_MISSING");
  }
  const findVar=name=>{
   const raw=candidateVersion?.resources?.bindings;
   // Unknown response layout or invisible value is not proof that a
   // production feature flag is enabled.
   if(!Array.isArray(raw))return null;
   const v=raw.find(x=>x.name===name);
   return typeof v?.text==="string"?v.text:
    typeof v?.value==="string"?v.value:null;
  };
  if(findVar("GEOMACRO_SOURCE_SHA")!==sourceSha||
     findVar("RISK_GATE_COUNTRY_SCOPE")!=="HOT50"||
     findVar("GEOMACRO_P0B_ADMISSION_ACTIVE")!=="1"||
     findVar("GEOMACRO_P1_BUNDLED_LEASES_ENABLED")!=="1")
   return refuse("CANDIDATE_HOT50_P1_RUNTIME_BINDING_UNVERIFIED");
  if(quota?.day_utc!==now.toISOString().slice(0,10))
   return refuse("PROVIDER_UTC_DAY_RECEIPT_STALE_OR_MISSING");
  const limits=quota?.owner_d1_utc_daily_targets;
  if(limits?.rows_read!==140000||limits?.rows_written!==140000||
     limits?.normal_rows_read!==120000||limits?.normal_rows_written!==120000||
     limits?.emergency_rows_read!==20000||limits?.emergency_rows_written!==20000||
     limits?.emergency_auto_admission!==false)
   return refuse("OWNER_140K_POLICY_UNVERIFIED");
  if(quota?.workers_paid_subscription_verified!==true)
   return refuse("WORKERS_PAID_UNVERIFIED");
  if(spendPolicyEnforced&&!(
   quota?.paid_capacity_probe_status==="VERIFIED"&&
   quota?.paid_capacity_verified_by_provider===true))
   return refuse("SPEND_POLICY_UNVERIFIED");
  const env=evaluateOwnerD1DailyEnvelope({
   observedRowsRead:quota?.observed_rows_read,
   observedRowsWritten:quota?.observed_rows_written,
   now,policy:OWNER_POLICY
  });
  if(env.held||quota?.state==="HELD"||quota?.owner_d1_utc_budget_held)
   return refuse("OWNER_D1_BUDGET_HELD",{
    observed_rows_read:quota?.observed_rows_read??null,
    observed_rows_written:quota?.observed_rows_written??null
   });
  return Object.freeze({
   schema:"geomacro.hot50.protected-worker-promotion.v1",
   checked_at:now.toISOString(),stage:"READ_ONLY",eligible:true,
   reason:"ELIGIBLE_FOR_EXPLICIT_NO_FUNDS_STAGE",
   source_sha:sourceSha,previous_percent:preceding,target_percent:targetPercent,
   baseline_id:baselineId,candidate_id:candidateId,bindings_checked:newBindings.length,
   observed_rows_read:quota.observed_rows_read,observed_rows_written:quota.observed_rows_written,
   provider_mutations:0,payments:0
  });
 }catch{return refuse("PROVIDER_RECEIPT_UNREADABLE");}
}
async function providerGet(env,path,fetchImpl=fetch){
 const root="https://api.cloudflare.com/client/v4/accounts/"+env.CLOUDFLARE_ACCOUNT_ID;
 const response=await fetchImpl(root+path,{headers:{
  Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,Accept:"application/json"
 },redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
 const body=await response.json();
 if(!response.ok||body?.success!==true||!body.result)
  throw Error("PROVIDER_RECEIPT_UNAVAILABLE");
 return body.result;
}
export async function inspectPromotion({
 env=process.env,fetchImpl=fetch,plan=checkD1BundledWork,now=new Date()
}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  env.GITHUB_REF!=="refs/heads/main"||
  !SHA.test(env.GITHUB_SHA??"")||
  !existsSync("config/d1-hotspot-v2-canary.hold")||
  !/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
  (env.CLOUDFLARE_API_TOKEN??"").length<20||
  (env.CLOUDFLARE_BILLING_READ_TOKEN??"").length<20)
  throw Error("PROTECTED_MAIN_PROVIDER_IDENTITY_REQUIRED");
 const baselineId=env.BASELINE_VERSION_ID,candidateId=env.CANDIDATE_VERSION_ID;
 const targetPercent=Number(env.TARGET_PERCENT);
 if(!UUID.test(baselineId??"")||!UUID.test(candidateId??"")||
    !STAGES.includes(targetPercent))throw Error("INVALID_STAGE_INPUT");
 const name="geomacro-control-plane";
 const [deployment,baselineVersion,candidateVersion,quota]=await Promise.all([
  providerGet(env,"/workers/scripts/"+name+"/deployments?per_page=1",fetchImpl),
  providerGet(env,"/workers/scripts/"+name+"/versions/"+baselineId,fetchImpl),
  providerGet(env,"/workers/scripts/"+name+"/versions/"+candidateId,fetchImpl),
  plan({env,fetchImpl,now})
 ]);
 const result=assessWorkerPromotion({
  deployment,baselineVersion,candidateVersion,baselineId,candidateId,
  targetPercent,sourceSha:env.GITHUB_SHA,quota,now
 });
 mkdirSync("artifacts/protected-canary",{recursive:true});
 writeFileSync("artifacts/protected-canary/worker-promotion-preflight.json",
  JSON.stringify(result,null,2)+"\n");
 if(!result.eligible)throw Error(result.reason);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const result=await inspectPromotion();console.log(JSON.stringify(result));}
 catch(e){console.error("PROTECTED_WORKER_PROMOTION_HELD:"+e.message);process.exitCode=1;}
}
