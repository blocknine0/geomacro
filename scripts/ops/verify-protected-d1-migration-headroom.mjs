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
 *  - <40k observed on each 120k normal lane: >80k reserve before migration
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {verifyProtectedD1CanaryPreflight}
 from "./verify-protected-d1-zero-canary-preflight.mjs";
const ALLOWED_REASONS=new Set([
 "CANARY_ACCOUNT_D1_BUDGET_HELD","ZERO_TRAFFIC_PREFLIGHT_READY"
]);
export function assessMigrationOnlyPreflight(receipt,{now=new Date()}={}){
 const hold=code=>Object.freeze({
  schema:"geomacro.d1.migration-only-headroom.v1",
  status:"HOLD",code,stage:"MIGRATION_PREFLIGHT_READONLY",
  authorizes_normal_canary:false,authorizes_traffic_promotion:false,
  authorizes_payment:false,authorizes_d1_emergency_spending:false,
  provider_mutations:0,d1_sql_queries:0,b2_requests:0
 });
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
  receipt?.schema!=="geomacro.d1.zero-traffic-canary-preflight.v1"||
  receipt?.stage!=="A_READ_ONLY"||
  !ALLOWED_REASONS.has(receipt?.reason)||
  receipt?.paid_subscription_verified!==true||
  receipt?.d1_bookmark_obtained!==true||
  receipt?.worker_baseline_verified!==true||
  receipt?.same_run_d1_bookmark_and_worker_version_retrieved!==true||
  receipt?.worker_version_uploaded!==false||
  receipt?.d1_sql_queries_issued!==0||
  receipt?.provider_write_operations!==0||
  receipt?.payments!==0||
  receipt?.normal_read_target!==120000||
  receipt?.normal_write_target!==120000||
  receipt?.emergency_read_reserve!==20000||
  receipt?.emergency_write_reserve!==20000||
  !Number.isSafeInteger(receipt?.daily_read_rows)||
  !Number.isSafeInteger(receipt?.daily_written_rows)||
  receipt.daily_read_rows<0||receipt.daily_written_rows<0)
   return hold("MIGRATION_ACCOUNT_PROVIDER_IDENTITY_UNVERIFIED");
 const stamp=Date.parse(receipt.inspected_at??"");
 if(!Number.isFinite(stamp)||stamp>now.getTime()||
    now.getTime()-stamp>120000||
    receipt.inspected_at.slice(0,10)!==now.toISOString().slice(0,10))
  return hold("MIGRATION_PROVIDER_USAGE_NOT_FRESH_UTC");
 if(receipt.daily_read_rows>=40000||receipt.daily_written_rows>=40000)
  return hold("MIGRATION_ACCOUNT_80K_HEADROOM_UNAVAILABLE");
 return Object.freeze({
  schema:"geomacro.d1.migration-only-headroom.v1",status:"ADMITTED",
  code:"MIGRATION_ONLY_80K_RESERVED",stage:"MIGRATION_PREFLIGHT_READONLY",
  day_utc:receipt.inspected_at.slice(0,10),
  measured_rows_read:receipt.daily_read_rows,
  measured_rows_written:receipt.daily_written_rows,
  reserved_read_headroom_min:80000,reserved_write_headroom_min:80000,
  normal_canary_still_needs_its_own_pacing_pass:true,
  normal_canary_eligible:receipt.eligible_for_zero_traffic_stage===true,
  authorizes_normal_canary:false,authorizes_traffic_promotion:false,
  authorizes_payment:false,authorizes_d1_emergency_spending:false,
  account_wide_atomic_hard_cap_guaranteed:false,
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
