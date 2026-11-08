#!/usr/bin/env node
/**
 * Step 3 protected migration-only account-wide D1 headroom admission.
 *
 * Native Cloudflare GraphQL d1AnalyticsAdaptiveGroups rowsRead/rowsWritten:
 * every database, current UTC day. NOT a database-local estimate, cached
 * query count, SQLite VM instruction count, or atomic provider reservation.
 *
 * Owner envelope: 140,000 read AND 140,000 written per UTC day.
 * Admission requires both observed totals strictly < 60,000, preserving
 * > 80,000 rows in BOTH dimensions before any one-time migration.
 * A metric/provider failure is a hard HOLD; no SQL is executed by this tool.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {readCloudflareD1AccountQuota} from "./audit-d1-account-daily-quota-readonly.mjs";

export const STEP3_BUDGET=Object.freeze({
 daily_rows_read:140000,daily_rows_written:140000,
 max_used_exclusive:60000,min_remaining:80000,
});
export const HEADROOM_REPORT="artifacts/release/d1-migration-headroom-current-utc.json";
export const HEADROOM_HOLD_CODE="MIGRATION_ACCOUNT_80K_HEADROOM_UNAVAILABLE";
const number=x=>Number.isSafeInteger(x)&&x>=0;
const utcDay=now=>now.toISOString().slice(0,10);
const clockOk=now=>now instanceof Date&&Number.isFinite(now.getTime());
const code=x=>typeof x==="string"&&/^[A-Z0-9_]{6,100}$/u.test(x)?
 x:"PROVIDER_GRAPHQL_UNVERIFIED";

export function assessD1MigrationHeadroom(snapshot,{now=new Date()}={}){
 if(!clockOk(now))throw Error("MIGRATION_HEADROOM_CLOCK_UNVERIFIED");
 const valid=snapshot?.schema==="geomacro.d1-account-daily-quota-readonly.v1"&&
  snapshot?.provider_graphql_usage_observed===true&&
  snapshot.day_utc===utcDay(now)&&
  number(snapshot.account_database_count_observed)&&
  snapshot.account_database_count_observed>=1&&
  number(snapshot.observed_rows_read)&&number(snapshot.observed_rows_written);
 const usedRead=valid?snapshot.observed_rows_read:null;
 const usedWrite=valid?snapshot.observed_rows_written:null;
 const readRemaining=valid?STEP3_BUDGET.daily_rows_read-usedRead:null;
 const writeRemaining=valid?STEP3_BUDGET.daily_rows_written-usedWrite:null;
 const admitted=valid&&
  usedRead<STEP3_BUDGET.max_used_exclusive&&
  usedWrite<STEP3_BUDGET.max_used_exclusive&&
  readRemaining>=STEP3_BUDGET.min_remaining&&
  writeRemaining>=STEP3_BUDGET.min_remaining;
 return Object.freeze({
  schema:"geomacro.d1-step3-headroom-preflight.v1",
  status:admitted?"PASS":"HOLD",
  code:admitted?"MIGRATION_ACCOUNT_80K_HEADROOM_VERIFIED":
   HEADROOM_HOLD_CODE,
  observed_at_utc:now.toISOString(),day_utc:utcDay(now),
  provider:"CLOUDFLARE_D1_GRAPHQL_D1_ANALYTICS_ADAPTIVE_GROUPS",
  account_scope:"ALL_D1_DATABASES",
  account_database_count:valid?snapshot.account_database_count_observed:null,
  observed_rows_read:usedRead,observed_rows_written:usedWrite,
  remaining_rows_read:readRemaining,remaining_rows_written:writeRemaining,
  owner_budget:STEP3_BUDGET,
  read_below_60000:valid&&usedRead<60000,
  written_below_60000:valid&&usedWrite<60000,
  read_80k_reserved:valid&&readRemaining>=80000,
  write_80k_reserved:valid&&writeRemaining>=80000,
  graphql_retrieved_during_this_preflight:valid,
  provider_metrics_may_lag:true,
  account_wide_reservation_atomic:false,
  no_d1_sql_or_write_issued_by_gate:true,
  authorization_scope:"MIGRATIONS_ONLY_NOT_DEPLOYMENT_OR_PAYMENTS",
  hold_file_untouched:true,pr_merge_authorized:false,
 });
}
function heldReceipt(now,error){
 const receipt=assessD1MigrationHeadroom(null,{now});
 return {...receipt,provider_error:code(error?.message)};
}
export async function checkD1Headroom({
 env=process.env,fetchImpl=fetch,now=new Date(),
 readProvider=readCloudflareD1AccountQuota,write=writeFileSync,
 reportPath=HEADROOM_REPORT
}={}){
 if(!clockOk(now))throw Error("MIGRATION_HEADROOM_CLOCK_UNVERIFIED");
 let receipt;
 try{
  const started=Date.now();
  const snapshot=await readProvider({env,fetchImpl,now});
  // Provider returns the current UTC day only. Prevent unexpected long
  // stalls or UTC rollover from presenting a stale GREEN admission.
  const completed=new Date();
  if(Date.now()-started>120000||utcDay(completed)!==utcDay(now))
   throw Error("MIGRATION_ACCOUNT_PROVIDER_RECEIPT_STALE");
  receipt=assessD1MigrationHeadroom(snapshot,{now:completed});
 }catch(e){
  receipt=heldReceipt(new Date(),e);
 }
 mkdirSync(resolve(reportPath,".."),{recursive:true,mode:0o700});
 write(reportPath,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length>1||args.length===1&&args[0]!=="--check"){
  console.error("Usage: node scripts/ops/check-d1-headroom.mjs [--check]");
  process.exitCode=2;
 }else{
  const receipt=await checkD1Headroom().catch(()=>null);
  if(!receipt||receipt.status!=="PASS"){
   console.error(JSON.stringify({
    status:"HOLD",code:HEADROOM_HOLD_CODE,
    report:HEADROOM_REPORT,production_migration_executed:false,
    hold_file_untouched:true,pr_merge_authorized:false
   }));
   process.exitCode=3;
  }else console.log(JSON.stringify({
   status:receipt.status,code:receipt.code,day_utc:receipt.day_utc,
   observed_rows_read:receipt.observed_rows_read,
   observed_rows_written:receipt.observed_rows_written,
   remaining_rows_read:receipt.remaining_rows_read,
   remaining_rows_written:receipt.remaining_rows_written,
   report:HEADROOM_REPORT,provider_metrics_may_lag:true,
   production_migration_executed:false
  }));
 }
}
