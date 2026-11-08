#!/usr/bin/env node
/**
 * READ-ONLY Cloudflare account R2/KV operations telemetry.
 * GraphQL analytics are delayed, may differ from billable usage, and do not
 * provide atomic per-operation reservations or validated KV hourly totals.
 * Never use this observational receipt alone to authorize migration, paid
 * traffic, a 100% canary, or an account-wide guaranteed $5 cap.
 *
 * This query deliberately omits bucket/object/namespace identities from the
 * response, groups only date and actionType, and counts all operation statuses.
 */
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {paidD1BillingCycle} from "../lib/d1-workers-paid-monthly-governor.mjs";

const A=new Set(["ListBuckets","PutBucket","ListObjects","ListObjectsV1",
 "ListObjectsV2","PutObject","CopyObject","CompleteMultipartUpload",
 "CreateMultipartUpload","LifecycleStorageTierTransition",
 "ListMultipartUploads","UploadPart","UploadPartCopy","ListParts",
 "PutBucketEncryption","PutBucketCors","PutBucketLifecycleConfiguration"]);
const B=new Set(["HeadBucket","HeadObject","GetObject","UsageSummary",
 "GetBucketEncryption","GetBucketLocation","GetBucketCors",
 "GetBucketLifecycleConfiguration"]);
const FREE=new Set(["DeleteObject","DeleteBucket","AbortMultipartUpload"]);
const KV=new Set(["read","write","delete","list"]);
const fail=code=>{throw Error("CLOUDFLARE_R2_KV_PROOF_"+code)};
const safe=x=>Number.isSafeInteger(x)&&x>=0;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const MAX_GROUPS=10000;
const graphql=String.raw`query GeoMacroR2KV($accountTag: string!, $startTime: Time!, $endTime: Time!,
 $startDay: Date!, $endDay: Date!) {
 viewer {accounts(filter: {accountTag: $accountTag}) {
  r2OperationsAdaptiveGroups(limit: 10000,
   filter: {datetime_geq: $startTime, datetime_leq: $endTime}) {
   sum { requests }
   dimensions { date actionType }
  }
  kvOperationsAdaptiveGroups(limit: 10000,
   filter: {date_geq: $startDay, date_leq: $endDay}) {
   sum { requests }
   dimensions { date actionType }
  }
 }}
}`;
export const R2_KV_GRAPHQL=graphql;
export function classifyR2Action(action){
 if(A.has(action))return "r2_class_a";
 if(B.has(action))return "r2_class_b";
 if(FREE.has(action))return "r2_free_operations";
 fail("R2_ACTION_CLASS_UNRECOGNIZED");
}
function group(rows,{start,end,kind}){
 if(!Array.isArray(rows)||rows.length===0||rows.length>=MAX_GROUPS)
  fail(kind+"_EMPTY_OR_TRUNCATED");
 const seen=new Set(),counts={};
 let sawToday=false;
 for(const entry of rows){
  const date=entry?.dimensions?.date,action=entry?.dimensions?.actionType;
  const requests=entry?.sum?.requests;
  if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    date<start||date>end||typeof action!=="string"||
    action.length<1||action.length>100||
    !safe(requests)||seen.has(date+"|"+action))
   fail(kind+"_GROUP_INVALID_OR_DUPLICATE");
  seen.add(date+"|"+action);
  const id=kind==="R2"?classifyR2Action(action):KV.has(action)?
   "kv_"+(action==="write"?"writes":action==="read"?"reads":
    action==="delete"?"deletes":"lists"):null;
  if(!id)fail("KV_ACTION_UNRECOGNIZED");
  const data=counts[id]??{month:0,day:0};
  data.month+=requests;
  if(date===end){data.day+=requests;sawToday=true}
  if(!safe(data.month)||!safe(data.day))fail(kind+"_COUNTER_OVERFLOW");
  counts[id]=data;
 }
 return {counts,sawToday,groups:rows.length};
}
export function assessR2KVAccountAnalytics(response,{now=new Date(),accountId}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !ACCOUNT.test(accountId??""))fail("ACCOUNT_OR_CLOCK_INVALID");
 const cycle=paidD1BillingCycle(now),from=cycle.start_utc,to=cycle.observed_through_utc;
 const accounts=response?.data?.viewer?.accounts;
 if(response?.errors?.length||!Array.isArray(accounts)||accounts.length!==1)
  fail("GRAPHQL_ACCOUNT_OR_ERRORS_UNVERIFIED");
 const r2=group(accounts[0].r2OperationsAdaptiveGroups,{start:from,end:to,kind:"R2"});
 const kv=group(accounts[0].kvOperationsAdaptiveGroups,{start:from,end:to,kind:"KV"});
 const get=(name,rows)=>rows.counts[name]??{month:0,day:0};
 const metrics=Object.fromEntries([
  ["r2_class_a",get("r2_class_a",r2),"CLOUDFLARE_R2_ACCOUNT_ANALYTICS"],
  ["r2_class_b",get("r2_class_b",r2),"CLOUDFLARE_R2_ACCOUNT_ANALYTICS"],
  ["kv_writes",get("kv_writes",kv),"CLOUDFLARE_KV_ACCOUNT_ANALYTICS"],
  ["kv_reads",get("kv_reads",kv),"CLOUDFLARE_KV_ACCOUNT_ANALYTICS"],
 ].map(([name,count,source])=>[name,{...count,hour:null,source}]));
 return Object.freeze({
  schema:"geomacro.cloudflare-r2-kv-account-observation.v1",
  status:"OBSERVATIONAL_ONLY_NOT_RELEASE_PROOF",
  source:"CLOUDFLARE_GRAPHQL_ACCOUNT_OPERATION_ANALYTICS",
  account_id_sha256:createHash("sha256").update(accountId.toLowerCase()).digest("hex"),
  billing_cycle_start_utc:from,billing_cycle_end_exclusive_utc:cycle.end_exclusive_utc,
  observed_utc_day:to,observed_at:now.toISOString(),
  r2_group_count:r2.groups,kv_group_count:kv.groups,
  r2_has_current_day_operation_group:r2.sawToday,
  kv_has_current_day_operation_group:kv.sawToday,
  metrics,
  supplemental_not_in_six_resource_policy:{
   r2_free_operations:get("r2_free_operations",r2),
   kv_deletes:get("kv_deletes",kv),
   kv_lists:get("kv_lists",kv),
  },
  analytics_are_delayed:true,analytics_are_not_billing_proof:true,
  provider_verified:false,full_six_resource_snapshot:false,
  hourly_kv_and_r2_proven:false,atomic_shared_reservation:false,
  production_release_authorized:false,merchant_funds_authorized:false,
  predge_paid_traffic_authorized:false,
 });
}
export async function readR2KVAccountAnalytics({
 env=process.env,fetchImpl=fetch,now=new Date()
}={}){
 const token=env?.CLOUDFLARE_API_TOKEN||env?.CLOUDFLARE_BILLING_READ_TOKEN;
 const accountId=env?.CLOUDFLARE_ACCOUNT_ID;
 if(typeof token!=="string"||token.length<20||!ACCOUNT.test(accountId??""))
  fail("ACCOUNT_ANALYTICS_READ_PERMISSION_UNVERIFIED");
 const cycle=paidD1BillingCycle(now);
 let res;
 try{
  res=await fetchImpl("https://api.cloudflare.com/client/v4/graphql",{
   method:"POST",redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(15_000),
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({query:graphql,variables:{
    accountTag:accountId,
    startTime:cycle.start_utc+"T00:00:00Z",
    endTime:now.toISOString(),
    startDay:cycle.start_utc,endDay:cycle.observed_through_utc
   }})
  });
 }catch{fail("GRAPHQL_NETWORK_UNAVAILABLE")}
 if(!res||res.status!==200)fail("GRAPHQL_HTTP_UNVERIFIED");
 let data;
 try{data=await res.json()}catch{fail("GRAPHQL_RESPONSE_NOT_JSON")}
 return assessR2KVAccountAnalytics(data,{now,accountId});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await readR2KVAccountAnalytics()))}
 catch(e){const code=String(e?.message??"");
  // Emit a sanitized machine-readable HOLD receipt to stdout even when
  // GraphQL fails: the protected workflow redirects stdout to its artifact.
  // Nonzero exit status is preserved. Never include the token/provider body.
  console.log(JSON.stringify({schema:"geomacro.cloudflare-r2-kv-account-observation.v1",status:"NOT_YET_VERIFIED",
   reason:code.startsWith("CLOUDFLARE_R2_KV_PROOF_")?code:
    "CLOUDFLARE_R2_KV_PROOF_UNEXPECTED_PROVIDER_ERROR",
   no_provider_mutations:true,production_release_authorized:false}));
  process.exitCode=3;
 }
}
