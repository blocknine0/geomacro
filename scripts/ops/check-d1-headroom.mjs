#!/usr/bin/env node
/**
 * Step3 protected migration-only billing-cycle D1 admission.
 * Owner cancelled old 140k/day cap. The only capacity proof is real
 * Cloudflare Paid plan + account-wide GraphQL over the *entire*
 * fifth-to-fifth billing cycle. No UTC-midnight "free reset" assumption.
 * Does not mutate D1, Worker, R2, B2, payments, sources or HOLD.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
 checkD1PaidMonthlyHeadroom,D1_PAID_MONTHLY_POLICY,
 paidD1BillingCycle
} from "../lib/d1-workers-paid-monthly-governor.mjs";
export const STEP3_BUDGET=Object.freeze({
 provider_included_monthly_rows_read:25_000_000_000,
 provider_included_monthly_rows_written:50_000_000,
 owner_normal_monthly_rows_read:22_500_000_000,
 owner_normal_monthly_rows_written:45_000_000,
 billing_anchor_day_utc:5,
 migration_reserve_rows_read:20_000_000,
 migration_reserve_rows_written:1_000_000,
 old_daily_140k_policy_applied:false
});
export const HEADROOM_REPORT="artifacts/release/d1-migration-headroom-current-utc.json";
export const HEADROOM_HOLD_CODE="MIGRATION_PAID_MONTHLY_HEADROOM_NOT_VERIFIED";
const clockOK=x=>x instanceof Date&&Number.isFinite(x.getTime());
const safe=x=>Number.isSafeInteger(x)&&x>=0;
export function assessD1MigrationHeadroom(snapshot,{now=new Date()}={}){
 if(!clockOK(now))throw Error("MIGRATION_HEADROOM_CLOCK_UNVERIFIED");
 const cycle=paidD1BillingCycle(now);
 const valid=snapshot?.schema==="geomacro.d1-paid-monthly-headroom.v1"&&
  snapshot.status==="PASS"&&
  snapshot.provider_subscription_verified===true&&
  snapshot.old_daily_140k_policy_applied===false&&
  snapshot.cycle_start_utc===cycle.start_utc&&
  snapshot.cycle_end_exclusive_utc===cycle.end_exclusive_utc&&
  snapshot.day_utc===cycle.observed_through_utc&&
  snapshot.monthly_ceiling_read===22_500_000_000&&
  snapshot.monthly_ceiling_written===45_000_000&&
  snapshot.paid_included_rows_read===25_000_000_000&&
  snapshot.paid_included_rows_written===50_000_000&&
  snapshot.reserve_pct===10&&
  safe(snapshot.observed_rows_read)&&
  safe(snapshot.observed_rows_written)&&
  safe(snapshot.remaining_rows_read)&&
  safe(snapshot.remaining_rows_written)&&
  snapshot.remaining_rows_read>=D1_PAID_MONTHLY_POLICY.migration_reserve_rows_read&&
  snapshot.remaining_rows_written>=D1_PAID_MONTHLY_POLICY.migration_reserve_rows_written;
 return Object.freeze({
  schema:"geomacro.d1-step3-paid-monthly-headroom.v2",
  status:valid?"PASS":"NOT_YET_VERIFIED",
  code:valid?"MIGRATION_PAID_MONTHLY_HEADROOM_VERIFIED":HEADROOM_HOLD_CODE,
  observed_at_utc:now.toISOString(),
  day_utc:cycle.observed_through_utc,
  cycle_start_utc:cycle.start_utc,
  cycle_end_exclusive_utc:cycle.end_exclusive_utc,
  provider:"CLOUDFLARE_GRAPHQL_ALL_ACCOUNT_D1_DATABASES",
  account_scope:"ALL_D1_DATABASES",
  account_database_count:valid?snapshot.database_count:null,
  observed_rows_read:valid?snapshot.observed_rows_read:null,
  observed_rows_written:valid?snapshot.observed_rows_written:null,
  remaining_rows_read:valid?snapshot.remaining_rows_read:null,
  remaining_rows_written:valid?snapshot.remaining_rows_written:null,
  required_migration_reserve_read:STEP3_BUDGET.migration_reserve_rows_read,
  required_migration_reserve_written:STEP3_BUDGET.migration_reserve_rows_written,
  owner_budget:STEP3_BUDGET,
  old_daily_140k_policy_applied:false,
  provider_metrics_may_lag:true,
  account_wide_reservation_atomic:false,
  no_d1_sql_or_write_issued_by_gate:true,
  authorization_scope:"MIGRATIONS_ONLY_NOT_DEPLOYMENT_OR_PAYMENTS",
  hold_file_untouched:true,pr_merge_authorized:false,
  payment_activation_authorized:false
 });
}
export async function checkD1Headroom({
 env=process.env,fetchImpl=fetch,now=new Date(),
 readProvider=checkD1PaidMonthlyHeadroom,write=writeFileSync,
 reportPath=HEADROOM_REPORT
}={}){
 if(!clockOK(now))throw Error("MIGRATION_HEADROOM_CLOCK_UNVERIFIED");
 let result;
 try{
  const start=Date.now();
  const paid=await readProvider({env,fetchImpl,now,lane:"migration"});
  if(Date.now()-start>120_000||new Date().toISOString().slice(0,10)!==
     now.toISOString().slice(0,10))
   throw Error("MIGRATION_PAID_MONTHLY_PROVIDER_STALE");
  result=assessD1MigrationHeadroom(paid,{now});
 }catch(e){
  result={...assessD1MigrationHeadroom(null,{now}),
   provider_error:/^(?:D1_PAID_MONTHLY_|MIGRATION_)[A-Z0-9_]+$/u
   .test(e?.message??"")?e.message:"MIGRATION_PAID_MONTHLY_PROVIDER_UNAVAILABLE"};
 }
 mkdirSync(resolve(reportPath,".."),{recursive:true,mode:0o700});
 write(reportPath,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.slice(2).some(x=>x!=="--check")||process.argv.length>3){
  console.error("Usage: node scripts/ops/check-d1-headroom.mjs [--check]");
  process.exitCode=2;
 }else{
  const r=await checkD1Headroom().catch(()=>null);
  if(!r||r.status!=="PASS"){
   console.error(JSON.stringify({status:"NOT_YET_VERIFIED",
    code:HEADROOM_HOLD_CODE,report:HEADROOM_REPORT,
    production_migration_executed:false,hold_file_untouched:true}));
   process.exitCode=3;
  }else{
   console.log(JSON.stringify({status:r.status,code:r.code,
    cycle_start_utc:r.cycle_start_utc,
    cycle_end_exclusive_utc:r.cycle_end_exclusive_utc,
    observed_rows_read:r.observed_rows_read,
    observed_rows_written:r.observed_rows_written,
    remaining_rows_read:r.remaining_rows_read,
    remaining_rows_written:r.remaining_rows_written,
    report:HEADROOM_REPORT,provider_metrics_may_lag:true,
    production_migration_executed:false}));
  }
 }
}
