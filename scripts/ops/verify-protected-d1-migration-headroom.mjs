#!/usr/bin/env node
/**
 * Protected migration-only account headroom observation.
 * This does NOT mark the normal 0%-Worker canary PASS and never admits news,
 * B2, queue processing, risk signing, traffic or payments. It avoids blocking
 * a one-time repair simply because the OLD Worker is burning the hourly pace.
 *
 * All authoritative metadata comes from existing protected Stage A:
 *  - exactly one canonical D1 DB and current Time Travel bookmark
 *  - exactly one active Worker baseline at 100%
 *  - provider-verified Workers Paid, account-wide billed rows, UTC same-day
 *  - 60k max observed on each lane: >=80k reserve before any migration
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {verifyProtectedD1CanaryPreflight}
 from "./verify-protected-d1-zero-canary-preflight.mjs";
export function assessMigrationOnlyPreflight(receipt,{now=new Date()}={}){
 const hold=code=>Object.freeze({
  schema:"geomacro.d1.paid-monthly-migration-headroom.v2",
  status:"HOLD",code,stage:"MIGRATION_PREFLIGHT_READONLY",
  authorizes_normal_canary:false,authorizes_traffic_promotion:false,
  authorizes_payment:false,authorizes_d1_overage:false,
  provider_mutations:0,d1_sql_queries:0,b2_requests:0,
  old_daily_140k_policy_applied:false,
 });
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    receipt?.schema!=="geomacro.d1.zero-traffic-canary-preflight.v1"||
    receipt?.stage!=="A_READ_ONLY"||
    receipt?.reason!=="ZERO_TRAFFIC_PREFLIGHT_READY"||
    receipt?.paid_subscription_verified!==true||
    receipt?.d1_bookmark_obtained!==true||
    receipt?.worker_baseline_verified!==true||
    receipt?.same_run_d1_bookmark_and_worker_version_retrieved!==true||
    receipt?.worker_version_uploaded!==false||
    receipt?.d1_sql_queries_issued!==0||
    receipt?.provider_write_operations!==0||
    receipt?.payments!==0||
    receipt?.paid_monthly_headroom_verified!==true||
    receipt?.old_daily_140k_policy_applied!==false||
    receipt?.safety_reserve_percent!==10||
    receipt?.monthly_read_target!==22_500_000_000||
    receipt?.monthly_write_target!==45_000_000||
    receipt?.included_monthly_rows_read!==25_000_000_000||
    receipt?.included_monthly_rows_written!==50_000_000||
    !Number.isSafeInteger(receipt?.monthly_read_rows)||
    !Number.isSafeInteger(receipt?.monthly_written_rows)||
    receipt.monthly_read_rows<0||receipt.monthly_written_rows<0)
  return hold("MIGRATION_MONTHLY_PROVIDER_IDENTITY_UNVERIFIED");
 const stamp=Date.parse(receipt.inspected_at??"");
 if(!Number.isFinite(stamp)||stamp>now.getTime()||
    now.getTime()-stamp>120_000||
    receipt.billing_cycle_start_utc>now.toISOString().slice(0,10)||
    receipt.billing_cycle_end_exclusive_utc<=now.toISOString().slice(0,10))
  return hold("MIGRATION_MONTHLY_PROVIDER_RECEIPT_NOT_FRESH");
 if(receipt.monthly_read_target-receipt.monthly_read_rows<20_000_000||
    receipt.monthly_write_target-receipt.monthly_written_rows<1_000_000)
  return hold("MIGRATION_MONTHLY_RESERVE_UNAVAILABLE");
 return Object.freeze({
  schema:"geomacro.d1.paid-monthly-migration-headroom.v2",
  status:"ADMITTED",code:"MIGRATION_PAID_CYCLE_RESERVED",
  stage:"MIGRATION_PREFLIGHT_READONLY",
  cycle_start_utc:receipt.billing_cycle_start_utc,
  cycle_end_exclusive_utc:receipt.billing_cycle_end_exclusive_utc,
  measured_rows_read:receipt.monthly_read_rows,
  measured_rows_written:receipt.monthly_written_rows,
  reserved_read_headroom_min:20_000_000,
  reserved_write_headroom_min:1_000_000,
  normal_canary_still_needs_independent_telemetry:true,
  authorizes_normal_canary:false,authorizes_traffic_promotion:false,
  authorizes_payment:false,authorizes_d1_overage:false,
  account_wide_atomic_hard_cap_guaranteed:false,
  old_daily_140k_policy_applied:false,
  provider_mutations:0,d1_sql_queries:0,b2_requests:0
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const receipt=await verifyProtectedD1CanaryPreflight();
 const result=assessMigrationOnlyPreflight(receipt);
 mkdirSync("artifacts/protected-canary",{recursive:true,mode:0o700});
 writeFileSync("artifacts/protected-canary/migration-preflight-only.json",
  JSON.stringify(result)+"\n",{mode:0o600});
 console.log(JSON.stringify(result));
 if(result.status!=="ADMITTED")process.exitCode=3;
}
