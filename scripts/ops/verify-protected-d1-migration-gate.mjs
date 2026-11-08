#!/usr/bin/env node
/** Protected Stage B D1-only gate; NEVER deploys a Worker or initiates D1 restore. */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {checkD1BundledWork} from "./plan-d1-bundled-work.mjs";
export const APPROVED=Object.freeze([
 "0204_d1_read_hotspot_optimization.sql","0211_p0b_daily_committed_count.sql"]);
const OBJECTS=Object.freeze(["materialized_cache",
 "idx_private_osint_country_category_clock_v2",
 "idx_private_osint_check_category_status_v2",
 "idx_website_derived_hot_order_v2","p0b_committed_day_totals",
 "trg_p0b_day_committed_insert","trg_p0b_day_committed_delete",
 "trg_p0b_day_committed_clock_change"]);
export function evaluateMigrationBudget(plan,now=new Date()){
 const held=reason=>({schema:"geomacro.protected-d1-migration-budget.v1",
  admitted:false,reason,no_funds:true,account_wide_hard_cap_guaranteed:false});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
  plan?.day_utc!==now.toISOString().slice(0,10)||
  plan?.workers_paid_subscription_verified!==true||
  !(
   (plan?.owner_d1_normal_envelope?.held===false&&plan?.critical===true)||
   (plan?.owner_d1_normal_envelope?.reason==="OWNER_D1_PAID_HOURLY_PACING_HELD"&&
    plan?.reason==="GEOMACRO_OWNER_D1_PACED_BURN_RATE_HELD")
  )||
  plan?.owner_d1_utc_daily_targets?.rows_read!==580000000||
  plan?.owner_d1_utc_daily_targets?.normal_rows_read!==580000000||
  plan?.owner_d1_utc_daily_targets?.normal_rows_written!==1100000||
  plan?.owner_d1_utc_daily_targets?.emergency_rows_read!==0||
  plan?.owner_d1_utc_daily_targets?.emergency_rows_written!==0||
  plan?.owner_d1_utc_daily_targets?.emergency_auto_admission!==false||
  !Number.isSafeInteger(plan?.observed_rows_read)||plan.observed_rows_read<0||
  !Number.isSafeInteger(plan?.observed_rows_written)||plan.observed_rows_written<0)
   return held("D1_OWNER_PROVIDER_BUDGET_UNVERIFIED");
 // Reserve at least 80k rows in both lanes for one-time index build, seed,
 // telemetry lag and ongoing traffic. Never borrow the separate 20k emergency in either lane.
 if(plan.observed_rows_read>=40000||plan.observed_rows_written>=40000)
  return held("D1_MIGRATION_HEADROOM_UNDER_80K");
 return {schema:"geomacro.protected-d1-migration-budget.v1",
  admitted:true,reason:"PROVIDER_HEADROOM_FOR_PROTECTED_MIGRATIONS",
  observed_rows_read:plan.observed_rows_read,
  observed_rows_written:plan.observed_rows_written,
  headroom_read:580000000-plan.observed_rows_read,
  headroom_write:1100000-plan.observed_rows_written,
  account_wide_hard_cap_guaranteed:false,no_funds:true};
}
export function inspectPendingMigrations(raw){
 if(typeof raw!=="string"||!raw.trim()||raw.length>65536)
  throw Error("MIGRATION_PENDING_LIST_UNVERIFIED");
 const names=[...new Set(raw.match(/\b[0-9]{4}_[A-Za-z0-9_-]+\.sql\b/gu)??[])];
 if(names.some(x=>!APPROVED.includes(x)))
  throw Error("MIGRATION_UNREVIEWED_FILE_PENDING");
 if(names.length===0&&!/no migrations to apply/i.test(raw))
  throw Error("MIGRATION_PENDING_LIST_UNVERIFIED");
 return {pending:names,apply:names.length>0};
}
// Schema DDL is not free: CREATE INDEX writes one entry per pre-existing row
// plus continuing index-maintenance costs. A provider 80k UTC headroom
// snapshot is NOT sufficient unless the target row counts are bounded.
// Run an *indexed-or-sequential* bounded existential probe of at most 3,001
// rows per table, not SELECT COUNT(*) across an unbounded backlog.
export const MAX_DDL_ORIGINAL_ROWS_PER_TABLE=3000;
const SIZE_PROBE_TABLES=Object.freeze({
 "0204_d1_read_hotspot_optimization.sql":Object.freeze({
  private_osint_news_25h:"news_over",
  private_osint_source_checks_24h:"checks_over",
  website_derived_intelligence:"website_over",
 }),
 "0211_p0b_daily_committed_count.sql":Object.freeze({
  ingestion_spool_queue:"spool_over",
 }),
});
export function boundedMigrationSizeProbeSql(pendingRaw){
 const p=inspectPendingMigrations(pendingRaw);
 if(!p.apply)throw Error("MIGRATION_SIZE_PROBE_NOT_REQUIRED");
 const columns=[];
 for(const name of p.pending){
  for(const [table,alias] of Object.entries(SIZE_PROBE_TABLES[name]??{})){
   if(!/^[a-z_][a-z0-9_]*$/.test(table)||!/^[a-z_][a-z0-9_]*$/.test(alias))
    throw Error("MIGRATION_SIZE_PROBE_SCOPE_INVALID");
   columns.push("EXISTS(SELECT 1 FROM "+table+
    " LIMIT 1 OFFSET "+MAX_DDL_ORIGINAL_ROWS_PER_TABLE+") AS "+alias);
  }
 }
 if(columns.length<1||columns.length>4)throw Error("MIGRATION_SIZE_PROBE_SCOPE_INVALID");
 return "SELECT "+columns.join(", ")+";";
}
export function checkBoundedMigrationSizeProbe(pendingRaw,jsonRaw){
 const p=inspectPendingMigrations(pendingRaw);
 if(!p.apply)throw Error("MIGRATION_SIZE_PROBE_NOT_REQUIRED");
 // Derive expected aliases from reviewed migration files only; no untrusted SQL.
 const aliases=new Set([...boundedMigrationSizeProbeSql(pendingRaw)
  .matchAll(/\bAS ([a-z_]+)\b/gu)].map(m=>m[1]));
 const parsed=JSON.parse(jsonRaw);
 const batches=Array.isArray(parsed)?parsed:[parsed];
 if(batches.length!==1||batches[0]?.success!==true||
   !Array.isArray(batches[0]?.results)||batches[0].results.length!==1)
  throw Error("MIGRATION_SIZE_PROBE_PROVIDER_UNVERIFIED");
 const row=batches[0].results[0],meta=batches[0].meta;
 if(!row||typeof row!=="object"||
   Object.keys(row).length!==aliases.size||
   [...aliases].some(alias=>row[alias]!==0&&row[alias]!==1)||
   !Number.isSafeInteger(meta?.rows_read)||meta.rows_read<0||
   meta.rows_read>15000||meta?.rows_written!==0)
  throw Error("MIGRATION_SIZE_PROBE_PROVIDER_UNVERIFIED");
 if(Object.values(row).some(value=>value===1))
  throw Error("MIGRATION_ORIGINAL_TABLE_TOO_LARGE_FOR_STAGED_BUDGET");
 return Object.freeze({schema:"geomacro.protected-d1-index-build-bound.v1",
   status:"ORIGINAL_TABLES_BOUNDED",scope_names:p.pending,
   proven_table_count:aliases.size,
   maximum_original_rows_per_table:MAX_DDL_ORIGINAL_ROWS_PER_TABLE,
   size_probe_provider_rows_read:meta.rows_read,
   size_probe_provider_rows_written:0,
   index_write_cost_still_needs_provider_receipt:true,
   account_wide_atomic_paid_cap_guaranteed:false,
   verified_for_this_preflight_only:true,
   no_funds:true});
}

const dbRows=json=>(Array.isArray(json)?json:[json])
 .flatMap(x=>x?.results??x?.result?.results??[]);
export function checkMigrationSchema(pending,raw){
 if(inspectPendingMigrations(pending).apply)
  throw Error("MIGRATION_PENDING_AFTER_APPLY");
 const found=new Set(dbRows(JSON.parse(raw)).map(x=>x?.name));
 if(found.size!==OBJECTS.length||OBJECTS.some(x=>!found.has(x)))
  throw Error("MIGRATION_SCHEMA_READBACK_FAILED");
 return {schema:"geomacro.protected-d1-migrations-0204-0211.v1",
  schema_objects_verified:OBJECTS.length,all_pending_applied:true,
  worker_uploaded:false,traffic_promoted:false,
  physical_row_savings_proven:false,rollback_exercised:false,payments:0};
}
export function checkTimeTravel(infoRaw,bookmarkRaw){
 const info=JSON.parse(infoRaw),v=JSON.parse(bookmarkRaw);
 const bookmark=String(v.bookmark??v.result?.bookmark??"");
 if(info.version!=="production"||!/^[a-f0-9-]{20,100}$/iu.test(bookmark))
  throw Error("MIGRATION_TIME_TRAVEL_BOOKMARK_UNVERIFIED");
 return {schema:"geomacro.protected-d1-backup-point.v1",
  bookmark_sha256:createHash("sha256").update(bookmark).digest("hex"),
  checkpoint_at:new Date().toISOString(),restore_exercised:false};
}
function record(name,o){
 mkdirSync("artifacts/protected-canary",{recursive:true,mode:0o700});
 writeFileSync("artifacts/protected-canary/migration-"+name+".json",
  JSON.stringify(o)+"\n",{mode:0o600});console.log(JSON.stringify(o));
}
async function main(){
 const argv=process.argv.slice(2);
 if(argv.length===0){
  const p=evaluateMigrationBudget(await checkD1BundledWork());
  record("budget",p);if(!p.admitted)process.exitCode=3;return;
 }
 if(argv[0]==="--backup"&&argv.length===3){
  record("backup",checkTimeTravel(readFileSync(argv[1],"utf8"),
   readFileSync(argv[2],"utf8")));return;
 }
 if(argv[0]==="--pending"&&argv.length===2){
  const p=inspectPendingMigrations(readFileSync(argv[1],"utf8"));
  record("pending",{schema:"geomacro.protected-d1-pending.v1",
   approved_names:p.pending,pending_count:p.pending.length,unreviewed:false});
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,
   "apply="+String(p.apply)+"\n");
  return;
 }
 if(argv[0]==="--emit-size-probe"&&argv.length===2){
  process.stdout.write(boundedMigrationSizeProbeSql(readFileSync(argv[1],"utf8"))+"\n");
  return;
 }
 if(argv[0]==="--verify-size-probe"&&argv.length===3){
  record("size",checkBoundedMigrationSizeProbe(readFileSync(argv[1],"utf8"),
   readFileSync(argv[2],"utf8")));return;
 }
 if(argv[0]==="--schema"&&argv.length===3){
  record("schema",checkMigrationSchema(readFileSync(argv[1],"utf8"),
   readFileSync(argv[2],"utf8")));return;
 }
 throw Error("MIGRATION_BAD_ARGUMENTS");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(JSON.stringify({status:"HOLD",
  code:/^MIGRATION_[A-Z0-9_]+$/u.test(String(e?.message))?
  e.message:"MIGRATION_VERIFICATION_UNAVAILABLE",no_funds:true,
  production_migration_success:false}));process.exitCode=2;});
}
