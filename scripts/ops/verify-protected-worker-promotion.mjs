#!/usr/bin/env node
/**
 * GeoMacro no-funds Worker version-promotion preflight.
 * Read-only provider API checks: never issues a deployment, D1 SQL or payment.
 * An uploaded version is not the same as a deployed version. Unknown = HOLD.
 */
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {checkD1PaidMonthlyHeadroom,paidD1BillingCycle,
 D1_PAID_MONTHLY_POLICY} from "../lib/d1-workers-paid-monthly-governor.mjs";
import {assessReviewedAdditiveBindingParity,
 HOT50_INTAKE_PROFILE,HOT50_INTAKE_VARS,FAIL_CLOSED_RELEASE_VARS}
 from "../lib/canary-additive-binding-parity.mjs";
import {SPEND_POLICY_VERIFICATION_ENFORCED} from "../lib/cloudflare-five-usd-spend-guard.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{40}$/;
const STAGES=[0,1,5,25,50,100];
const PAID_POLICY=D1_PAID_MONTHLY_POLICY;
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
export function verifyCanaryPaidMonthQuota(quota,now=new Date()){
 const cycle=paidD1BillingCycle(now);
 const at=Date.parse(quota?.checked_at_utc??"");
 if(quota?.schema!=="geomacro.d1-paid-monthly-headroom.v1"||
    quota?.status!=="PASS"||
    quota?.code!=="MIGRATION_PAID_MONTHLY_HEADROOM_VERIFIED"||
    quota?.lane!=="canary"||
    quota?.provider_subscription_verified!==true||
    quota?.payment_activation_authorized!==false||
    quota?.no_d1_sql_or_write_issued!==true||
    quota?.provider_metrics_may_lag!==true||
    quota?.account_wide_hard_cap_guaranteed!==false||
    quota?.reserve_pct!==PAID_POLICY.owner_included_quota_reserve_pct||
    quota?.old_daily_140k_policy_applied!==false)
   return {verified:false,reason:"PROVIDER_PAID_MONTHLY_PLAN_OR_ADMISSION_UNVERIFIED"};
 if(quota.day_utc!==cycle.observed_through_utc||
    quota.cycle_start_utc!==cycle.start_utc||
    quota.cycle_end_exclusive_utc!==cycle.end_exclusive_utc||
    !Number.isFinite(at)||at>now.getTime()||
    now.getTime()-at>120000)
  return {verified:false,reason:"PROVIDER_BILLING_CYCLE_OR_SAMPLE_STALE"};
 if(quota.monthly_ceiling_read!==PAID_POLICY.owner_normal_monthly_ceiling.rows_read||
    quota.monthly_ceiling_written!==PAID_POLICY.owner_normal_monthly_ceiling.rows_written||
    quota.operational_daily_ceiling_read!==PAID_POLICY.owner_daily_ceiling.rows_read||
    quota.operational_daily_ceiling_written!==PAID_POLICY.owner_daily_ceiling.rows_written||
    quota.operational_hourly_ceiling_read!==PAID_POLICY.owner_hourly_ceiling.rows_read||
    quota.operational_hourly_ceiling_written!==PAID_POLICY.owner_hourly_ceiling.rows_written||
    !nonnegative(quota.database_count)||quota.database_count<1||
    !nonnegative(quota.observed_rows_read)||
    !nonnegative(quota.observed_rows_written)||
    !nonnegative(quota.remaining_rows_read)||
    !nonnegative(quota.remaining_rows_written)||
    !nonnegative(quota.monthly_paced_ceiling_read)||
    !nonnegative(quota.monthly_paced_ceiling_written)||
    quota.remaining_rows_read!==
      quota.monthly_ceiling_read-quota.observed_rows_read||
    quota.remaining_rows_written!==
      quota.monthly_ceiling_written-quota.observed_rows_written||
    quota.remaining_rows_read<PAID_POLICY.migration_reserve_rows_read||
    quota.remaining_rows_written<PAID_POLICY.migration_reserve_rows_written||
    quota.monthly_paced_ceiling_read-quota.observed_rows_read<
      PAID_POLICY.migration_reserve_rows_read||
    quota.monthly_paced_ceiling_written-quota.observed_rows_written<
      PAID_POLICY.migration_reserve_rows_written)
  return {verified:false,reason:"PAID_MONTHLY_OWNER_RESERVE_OR_PACING_UNVERIFIED"};
 return {verified:true,reason:"CLOUDFLARE_PAID_MONTHLY_ACCOUNT_CAPACITY_VERIFIED",
  observed_rows_read:quota.observed_rows_read,
  observed_rows_written:quota.observed_rows_written,
  remaining_rows_read:quota.remaining_rows_read,
  remaining_rows_written:quota.remaining_rows_written,
  cycle_start_utc:quota.cycle_start_utc,
  cycle_end_exclusive_utc:quota.cycle_end_exclusive_utc,
  provider_metrics_delayed:true};
}

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
 targetPercent,sourceSha,quota,now=new Date(),spendPolicyEnforced=SPEND_POLICY_VERIFICATION_ENFORCED,
 reviewedFlagProfile="",reviewedAdditiveSecretNames=[]
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
  // Resource + value parity, not simply names/types; unknown changes HOLD.
  try{
   assessReviewedAdditiveBindingParity(baselineVersion,candidateVersion,{
    sourceSha,reviewedFlagProfile,reviewedSecretNames:reviewedAdditiveSecretNames});
  }catch{return refuse("VERSION_BINDING_PARITY_MISMATCH");}
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
  if(reviewedFlagProfile===HOT50_INTAKE_PROFILE&&
     Object.entries(HOT50_INTAKE_VARS).some(([name,value])=>findVar(name)!==value))
   return refuse("CANDIDATE_REVIEWED_HOT50_FLAG_READBACK_MISMATCH");
  if(Object.entries(FAIL_CLOSED_RELEASE_VARS).some(([name,value])=>findVar(name)!==value))
   return refuse("CANDIDATE_RELEASE_GATES_NOT_CLOSED");
  if(findVar("GEOMACRO_SOURCE_SHA")!==sourceSha||
     findVar("RISK_GATE_COUNTRY_SCOPE")!=="HOT50"||
     findVar("GEOMACRO_P0B_ADMISSION_ACTIVE")!=="1"||
     findVar("GEOMACRO_P1_BUNDLED_LEASES_ENABLED")!=="1")
   return refuse("CANDIDATE_HOT50_P1_RUNTIME_BINDING_UNVERIFIED");
  const proof=verifyCanaryPaidMonthQuota(quota,now);
  if(!proof.verified)return refuse(proof.reason);
  // Owner-authorized spend-policy read is advisory by default. If policy
  // enforcement ever becomes mandatory, it must have independent provider
  // proof; the D1 Paid subscription alone never fabricates that evidence.
  if(spendPolicyEnforced&&!(
    quota?.paid_capacity_probe_status==="VERIFIED"&&
    quota?.paid_capacity_verified_by_provider===true))
   return refuse("SPEND_POLICY_UNVERIFIED");
  return Object.freeze({
   schema:"geomacro.hot50.protected-worker-promotion.v1",
   checked_at:now.toISOString(),stage:"READ_ONLY",eligible:true,
   reason:"ELIGIBLE_FOR_EXPLICIT_NO_FUNDS_STAGE",
   source_sha:sourceSha,previous_percent:preceding,target_percent:targetPercent,
   baseline_id:baselineId,candidate_id:candidateId,bindings_checked:newBindings.length,
   observed_rows_read:quota.observed_rows_read,observed_rows_written:quota.observed_rows_written,
   monthly_read_headroom:proof.remaining_rows_read,
   monthly_write_headroom:proof.remaining_rows_written,
   billing_cycle_start_utc:proof.cycle_start_utc,
   billing_cycle_end_exclusive_utc:proof.cycle_end_exclusive_utc,
   no_funds:true,provider_paid_metrics_delayed:true,
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
 env=process.env,fetchImpl=fetch,plan=checkD1PaidMonthlyHeadroom,now=new Date()
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
  plan({env,fetchImpl,now,lane:"canary"})
 ]);
 const result=assessWorkerPromotion({
  deployment,baselineVersion,candidateVersion,baselineId,candidateId,
  targetPercent,sourceSha:env.GITHUB_SHA,quota,now,
  reviewedFlagProfile:env.CANDIDATE_REVIEWED_FLAG_PROFILE??"",
  reviewedAdditiveSecretNames:(env.CANDIDATE_REVIEWED_ADDITIVE_SECRET_NAMES??"")?
   env.CANDIDATE_REVIEWED_ADDITIVE_SECRET_NAMES.split(","):[]
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
