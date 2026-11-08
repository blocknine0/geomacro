/**
 * GeoMacro Workers Paid D1 billing-cycle governor. Account-wide provider usage
 * (ALL D1 databases), not a physical, atomic billing hard cap.
 *
 * No SQL, D1 mutation, Worker deployment, source pause or payment activation.
 * Migration headroom is NEVER inferred from a dashboard screenshot, local mock,
 * empty GraphQL group page, partial aggregation or a self-declared Paid flag.
 */
import {readFileSync} from "node:fs";
import {readCloudflareWorkersPaidProof,WORKERS_PAID_PROOF_SCHEMA}
 from "./cloudflare-workers-paid-plan-proof.mjs";
export const D1_PAID_MONTHLY_POLICY=Object.freeze(JSON.parse(readFileSync(
 new URL("../../config/d1-workers-paid-monthly-policy.v1.json",import.meta.url),"utf8")));
export const D1_PAID_HEADROOM_HOLD="D1_PAID_MONTHLY_PROVIDER_HEADROOM_NOT_VERIFIED";
const DAY=86_400_000;
const YYYYMMDD=/^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const fail=s=>{throw Error("D1_PAID_MONTHLY_"+s)};
const graphQL=`query D1PaidCycle($accountTag:string!,$start:Date!,$end:Date!){
 viewer{accounts(filter:{accountTag:$accountTag}){
  d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}){
   sum{rowsRead rowsWritten}
   dimensions{databaseId date}
  }
 }}
}`;
export function paidD1BillingCycle(now,anchor=D1_PAID_MONTHLY_POLICY.billing_cycle_anchor_day_utc){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isInteger(anchor)||anchor<1||anchor>28)
  fail("BILLING_CLOCK_INVALID");
 const year=now.getUTCFullYear(),month=now.getUTCMonth();
 const candidate=Date.UTC(year,month,anchor);
 const start=now.getTime()>=candidate?candidate:Date.UTC(year,month-1,anchor);
 const from=new Date(start),until=new Date(Date.UTC(from.getUTCFullYear(),
  from.getUTCMonth()+1,anchor));
 const end=new Date(until.getTime()-DAY);
 return Object.freeze({
  start_utc:from.toISOString().slice(0,10),
  end_exclusive_utc:until.toISOString().slice(0,10),
  last_inclusive_utc:end.toISOString().slice(0,10),
  observed_through_utc:now.toISOString().slice(0,10),
  elapsed_ms:now.getTime()-start,duration_ms:until.getTime()-start,
  billing_anchor_day_utc:anchor
 });
}
export function assertPaidMonthlyPolicy(policy=D1_PAID_MONTHLY_POLICY){
 if(policy?.schema!=="geomacro.d1-workers-paid-monthly-policy.v1"||
    policy.plan!=="CLOUDFLARE_WORKERS_PAID"||
    policy.billing_cycle_anchor_day_utc!==5||
    policy.provider_included_monthly?.rows_read!==25_000_000_000||
    policy.provider_included_monthly?.rows_written!==50_000_000||
    policy.provider_included_monthly?.d1_storage_bytes!==5*1024**3||
    policy.owner_normal_monthly_ceiling?.rows_read!==22_500_000_000||
    policy.owner_normal_monthly_ceiling?.rows_written!==45_000_000||
    policy.owner_included_quota_reserve_pct!==10||
    policy.monthly_opening_fraction!==0.08||
    !safe(policy.migration_reserve_rows_read)||
    !safe(policy.migration_reserve_rows_written)||
    !safe(policy.maximum_approved_migration_estimated_rows_read)||
    !safe(policy.maximum_approved_migration_estimated_rows_written)||
    policy.provider_metrics_are_delayed!==true||
    policy.account_wide_atomic_cap_guaranteed!==false||
    policy.holds_only_optional_migrations_and_background_work!==true||
    policy.hot50_ingestion_and_customer_apis_must_not_be_paused!==true||
    policy.automatic_paid_overage_or_billing_change_authorized!==false||
    policy.payment_auto_activation!==false)
  fail("POLICY_CONFIG_INVALID");
 return policy;
}
export function parseD1PaidCycleGraphQL(body,{
 now=new Date(),policy=D1_PAID_MONTHLY_POLICY
}={}){
 assertPaidMonthlyPolicy(policy);
 const cycle=paidD1BillingCycle(now,policy.billing_cycle_anchor_day_utc);
 const accounts=body?.data?.viewer?.accounts;
 if(body?.errors?.length||!Array.isArray(accounts)||accounts.length!==1)
  fail("GRAPHQL_ACCOUNT_OR_ERRORS_UNVERIFIED");
 const groups=accounts[0]?.d1AnalyticsAdaptiveGroups;
 if(!Array.isArray(groups)||groups.length===0||groups.length>=1000)
  fail("GRAPHQL_EMPTY_OR_TRUNCATED");
 const seen=new Set();let reads=0,writes=0,hasToday=false;
 const databaseIds=new Set();
 for(const g of groups){
  const date=g?.dimensions?.date,id=g?.dimensions?.databaseId;
  if(typeof id!=="string"||id.length<10||id.length>80||
     !YYYYMMDD.test(date??"")||date<cycle.start_utc||
     date>cycle.observed_through_utc||date>=cycle.end_exclusive_utc||
     seen.has(id+"|"+date)||
     !safe(g?.sum?.rowsRead)||!safe(g?.sum?.rowsWritten))
   fail("GRAPHQL_GROUP_INVALID");
  databaseIds.add(id);seen.add(id+"|"+date);
  hasToday||=date===cycle.observed_through_utc;
  reads+=g.sum.rowsRead;writes+=g.sum.rowsWritten;
  if(!safe(reads)||!safe(writes))fail("GRAPHQL_SUM_OVERFLOW");
 }
 // Lagging GraphQL may not have emitted today's groups after UTC reset.
 // Never treat an absent date as a fresh zero-billed usage.
 if(!hasToday)fail("GRAPHQL_CURRENT_UTC_DAY_NOT_YET_OBSERVED");
 return Object.freeze({
  schema:"geomacro.d1-paid-monthly-provider-usage.v1",
  source:"CLOUDFLARE_GRAPHQL_ALL_ACCOUNT_D1_DATABASES",
  provider_usage_observed:true,
  billing_cycle_start_utc:cycle.start_utc,
  billing_cycle_end_exclusive_utc:cycle.end_exclusive_utc,
  observed_through_utc:cycle.observed_through_utc,
  observed_at_utc:now.toISOString(),
  observed_rows_read:reads,observed_rows_written:writes,
  database_count_observed:databaseIds.size,group_count_observed:groups.length,
  telemetry_is_delayed:true,atomic_reservation:false,
  cycle
 });
}
export function assessD1PaidMonthlyAdmission({
 usage,paidProof,now=new Date(),policy=D1_PAID_MONTHLY_POLICY,
 estimatedMigrationRowsRead=0,estimatedMigrationRowsWritten=0,
 lane="migration"
}={}){
 assertPaidMonthlyPolicy(policy);
 const cycle=paidD1BillingCycle(now,policy.billing_cycle_anchor_day_utc);
 const valid=usage?.schema==="geomacro.d1-paid-monthly-provider-usage.v1"&&
  usage.source==="CLOUDFLARE_GRAPHQL_ALL_ACCOUNT_D1_DATABASES"&&
  usage.provider_usage_observed===true&&
  usage.billing_cycle_start_utc===cycle.start_utc&&
  usage.billing_cycle_end_exclusive_utc===cycle.end_exclusive_utc&&
  usage.observed_through_utc===cycle.observed_through_utc&&
  usage.telemetry_is_delayed===true&&
  safe(usage.observed_rows_read)&&safe(usage.observed_rows_written)&&
  safe(usage.database_count_observed)&&usage.database_count_observed>=1&&
  safe(usage.group_count_observed)&&usage.group_count_observed>=usage.database_count_observed&&
  paidProof?.schema===WORKERS_PAID_PROOF_SCHEMA&&
  paidProof.verified===true&&
  paidProof.source==="CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ"&&
  paidProof.subscription_changed===false&&
  paidProof.billing_action_performed===false&&
  Number.isFinite(Date.parse(paidProof.observed_at??""))&&
  Date.parse(paidProof.observed_at)<=now.getTime()&&
  now.getTime()-Date.parse(paidProof.observed_at)<=120_000&&
  Number.isFinite(Date.parse(usage.observed_at_utc??""))&&
  Date.parse(usage.observed_at_utc)<=now.getTime()&&
  now.getTime()-Date.parse(usage.observed_at_utc)<=120_000;
 if(!["migration","shadow","canary","research","hot50_source"].includes(lane))
  fail("LANE_INVALID");
 const estimatesValid=safe(estimatedMigrationRowsRead)&&
  safe(estimatedMigrationRowsWritten)&&
  estimatedMigrationRowsRead<=policy.maximum_approved_migration_estimated_rows_read&&
  estimatedMigrationRowsWritten<=policy.maximum_approved_migration_estimated_rows_written;
 const read=valid?usage.observed_rows_read:null;
 const written=valid?usage.observed_rows_written:null;
 const maxRead=policy.owner_normal_monthly_ceiling.rows_read;
 const maxWrite=policy.owner_normal_monthly_ceiling.rows_written;
 const fraction=Math.max(0,Math.min(1,cycle.elapsed_ms/cycle.duration_ms));
 const opening=policy.monthly_opening_fraction;
 const pacedRead=Math.floor(maxRead*(opening+(1-opening)*fraction));
 const pacedWrite=Math.floor(maxWrite*(opening+(1-opening)*fraction));
 const safetyRead=policy.migration_reserve_rows_read+
  (lane==="migration"||lane==="shadow"?estimatedMigrationRowsRead:0);
 const safetyWrite=policy.migration_reserve_rows_written+
  (lane==="migration"||lane==="shadow"?estimatedMigrationRowsWritten:0);
 const marginRead=valid?maxRead-read:null,marginWrite=valid?maxWrite-written:null;
 const pacedMarginRead=valid?pacedRead-read:null,
       pacedMarginWrite=valid?pacedWrite-written:null;
 const withinQuota=valid&&marginRead>=safetyRead&&marginWrite>=safetyWrite&&
  pacedMarginRead>=safetyRead&&pacedMarginWrite>=safetyWrite;
 const admitted=valid&&estimatesValid&&withinQuota;
 const reason=!valid?"PAID_SUBSCRIPTION_OR_CURRENT_CYCLE_PROVIDER_UNVERIFIED":
  !estimatesValid?"MIGRATION_ESTIMATED_COST_EXCEEDS_REVIEWED_BOUND":
  !withinQuota?"MONTHLY_INCLUDED_ALLOCATION_OR_PACING_HEADROOM_UNAVAILABLE":
  "PAID_MONTHLY_PROTECTED_LANE_ADMITTED";
 return Object.freeze({
  schema:"geomacro.d1-paid-monthly-headroom.v1",
  status:admitted?"PASS":"HOLD",code:admitted?
   "MIGRATION_PAID_MONTHLY_HEADROOM_VERIFIED":D1_PAID_HEADROOM_HOLD,
  reason,lane,checked_at_utc:now.toISOString(),day_utc:cycle.observed_through_utc,
  cycle_start_utc:cycle.start_utc,cycle_end_exclusive_utc:cycle.end_exclusive_utc,
  observed_rows_read:read,observed_rows_written:written,
  remaining_rows_read:marginRead,remaining_rows_written:marginWrite,
  monthly_ceiling_read:maxRead,monthly_ceiling_written:maxWrite,
  monthly_paced_ceiling_read:pacedRead,monthly_paced_ceiling_written:pacedWrite,
  reserved_migration_rows_read:safetyRead,reserved_migration_rows_written:safetyWrite,
  paid_included_rows_read:policy.provider_included_monthly.rows_read,
  paid_included_rows_written:policy.provider_included_monthly.rows_written,
  reserve_pct:policy.owner_included_quota_reserve_pct,
  database_count:valid?usage.database_count_observed:null,
  provider_subscription_verified:valid,
  physical_storage_usage_verified:false,
  provider_metrics_may_lag:true,
  account_wide_hard_cap_guaranteed:false,
  migration_is_not_a_payment_or_worker_deployment:true,
  no_d1_sql_or_write_issued:true,
  original_ingestion_unchanged:true,customer_apis_unchanged:true,
  payment_activation_authorized:false,
  old_daily_140k_policy_applied:false
 });
}
export async function readCloudflareD1PaidCycleUsage({
 env=process.env,fetchImpl=fetch,now=new Date()
}={}){
 assertPaidMonthlyPolicy();
 const token=env.CLOUDFLARE_API_TOKEN,account=env.CLOUDFLARE_ACCOUNT_ID;
 if(typeof token!=="string"||token.length<20||!ACCOUNT.test(account??""))
  fail("CLOUDFLARE_GRAPHQL_PERMISSION_MISSING");
 const cycle=paidD1BillingCycle(now);
 const end=cycle.observed_through_utc;
 let response;
 try{response=await fetchImpl("https://api.cloudflare.com/client/v4/graphql",{
  method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({query:graphQL,variables:{
   accountTag:account,start:cycle.start_utc,end}})
 })}catch{fail("GRAPHQL_NETWORK_UNAVAILABLE")}
 if(response?.status!==200)fail("GRAPHQL_PROVIDER_HTTP_NOT_OK");
 let body;
 try{body=await response.json()}catch{fail("GRAPHQL_RESPONSE_INVALID")}
 return parseD1PaidCycleGraphQL(body,{now});
}
export async function checkD1PaidMonthlyHeadroom({
 env=process.env,fetchImpl=fetch,now=new Date(),lane="migration",
 estimatedMigrationRowsRead=0,estimatedMigrationRowsWritten=0
}={}){
 let usage=null,paidProof=null;
 const start=Date.now();
 try{
  // Cloudflare Billing Read must establish Paid plan. Never accept a flag.
  const billing=env.CLOUDFLARE_BILLING_READ_TOKEN?env:
   {...env,CLOUDFLARE_BILLING_READ_TOKEN:env.CLOUDFLARE_API_TOKEN};
  [usage,paidProof]=await Promise.all([
   readCloudflareD1PaidCycleUsage({env,fetchImpl,now}),
   readCloudflareWorkersPaidProof({env:billing,fetchImpl,now})
  ]);
  const finished=new Date();
  if(Date.now()-start>120000||finished.toISOString().slice(0,10)!==
     now.toISOString().slice(0,10))fail("PROVIDER_SAMPLE_STALE");
  return assessD1PaidMonthlyAdmission({
   usage,paidProof,now:finished,lane,estimatedMigrationRowsRead,
   estimatedMigrationRowsWritten});
 }catch(e){
  const status=assessD1PaidMonthlyAdmission({
   usage:null,paidProof:null,now,lane,estimatedMigrationRowsRead,
   estimatedMigrationRowsWritten});
  return {...status,code:D1_PAID_HEADROOM_HOLD,
   provider_error:/^(?:D1_PAID_MONTHLY_|WORKERS_PAID_)[A-Z0-9_]+$/u
    .test(e?.message??"")?e.message:"D1_PAID_MONTHLY_PROVIDER_UNVERIFIED"};
 }
}
