#!/usr/bin/env node
/**
 * Read-only exact source certification census.
 * Uses the authoritative Supabase API and never promotes or enables a source.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const project = process.env.EXPECTED_SUPABASE_PROJECT_REF;

if (!supabaseUrl || !serviceRoleKey || !project) {
  throw new Error(
    "APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and EXPECTED_SUPABASE_PROJECT_REF are required",
  );
}

const host = new URL(supabaseUrl).hostname;
if (host !== `${project}.supabase.co`) {
  throw new Error(
    "Refusing census against a Supabase project outside the authoritative production ref",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function read(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return data || [];
}

const sourcesRaw = await read("live_external_sources");
const certRaw = await read("live_source_certification_records");
const queueRaw = await read("live_source_certification_queue");

const certById = new Map(certRaw.map(row => [row.source_id, row]));
const categoryBySource = new Map(
  sourcesRaw.map(row => [row.source_id, row.category]),
);

const sources = sourcesRaw
  .map(s => {
    const c = certById.get(s.source_id) || {};
    return {
      source_id: s.source_id,
      source_name: s.source_name,
      provider_name: s.provider_name,
      category: s.category,
      registry_rights: s.commercial_usage_status,
      enabled_for_ingestion: s.enabled_for_ingestion,
      enabled_for_commercial_signals: s.enabled_for_commercial_signals,
      certification_state: c.certification_state || "NOT_STARTED",
      endpoint_status: c.endpoint_status || "UNTESTED",
      rights_status: c.rights_status || s.commercial_usage_status,
      schema_status: c.schema_status || "UNTESTED",
      freshness_status: c.freshness_status || "UNTESTED",
      provenance_status: c.provenance_status || "UNTESTED",
      independence_status: c.independence_status || "UNTESTED",
      adapter_status: c.adapter_status || "UNMAPPED",
      runtime_status: c.runtime_status || "UNTESTED",
      fallback_status: c.fallback_status || "UNTESTED",
      endpoint_disposition: c.endpoint_disposition || "UNCLASSIFIED",
    };
  })
  .sort((a,b) => a.category.localeCompare(b.category) || a.source_id.localeCompare(b.source_id));

function disposition(s) {
  if (s.certification_state === "CERTIFIED") return "CERTIFIED";
  if (["PERMISSION_REQUIRED","INTERNAL_RESEARCH_ONLY","REVIEW_REQUIRED","UNREVIEWED"].includes(s.rights_status)) {
    return "REVIEW_REQUIRED";
  }
  if (s.enabled_for_ingestion && !s.enabled_for_commercial_signals) {
    return "INGESTION_ONLY";
  }
  if (["COMMERCIAL_OK","DERIVED_ONLY"].includes(s.rights_status)) {
    return "RIGHTS_OK_BUT_NOT_CERTIFIED";
  }
  return "BLOCKED";
}

for (const s of sources) s.disposition = disposition(s);

const paths = queueRaw
  .map(q => ({ ...q, category: categoryBySource.get(q.source_id) || "UNKNOWN" }))
  .sort((a,b) =>
    a.category.localeCompare(b.category) ||
    a.scope_type.localeCompare(b.scope_type) ||
    a.scope_code.localeCompare(b.scope_code) ||
    a.source_id.localeCompare(b.source_id)
  );

const { data: readinessRows, error: readinessError } =
  await supabase.from("live_source_network_100_status").select("*");
if (readinessError) throw new Error(`Failed to read source-network status: ${readinessError.message}`);
const readiness = readinessRows?.[0] || null;

const { data: launchRows, error: launchError } =
  await supabase.from("live_source_network_launch_status").select("*");
if (launchError) throw new Error(`Failed to read source-network launch status: ${launchError.message}`);
const launch = launchRows?.[0] || null;

const categories = ["GEOPOLITICS","MACRO","CRITICAL_MINERALS","MULTI_DOMAIN"];
const summary = Object.fromEntries(categories.map(category => {
  const xs = sources.filter(s => s.category === category);
  const counts = {};
  for (const s of xs) counts[s.disposition] = (counts[s.disposition] || 0) + 1;
  return [category, { source_count: xs.length, disposition_counts: counts }];
}));

const pathSummary = {};
for (const p of paths) {
  const key = p.category;
  pathSummary[key] ??= {
    path_count: 0,
    certified: 0,
    incomplete: 0,
    fail_closed: 0,
  };
  pathSummary[key].path_count++;
  const certified =
    p.certification_state === "CERTIFIED" &&
    p.fail_closed === false &&
    p.endpoint_check === "PASS" &&
    ["COMMERCIAL_OK","DERIVED_ONLY"].includes(p.rights_check) &&
    p.schema_check === "PASS" &&
    p.freshness_check === "PASS" &&
    p.independence_check === "PASS";
  if (certified) pathSummary[key].certified++;
  else pathSummary[key].incomplete++;
  if (p.fail_closed) pathSummary[key].fail_closed++;
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
  rule:
    "CERTIFIED requires endpoint, rights, schema, freshness, provenance, independence, adapter/runtime and fallback evidence. Registry rights alone never imply certification.",
  write_operations_performed: false,
};

const outDir = path.join(process.cwd(), "artifacts", "source-certification-census");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
await fs.writeFile(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2) + "\n");
await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

if (
  process.argv.includes("--strict") &&
  (!report.source_network_100_complete || !report.source_network_launch_complete)
) {
  process.exit(1);
}
