#!/usr/bin/env node
/**
 * Read-only source certification census.
 *
 * Produces the exact current source-level and required-path disposition by
 * GEOPOLITICS, MACRO, CRITICAL_MINERALS and MULTI_DOMAIN. No source is
 * promoted, enabled, or certified by this script.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const dbUrl = process.env.SUPABASE_DB_URL;
const project = process.env.EXPECTED_SUPABASE_PROJECT_REF;
if (!dbUrl || !project) {
  throw new Error("SUPABASE_DB_URL and EXPECTED_SUPABASE_PROJECT_REF are required");
}

const parsed = new URL(dbUrl);
const direct = parsed.hostname === `db.${project}.supabase.co` && parsed.username === "postgres";
const pooler =
  parsed.hostname.endsWith(".pooler.supabase.com") &&
  parsed.username === `postgres.${project}`;
if ((!direct && !pooler) || parsed.pathname !== "/postgres" || !parsed.password) {
  throw new Error("Refusing census against a database outside the expected Supabase project");
}

const exec = promisify(execFile);
const outDir = path.join(process.cwd(), "artifacts", "source-certification-census");
await fs.mkdir(outDir, { recursive: true });

async function sql(query) {
  const { stdout } = await exec(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-AtF", "|", "-c", query],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  return stdout.trimEnd();
}

const sourceRaw = await sql(`
select
  s.source_id,
  s.source_name,
  s.provider_name,
  s.category,
  s.commercial_usage_status,
  s.enabled_for_ingestion,
  s.enabled_for_commercial_signals,
  coalesce(c.certification_state,'NOT_STARTED'),
  coalesce(c.endpoint_status,'UNTESTED'),
  coalesce(c.rights_status,s.commercial_usage_status),
  coalesce(c.schema_status,'UNTESTED'),
  coalesce(c.freshness_status,'UNTESTED'),
  coalesce(c.provenance_status,'UNTESTED'),
  coalesce(c.independence_status,'UNTESTED'),
  coalesce(c.adapter_status,'UNMAPPED'),
  coalesce(c.runtime_status,'UNTESTED'),
  coalesce(c.fallback_status,'UNTESTED'),
  coalesce(c.endpoint_disposition,'UNCLASSIFIED')
from public.live_external_sources s
left join public.live_source_certification_records c on c.source_id=s.source_id
order by s.category,s.source_id
`);

const pathRaw = await sql(`
select
  q.queue_key,
  q.scope_type,
  q.scope_code,
  coalesce(q.module_id,''),
  q.source_role,
  q.source_id,
  coalesce(s.category,'UNKNOWN'),
  q.certification_state,
  q.fail_closed,
  q.endpoint_check,
  q.rights_check,
  q.schema_check,
  q.freshness_check,
  q.independence_check
from public.live_source_certification_queue q
left join public.live_external_sources s on s.source_id=q.source_id
order by s.category,q.scope_type,q.scope_code,q.source_role,q.source_id
`);

const statusRaw = await sql("select row_to_json(v) from public.live_source_network_100_status v");
const launchRaw = await sql("select row_to_json(v) from public.live_source_network_launch_status v");
const readiness = statusRaw ? JSON.parse(statusRaw) : null;
const launch = launchRaw ? JSON.parse(launchRaw) : null;

const sourceColumns = [
  "source_id","source_name","provider_name","category","registry_rights",
  "enabled_for_ingestion","enabled_for_commercial_signals","certification_state",
  "endpoint_status","rights_status","schema_status","freshness_status",
  "provenance_status","independence_status","adapter_status","runtime_status",
  "fallback_status","endpoint_disposition"
];

const pathColumns = [
  "queue_key","scope_type","scope_code","module_id","source_role","source_id",
  "category","certification_state","fail_closed","endpoint_check","rights_check",
  "schema_check","freshness_check","independence_check"
];

function rows(raw, columns) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map(line => {
    const parts = line.split("|");
    return Object.fromEntries(columns.map((c,i)=>[c,parts[i] ?? ""]));
  });
}

const sources = rows(sourceRaw, sourceColumns);
const paths = rows(pathRaw, pathColumns);

function disposition(s) {
  if (s.certification_state === "CERTIFIED") return "CERTIFIED";
  if (["PERMISSION_REQUIRED","INTERNAL_RESEARCH_ONLY","REVIEW_REQUIRED"].includes(s.rights_status)) {
    return "REVIEW_REQUIRED";
  }
  if (s.rights_status === "UNREVIEWED") return "REVIEW_REQUIRED";
  if (s.enabled_for_ingestion && !s.enabled_for_commercial_signals) return "INGESTION_ONLY";
  if (["COMMERCIAL_OK","DERIVED_ONLY"].includes(s.rights_status)) {
    return "RIGHTS_OK_BUT_NOT_CERTIFIED";
  }
  return "BLOCKED";
}

for (const s of sources) s.disposition = disposition(s);

const categories = ["GEOPOLITICS","MACRO","CRITICAL_MINERALS","MULTI_DOMAIN"];
const summary = Object.fromEntries(categories.map(category => {
  const xs = sources.filter(s => s.category === category);
  const counts = {};
  for (const s of xs) counts[s.disposition] = (counts[s.disposition] || 0) + 1;
  return [category, {source_count: xs.length, disposition_counts: counts}];
}));

const pathSummary = {};
for (const p of paths) {
  const key = p.category;
  pathSummary[key] ??= {path_count:0, certified:0, fail_closed:0, incomplete:0};
  pathSummary[key].path_count++;
  if (p.certification_state === "CERTIFIED" && p.fail_closed === "f") pathSummary[key].certified++;
  if (p.fail_closed === "t") pathSummary[key].fail_closed++;
  if (
    p.certification_state !== "CERTIFIED" ||
    p.fail_closed !== "f" ||
    p.endpoint_check !== "PASS" ||
    !["COMMERCIAL_OK","DERIVED_ONLY"].includes(p.rights_check) ||
    p.schema_check !== "PASS" ||
    p.freshness_check !== "PASS" ||
    p.independence_check !== "PASS"
  ) pathSummary[key].incomplete++;
}

const report = {
  schema_version: "geomacro-source-certification-census-1.0",
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: project,
  source_network_100_complete: readiness?.source_network_100_complete === true,
  source_network_launch_complete: launch?.source_network_launch_complete === true,
  categories: summary,
  path_summary: pathSummary,
  source_count: sources.length,
  required_path_count: paths.length,
  rule: "CERTIFIED requires endpoint, rights, schema, freshness, provenance, independence, adapter/runtime and fallback evidence. Registry rights alone never imply certification.",
  write_operations_performed: false,
};

await fs.writeFile(path.join(outDir,"sources.json"), JSON.stringify(sources,null,2)+"\n");
await fs.writeFile(path.join(outDir,"paths.json"), JSON.stringify(paths,null,2)+"\n");
await fs.writeFile(path.join(outDir,"summary.json"), JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));

if (process.argv.includes("--strict") &&
    (!report.source_network_100_complete || !report.source_network_launch_complete)) {
  process.exit(1);
}
