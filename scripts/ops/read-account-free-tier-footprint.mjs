#!/usr/bin/env node
/**
 * Read-only account-wide B2/D1 budget snapshot.
 * Reuses the canonical quota ledger; this is not a competing reservation policy.
 * Neither Supabase nor B2 network I/O is needed to read the D1 counters.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createB2D1AccountGovernor } from "./b2-d1-account-governor.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const KINDS=["GET","PUT","HEAD","NATIVE_AUTH"];
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function validateAccountBudget(status,{now=new Date()}={}) {
  const day=now instanceof Date&&Number.isFinite(now.getTime())
    ? now.toISOString().slice(0,10):null;
  if (!day || status?.ok!==true ||
      status.schema!=="geomacro.b2-account-quota-status.v1" ||
      status.day_utc!==day ||
      status.account_wide_reporting_requires_all_clients_governed!==true) {
    throw new Error("ACCOUNT_FOOTPRINT_D1_STATUS_UNVERIFIED");
  }
  const used=status.used,limits=status.limits;
  if (!used||!limits||!valid(used.total) ||
      limits.total!==B2_DAILY_LIMITS.total ||
      KINDS.some(k=>!valid(used[k]) ||
        limits[k]!==B2_DAILY_LIMITS[k]||used[k]>limits[k]) ||
      used.total>limits.total ||
      KINDS.reduce((sum,k)=>sum+used[k],0)!==used.total) {
    throw new Error("ACCOUNT_FOOTPRINT_B2_COUNTS_INVALID");
  }
  const remaining={
    total:limits.total-used.total,
    ...Object.fromEntries(KINDS.map(k=>[k,limits[k]-used[k]])),
  };
  return {
    ok:true,schema:"geomacro.account-free-tier-footprint.v1",
    checked_day_utc:day,
    source:"canonical-cloudflare-d1-b2-account-quota",
    b2_used:{...used},b2_limits:{...limits},b2_remaining:remaining,
    b2_daily_quota_exhausted:remaining.total===0 ||
      KINDS.every(k=>remaining[k]===0),
    status_read_only:true,
    per_b2_operation_atomic_reservation_still_required:true,
    ungoverned_b2_admission:false,
    supabase_required:false,supabase_network_calls:0,
    b2_network_calls:0,d1_writes:0,payments:0,
    d1_daily_operations_used:null,workers_daily_requests_used:null,
    durable_object_usage:null,
    other_platform_usage_unknown:true,
  };
}
export async function readAccountBudget({
  governor=createB2D1AccountGovernor(),now=new Date(),
}={}) {
  return validateAccountBudget(await governor.status(),{now});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try {
    console.log(JSON.stringify(await readAccountBudget()));
  }catch {
    // No provider error body, authorization headers, or resource identifiers.
    console.error("ACCOUNT_FOOTPRINT_D1_QUOTA_STATUS_UNAVAILABLE");
    process.exitCode=2;
  }
}
