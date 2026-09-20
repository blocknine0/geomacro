#!/usr/bin/env node
/**
 * Read-only production source-network certification audit.
 * This audit never promotes a source and never changes production state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const dbUrl = process.env.SUPABASE_DB_URL;
const project = process.env.EXPECTED_SUPABASE_PROJECT_REF;
if (!dbUrl || !project) throw new Error("SUPABASE_DB_URL and EXPECTED_SUPABASE_PROJECT_REF are required");

let dbUrlParsed;
try {
  dbUrlParsed = new URL(dbUrl);
} catch {
  throw new Error("SUPABASE_DB_URL must be a valid connection URL");
}
if (!["postgres:", "postgresql:"].includes(dbUrlParsed.protocol)) {
  throw new Error("SUPABASE_DB_URL must use postgres:// or postgresql://");
}
const expectedDirectHost = `db.${project}.supabase.co`;
const expectedPoolerHost = dbUrlParsed.hostname.endsWith(".pooler.supabase.com");
const expectedDirectMatch =
  dbUrlParsed.hostname === expectedDirectHost && dbUrlParsed.username === "postgres";
const expectedPoolerMatch =
  expectedPoolerHost && dbUrlParsed.username === `postgres.${project}`;
if (!expectedDirectMatch && !expectedPoolerMatch) {
  throw new Error("Refusing source-certification audit against a database outside the expected staging Supabase project.");
}
if (!dbUrlParsed.password || dbUrlParsed.pathname !== "/postgres") {
  throw new Error("Invalid staging database target.");
}

const exec = promisify(execFile);
const outDir = path.join(process.cwd(), "artifacts", "source-certification-100");
await fs.mkdir(outDir, { recursive: true });

async function sql(query) {
  const { stdout } = await exec("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-AtF", "|", "-c", query], { maxBuffer: 30 * 1024 * 1024 });
  return stdout.trimEnd();
}

const statusRaw = await sql("select row_to_json(v) from public.live_source_network_100_status v");
const status = statusRaw ? JSON.parse(statusRaw) : null;
if (!status) throw new Error("live_source_network_100_status returned no row");

const sources = await sql(`
select r.source_id,r.certification_state,r.endpoint_status,r.rights_status,
       r.schema_status,r.freshness_status,r.provenance_status,r.independence_status,
       r.adapter_status,r.runtime_status,r.fallback_status,
       coalesce(r.canonical_url,r.endpoint_url,''),
       coalesce(r.dataset_id,''),coalesce(r.dataset_version,''),
       coalesce(r.independence_group,'')
from public.live_source_certification_records r
where r.source_id in (
  select distinct u.source_id from public.live_global_source_universe u where u.required = true
  union
  select s.source_id from public.live_external_sources s
  where s.enabled_for_ingestion = true or s.enabled_for_commercial_signals = true
)
order by r.source_id
`);
await fs.writeFile(path.join(outDir,"sources.tsv"), sources+"\n");

const paths = await sql(`
select q.queue_key,q.scope_type,q.scope_code,coalesce(q.module_id,''),q.source_role,q.source_id,
       q.certification_state,q.fail_closed,q.endpoint_check,q.rights_check,
       q.schema_check,q.freshness_check,q.independence_check
from public.live_source_certification_queue q
where q.certification_state <> 'CERTIFIED'
   or q.fail_closed is true
   or q.endpoint_check <> 'PASS'
   or q.rights_check not in ('COMMERCIAL_OK','DERIVED_ONLY')
   or q.schema_check <> 'PASS'
   or q.freshness_check <> 'PASS'
   or q.independence_check <> 'PASS'
order by q.scope_type,q.scope_code,q.source_role,q.source_id
`);
await fs.writeFile(path.join(outDir,"paths.tsv"), paths+"\n");

const counts = {};
for (const [name, query] of Object.entries({
  certification: "select certification_state,count(*)::bigint from public.live_source_certification_records group by certification_state order by certification_state",
  endpoint: "select endpoint_status,count(*)::bigint from public.live_source_certification_records group by endpoint_status order by endpoint_status",
  rights: "select rights_status,count(*)::bigint from public.live_source_certification_records group by rights_status order by rights_status",
  schema: "select schema_status,count(*)::bigint from public.live_source_certification_records group by schema_status order by schema_status",
  freshness: "select freshness_status,count(*)::bigint from public.live_source_certification_records group by freshness_status order by freshness_status",
  adapter: "select adapter_status,count(*)::bigint from public.live_source_certification_records group by adapter_status order by adapter_status",
  runtime: "select runtime_status,count(*)::bigint from public.live_source_certification_records group by runtime_status order by runtime_status",
})) counts[name] = await sql(query);
await fs.writeFile(path.join(outDir,"status-counts.json"), JSON.stringify(counts,null,2)+"\n");

const report = {
  schema_version: "geomacro-source-network-certification-audit-1.0",
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: project,
  readiness: status,
  source_network_100_complete: status.source_network_100_complete === true,
  strict: process.argv.includes("--strict"),
  artifacts: {sources:"sources.tsv",paths:"paths.tsv",status_counts:"status-counts.json"},
  write_operations_performed: false,
  rule: "Registration or transport reachability never promotes a source. CERTIFIED requires endpoint, rights, schema, freshness, provenance, independence, adapter/runtime and fallback evidence.",
};
await fs.writeFile(path.join(outDir,"summary.json"), JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if (process.argv.includes("--strict") && !report.source_network_100_complete) process.exit(1);
