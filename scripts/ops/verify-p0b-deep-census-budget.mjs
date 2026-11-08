#!/usr/bin/env node
/**
 * P0B deep parity needs expensive original D1 row scans. Read provider
 * account-wide billed rows BEFORE any protected deep endpoint, NOT after.
 * This is an admission guard on this workflow, not a global provider cap.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {checkD1BundledWork} from "./plan-d1-bundled-work.mjs";

export function assessP0bDeepCensusBudget(snapshot,{now=new Date()}={}){
 const held=(code)=>Object.freeze({schema:"geomacro.p0b.deep-audit-budget.v1",
   allowed:false,code,d1_sql_queries:0,b2_requests:0,payments:0});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   snapshot?.day_utc!==now.toISOString().slice(0,10)||
   snapshot?.workers_paid_subscription_verified!==true||
   snapshot?.owner_d1_normal_envelope?.held!==false||
   snapshot?.critical!==true||
   !Number.isSafeInteger(snapshot?.observed_rows_read)||
   !Number.isSafeInteger(snapshot?.observed_rows_written)||
   snapshot.observed_rows_read<0||snapshot.observed_rows_written<0)
  return held("P0B_PROVIDER_UTC_BUDGET_UNVERIFIED_OR_HELD");
 // Reserve a worst-case deep scan plus forecast lag and parallel writers
 // WITHOUT using the 20k emergency reserve in either D1 lane.
 const normal=snapshot.owner_d1_utc_daily_targets;
 if(normal?.rows_read!==140000||normal?.normal_rows_read!==120000||
   normal?.normal_rows_written!==120000||
   normal?.emergency_rows_read!==20000||
   normal?.emergency_rows_written!==20000||
   normal?.emergency_auto_admission!==false)
  return held("P0B_OWNER_NORMAL_CEILING_POLICY_INVALID");
 const readRoom=normal.normal_rows_read-snapshot.observed_rows_read;
 const writeRoom=normal.normal_rows_written-snapshot.observed_rows_written;
 if(readRoom<=20000||writeRoom<=5000)
  return held("P0B_DEEP_AUDIT_HEADROOM_INSUFFICIENT");
 return Object.freeze({schema:"geomacro.p0b.deep-audit-budget.v1",
   allowed:true,code:"P0B_DEEP_AUDIT_PROVIDER_BUDGET_ADMITTED",
   observed_rows_read:snapshot.observed_rows_read,
   observed_rows_written:snapshot.observed_rows_written,
   minimum_read_headroom_rows:20000,minimum_write_headroom_rows:5000,
   provider_metrics_nonatomic:true,account_wide_hard_cap_guaranteed:false,
   requires_separate_true_b2_object_get_sha_proof:true,
   d1_sql_queries:0,b2_requests:0,payments:0});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const plan=await checkD1BundledWork();
 const result=assessP0bDeepCensusBudget(plan);
 console.log(JSON.stringify(result));
 if(!result.allowed)process.exitCode=3;
}
