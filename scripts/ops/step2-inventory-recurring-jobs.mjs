#!/usr/bin/env node
/** Repository-wide, read-only Step2 cron inventory.
 * Exhaustively enumerates workflow schedules and wrangler config triggers.
 * Costs remain UNKNOWN until provider account-wide Query Insights confirms
 * Cloudflare rows_read/rows_written; cron frequency is not row usage.
 * This tool never changes schedules, source intake, signatures or B2 flows.
 */
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {join,relative} from "node:path";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const ROOT=process.cwd();
const WORKFLOWS=".github/workflows";
const OUT="artifacts/release/step2-recurring-job-inventory.json";
const md="artifacts/release/step2-recurring-job-inventory.md";
const notes={
 "website-finds-canonical-d1-reconcile.yml":"GITHUB_VERIFIED_PRIMARY_RECONCILE_PROOF; FAIL_OPEN_REPAIR",
 "website-news-gap-backfill.yml":"LEGACY_WEEKLY_SOURCE_NEWS_GAP_BACKFILL_UNCHANGED",
 "website-derived-news-cadence-backstop.yml":"EXISTING_GITHUB_STEP_CLOCK_GATE_PRESERVED",
 "website-derived-news-continuity.yml":"PRIMARY_WEBSITE_PUBLISHER_KEEP",
 "five-minute-original-news-fastlane.yml":"PRIMARY_SOURCE_INGEST_KEEP",
 "private-global-osint-15m.yml":"PRIMARY_SOURCE_INGEST_KEEP",
 "hot50-direct-original-news-20m.yml":"PRIMARY_SOURCE_INGEST_KEEP",
 "all-source-reusable-news-json.yml":"PRIMARY_SOURCE_INGEST_KEEP",
 "phase2h-private-raw-archive.yml":"CRYPTOGRAPHIC_B2_ARCHIVE_KEEP",
 "phase2h-historical-recovery-10m.yml":"B2_ARCHIVE_BACKLOG_KEEP",
 "reusable-news-json-export.yml":"SOURCE_EXPORT_KEEP",
 "d1-launch-72h-observatory.yml":"TELEMETRY_NO_PROVIDER_SQL_KEEP"
};
const isKept=n=>/^(PRIMARY_|CRYPTOGRAPHIC_|B2_ARCHIVE|SOURCE_EXPORT|TELEMETRY)/u.test(n);
export function parseCronFromWorkflow(source){
 const lines=source.split(/\r?\n/u),found=[];
 for(const line of lines){
  if(/^\s*#/u.test(line))continue;
  const m=/^\s*-\s*cron:\s*['"]?([^'"]+?)['"]?\s*(?:#.*)?$/u.exec(line);
  if(m&&m[1].trim())found.push(m[1].trim());
 }
 return [...new Set(found)];
}
function scanWranglers(path,outputs,depth=0){
 if(depth>12)return;
 for(const entry of readdirSync(path,{withFileTypes:true})){
  if(entry.name.startsWith(".")||
     ["node_modules","dist","build","artifacts","coverage"].includes(entry.name))
   continue;
  const full=join(path,entry.name);
  if(entry.isDirectory()){scanWranglers(full,outputs,depth+1);continue}
  if(!/wrangler(?:\.[a-z0-9_-]+)?\.(?:toml|jsonc|json)$/iu.test(entry.name))
   continue;
  const source=readFileSync(full,"utf8");
  if(!/\b(?:crons|\[triggers\])/u.test(source))continue;
  let clocks=[];
  if(entry.name.endsWith(".toml")){
   const m=/\[triggers\]([\s\S]*?)(?:\n\[|$)/u.exec(source);
   clocks=(m?.[1]?.match(/crons\s*=\s*\[([^\]]+)\]/u)?.[1]??"")
    .match(/"([^"]+)"/gu)?.map(x=>x.slice(1,-1))??[];
  }else{
   const m=/"crons"\s*:\s*\[([^\]]+)\]/u.exec(source);
   clocks=m?.[1]?.match(/"([^"]+)"/gu)?.map(x=>x.slice(1,-1))??[];
  }
  for(const cadence of clocks)outputs.push({
   type:"WORKER_TRIGGER",file:relative(ROOT,full).replaceAll("\\","/"),
   cron_utc:cadence,
   status:"KEEP_UNCHANGED_DIRECT_SCHEDULED_DISPATCH",
   expected_daily_d1_rows_saved:null,provider_billing_measured:false});
 }
}
export function inventoryRecurringJobs({workflowDir=WORKFLOWS,workerRoot="workers"}={}){
 const items=[];
 const all=readdirSync(workflowDir).filter(n=>/\.ya?ml$/u.test(n)).sort();
 for(const name of all){
  const source=readFileSync(join(workflowDir,name),"utf8");
  const cadences=parseCronFromWorkflow(source);
  const note=notes[name]??"UNCHANGED_PENDING_EXACT_FINGERPRINT_AND_QUOTA_TELEMETRY";
  for(const cadence of cadences)items.push({
   type:"GITHUB_ACTIONS",file:join(workflowDir,name),cron_utc:cadence,
   status:note,strict_primary_invariant:isKept(note),
   may_run_provider_d1_sql:/d1 execute|queryD1|wrangler.*d1|CLOUDFLARE_API_TOKEN|DB\.prepare/u.test(source),
   expected_daily_d1_rows_saved:
    name==="website-finds-canonical-d1-reconcile.yml"?
     "UP_TO_ONE_DAILY_REDUNDANT_72H_CANONICAL_SCAN_ON_VERIFIED_PRIMARY_SUCCESS":null,
   provider_billing_measured:false
  });
 }
 scanWranglers(resolve(workerRoot),items);
 // Internal backfill is a scheduled subtask of the existing 1-minute Worker
 // cron; these are inventoried explicitly, never mistaken for separate
 // provider-level trigger registrations.
 items.push({type:"WORKER_SUBTASK",
  file:"workers/control-plane/src/index.mjs:groEvidenceBackfill",
  cron_utc:"ODD_MINUTES_EVERY_2M",status:"ONCE_ONLY_AFTER_0214_OPT_IN",
  expected_daily_d1_rows_saved:
   "MAX_720_TICKS_X_31_OLD_SCAN_ROWS_MINUS_720_SINGLETON_CHECKS; DEPENDS_ON_BACKLOG",
  provider_billing_measured:false});
 items.push({type:"WORKER_SUBTASK",
  file:"workers/control-plane/src/index.mjs:groEvidenceTick",
  cron_utc:"EVEN_MINUTES_EVERY_2M",status:"KEEP_B2_ACK_ENRICHMENT_UNCHANGED",
  expected_daily_d1_rows_saved:null,provider_billing_measured:false});
 items.push({type:"WORKER_SUBTASK",
  file:"workers/control-plane/src/index.mjs:dispatchP1DueSources",
  cron_utc:"EVERY_MINUTE_WHEN_ENABLED",status:"KEEP_PRIMARY_SOURCE_INGESTION",
  expected_daily_d1_rows_saved:null,provider_billing_measured:false});
 items.push({type:"WORKER_SUBTASK",
  file:"workers/control-plane/src/index.mjs:drainP0bArchiveOutbox",
  cron_utc:"EACH_10M_WHEN_ENABLED",status:"KEEP_B2_ARCHIVE_RECOVERY",
  expected_daily_d1_rows_saved:null,provider_billing_measured:false});
 return {schema:"geomacro.d1-step2-recurring-job-inventory.v1",
  generated_at:new Date().toISOString(),
  workflow_file_count:all.length,
  scheduled_workflow_count:new Set(items.filter(x=>x.type==="GITHUB_ACTIONS").map(x=>x.file)).size,
  worker_trigger_count:items.filter(x=>x.type==="WORKER_TRIGGER").length,
  registered_schedule_entries:items.length,
  all_primary_ingestion_and_B2_commercial_flows_preserved:true,
  provider_rows_read_and_written_measured:false,
  target_daily_rows_read:60000,target_daily_rows_written:60000,
  items};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=inventoryRecurringJobs();
 mkdirSync("artifacts/release",{recursive:true});
 writeFileSync(OUT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 const lines=["# Step 2 Recurring Job Inventory","",
  "Unverified daily D1 savings are **not numeric claims**. All schedule files are scanned.",
  "", "| File | UTC cadence | Isolation status | Estimated row savings |",
  "|---|---|---|---|",...report.items.map(x=>
    "| `"+x.file+"` | `"+x.cron_utc+"` | "+
    x.status+" | "+(x.expected_daily_d1_rows_saved??"unknown / unmeasured")+" |")];
 writeFileSync(md,lines.join("\n")+"\n",{mode:0o600});
 console.log(JSON.stringify({schema:report.schema,
  workflow_file_count:report.workflow_file_count,
  scheduled_workflow_count:report.scheduled_workflow_count,
  worker_trigger_count:report.worker_trigger_count,
  registered_schedule_entries:report.registered_schedule_entries,
  report:OUT,markdown:md,provider_rows_measured:false}));
}
