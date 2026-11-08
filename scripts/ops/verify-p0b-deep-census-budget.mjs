#!/usr/bin/env node
/**
 * P0B D1/B2 deep parity preflight under verified Cloudflare Workers Paid.
 *
 * Old owner 140k/day policy is retired. Reserve the independently verified
 * 5th-to-5th account-wide 90% Paid allowance plus migration headroom.
 * Enforces additional bounded budget for ONE deep parity check. This gate
 * performs only provider GraphQL + Billing Read; not production D1 SQL,
 * source polling, B2 PUT, payments or any Worker deployment.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {
 checkD1PaidMonthlyHeadroom,D1_PAID_MONTHLY_POLICY
} from "../lib/d1-workers-paid-monthly-governor.mjs";
const READ_MARGIN=200_000,WRITE_MARGIN=10_000;
export function assessP0bDeepCensusBudget(snapshot,{now=new Date()}={}){
 const held=code=>Object.freeze({
  schema:"geomacro.p0b.deep-audit-budget.v2",
  allowed:false,code,d1_sql_queries:0,b2_requests:0,payments:0,
  hold_file_untouched:true,old_daily_140k_policy_applied:false
 });
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   snapshot?.schema!=="geomacro.d1-paid-monthly-headroom.v1"||
   snapshot?.status!=="PASS"||
   snapshot?.provider_subscription_verified!==true||
   snapshot?.old_daily_140k_policy_applied!==false||
   snapshot?.lane!=="research"||
   snapshot?.day_utc!==now.toISOString().slice(0,10)||
   snapshot?.cycle_start_utc>snapshot.day_utc||
   snapshot?.cycle_end_exclusive_utc<=snapshot.day_utc||
   snapshot?.paid_included_rows_read!==25_000_000_000||
   snapshot?.paid_included_rows_written!==50_000_000||
   snapshot?.monthly_ceiling_read!==22_500_000_000||
   snapshot?.monthly_ceiling_written!==45_000_000||
   snapshot?.reserve_pct!==10||
   !Number.isSafeInteger(snapshot?.observed_rows_read)||
   !Number.isSafeInteger(snapshot?.observed_rows_written)||
   !Number.isSafeInteger(snapshot?.remaining_rows_read)||
   !Number.isSafeInteger(snapshot?.remaining_rows_written)||
   snapshot.observed_rows_read<0||snapshot.observed_rows_written<0)
  return held("P0B_PAID_MONTHLY_PROVIDER_RECEIPT_UNVERIFIED");
 const age=now.getTime()-Date.parse(snapshot.checked_at_utc??"");
 if(!Number.isFinite(age)||age<0||age>120_000)
  return held("P0B_PAID_MONTHLY_PROVIDER_RECEIPT_STALE");
 if(snapshot.remaining_rows_read<=
      D1_PAID_MONTHLY_POLICY.migration_reserve_rows_read+READ_MARGIN||
    snapshot.remaining_rows_written<=
      D1_PAID_MONTHLY_POLICY.migration_reserve_rows_written+WRITE_MARGIN||
    snapshot.monthly_paced_ceiling_read-snapshot.observed_rows_read<=
      D1_PAID_MONTHLY_POLICY.migration_reserve_rows_read+READ_MARGIN||
    snapshot.monthly_paced_ceiling_written-snapshot.observed_rows_written<=
      D1_PAID_MONTHLY_POLICY.migration_reserve_rows_written+WRITE_MARGIN)
  return held("P0B_DEEP_PARITY_MONTHLY_RESERVED_BUDGET_HELD");
 return Object.freeze({
  schema:"geomacro.p0b.deep-audit-budget.v2",
  allowed:true,code:"P0B_PAID_MONTHLY_PARITY_PROBE_ADMITTED",
  cycle_start_utc:snapshot.cycle_start_utc,
  cycle_end_exclusive_utc:snapshot.cycle_end_exclusive_utc,
  observed_rows_read:snapshot.observed_rows_read,
  observed_rows_written:snapshot.observed_rows_written,
  minimum_read_headroom_rows:
    D1_PAID_MONTHLY_POLICY.migration_reserve_rows_read+READ_MARGIN,
  minimum_write_headroom_rows:
    D1_PAID_MONTHLY_POLICY.migration_reserve_rows_written+WRITE_MARGIN,
  read_cost_max_rows:READ_MARGIN,write_cost_max_rows:WRITE_MARGIN,
  provider_metrics_nonatomic:true,
  account_wide_hard_cap_guaranteed:false,
  old_daily_140k_policy_applied:false,
  requires_separate_true_b2_object_get_sha_proof:true,
  does_not_grant_d1_ddl_or_hot50_commercial: true,
  d1_sql_queries:0,b2_requests:0,payments:0
 });
}
export async function checkP0bDeepCensusBudget({
 env=process.env,fetchImpl=fetch,now=new Date(),
 provider=checkD1PaidMonthlyHeadroom
}={}){
 // Actual provider read, never the stale Free UTC-day planner.
 const monthly=await provider({env,fetchImpl,now,lane:"research"});
 return assessP0bDeepCensusBudget(monthly,{now});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const result=await checkP0bDeepCensusBudget();
  console.log(JSON.stringify(result));
  if(!result.allowed)process.exitCode=3;
 }catch{
  console.error(JSON.stringify({
   schema:"geomacro.p0b.deep-audit-budget.v2",
   allowed:false,code:"P0B_PAID_MONTHLY_PROVIDER_UNAVAILABLE",
   d1_sql_queries:0,b2_requests:0,payments:0,
   old_daily_140k_policy_applied:false
  }));
  process.exitCode=3;
 }
}
