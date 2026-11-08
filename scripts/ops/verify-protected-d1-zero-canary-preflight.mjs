#!/usr/bin/env node
/**
 * Protected Cloudflare zero-traffic canary preflight (NO FUNDS).
 * Never mutates Cloudflare, D1, B2, GitHub environments or versions.
 * A PASS is authorization for a separately protected canary workflow to
 * inspect migration state, NOT permission to shift traffic or spend funds.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {checkD1BundledWork}
 from "./plan-d1-bundled-work.mjs";
import {SPEND_POLICY_VERIFICATION_ENFORCED}
 from "../lib/cloudflare-five-usd-spend-guard.mjs";
import {evaluateOwnerD1DailyEnvelope} from "../lib/d1-owner-daily-envelope.mjs";
import {readFileSync} from "node:fs";
const HEX32=/^[a-f0-9]{32}$/u,UUID=/^[a-f0-9-]{36}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const OWNER_POLICY=JSON.parse(readFileSync(new URL("../../config/geomacro-cloudflare-five-usd-budget.json",import.meta.url),"utf8")).d1_budget_policy;
const ACCEPT_REASONS=new Set(["CANARY_PROVIDER_DENIED","D1_BOOKMARK_UNVERIFIED",
 "WORKER_DEPLOYED_VERSION_UNVERIFIED","CANARY_ACCOUNT_D1_BUDGET_HELD",
 "WORKERS_PAID_SPEND_POLICY_UNVERIFIED","WORKERS_PAID_SUBSCRIPTION_UNVERIFIED",
 "CANARY_IDENTITY_UNVERIFIED","CANARY_PROVIDER_READ_FAILED"]);
export async function verifyProtectedD1CanaryPreflight({
 env=process.env,fetchImpl=fetch,now=new Date(),plan=checkD1BundledWork
}={}){
 const refuse=(reason,detail={})=>Object.freeze({
  schema:"geomacro.d1.zero-traffic-canary-preflight.v1",
  inspected_at:now.toISOString(),stage:"A_READ_ONLY",
  eligible_for_zero_traffic_stage:false,traffic_percent:0,
  reason,...detail,payments:0,provider_write_operations:0,
  d1_sql_queries_issued:0,worker_version_uploaded:false
 });
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(env.GITHUB_SHA??"")||
    !HEX32.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.CLOUDFLARE_BILLING_READ_TOKEN??"").length<20)
  return refuse("CANARY_IDENTITY_UNVERIFIED");
 const root="https://api.cloudflare.com/client/v4/accounts/"+
   env.CLOUDFLARE_ACCOUNT_ID;
 const get=async path=>{
  const reply=await fetchImpl(root+path,{
    headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
      Accept:"application/json"},
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)
  });
  const body=await reply.json();
  if(reply.status!==200||body?.success!==true)
   throw Error("CANARY_PROVIDER_DENIED");
  return body.result;
 };
 let databaseId,bookmark,version,quota;
 try{
  // Database list and bookmark are provider metadata only; no physical D1 rows.
  const databases=await get("/d1/database?per_page=100");
  if(!Array.isArray(databases))throw Error("CANARY_PROVIDER_DENIED");
  const candidates=databases.filter(x=>x?.name==="geomacro-control-plane");
  if(candidates.length!==1||!UUID.test(candidates[0].uuid??""))
   throw Error("CANARY_PROVIDER_DENIED");
  databaseId=candidates[0].uuid;
  const [snapshot,deployed]=await Promise.all([
   get("/d1/database/"+databaseId+"/time_travel/bookmark"),
   get("/workers/scripts/geomacro-control-plane/deployments?per_page=1")
  ]);
  bookmark=snapshot?.bookmark;
  if(typeof bookmark!=="string"||!/^[a-f0-9-]{20,100}$/iu.test(bookmark))
   return refuse("D1_BOOKMARK_UNVERIFIED");
  const first=deployed?.deployments?.[0];
  const versions=first?.versions;
  if(!Array.isArray(versions)||versions.length!==1||
     !UUID.test(versions[0]?.version_id??versions[0]?.id??"")||
     Number(versions[0]?.percentage)!==100)
   return refuse("WORKER_DEPLOYED_VERSION_UNVERIFIED");
  version=versions[0].version_id??versions[0].id;
  quota=await plan({env,fetchImpl,now});
 }catch{
  return refuse("CANARY_PROVIDER_READ_FAILED");
 }
 const capacity=quota?.workers_paid_subscription_verified===true;
 const spend=quota?.paid_capacity_probe_status==="VERIFIED"&&
  quota?.paid_capacity_verified_by_provider===true;
 const read=quota?.observed_rows_read,write=quota?.observed_rows_written;
 const limits=quota?.owner_d1_utc_daily_targets;
 const trustedLimits=limits?.rows_read===140000&&
  limits?.normal_rows_read===120000&&limits?.normal_rows_written===120000&&
  limits?.rows_written===140000&&limits?.emergency_rows_read===20000&&
  limits?.emergency_rows_written===20000&&
  limits?.emergency_auto_admission===false;
 const envelope=evaluateOwnerD1DailyEnvelope({
  observedRowsRead:read,observedRowsWritten:write,now,policy:OWNER_POLICY,
 });
 const budget=trustedLimits&&envelope.held===false&&
   (quota?.day_utc===undefined||quota?.day_utc===now.toISOString().slice(0,10));
 const reason=!capacity?"WORKERS_PAID_SUBSCRIPTION_UNVERIFIED":
  SPEND_POLICY_VERIFICATION_ENFORCED&&!spend?"WORKERS_PAID_SPEND_POLICY_UNVERIFIED":
  !budget?"CANARY_ACCOUNT_D1_BUDGET_HELD":"ZERO_TRAFFIC_PREFLIGHT_READY";
 const common={paid_subscription_verified:capacity,
  spend_policy_verified:spend,
  spend_policy_verification_enforced:SPEND_POLICY_VERIFICATION_ENFORCED,
  spend_policy_verification_status:spend?"VERIFIED":"UNVERIFIED_ADVISORY",
  daily_read_rows:read??null,daily_written_rows:write??null,
  normal_read_target:580000000,normal_write_target:1100000,
  hourly_burn_alert_read_rows:24000000,hourly_burn_alert_write_rows:45000,
  paced_read_limit:envelope.paced_rows_read_ceiling??null,
  paced_write_limit:envelope.paced_rows_written_ceiling??null,
  pacing_or_daily_ceiling_held:envelope.held,
  account_wide_atomic_paid_cap_guaranteed:false,
  emergency_read_reserve:0,emergency_write_reserve:0,
  d1_bookmark_obtained:true,worker_baseline_verified:true,
  d1_migration_state_verified:false,
  same_run_d1_bookmark_and_worker_version_retrieved:true};
 // Do not expose raw D1 bookmark, account/database ID or Worker version in
 // unprivileged CI logs/artifacts. Only the already verified yes/no fields.
 if(reason!=="ZERO_TRAFFIC_PREFLIGHT_READY")
  return refuse(reason,common);
 return Object.freeze({...refuse(reason,common),
  eligible_for_zero_traffic_stage:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const receipt=await verifyProtectedD1CanaryPreflight();
 mkdirSync("artifacts/protected-canary",{recursive:true,mode:0o700});
 writeFileSync("artifacts/protected-canary/preflight-no-funds.json",
  JSON.stringify(receipt)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 // A HOLD is an explicit negative receipt, not a successful deployment.
 if(!receipt.eligible_for_zero_traffic_stage)process.exitCode=3;
}
