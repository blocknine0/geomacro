#!/usr/bin/env node
/**
 * Read-only exact source certification census.
 *
 * This is evidence collection only. It never promotes, enables, certifies,
 * mutates, charges, or settles anything in production.
 *
 * The authoritative production Supabase project is enforced explicitly.
 * All paginated tables are read to completion so the census cannot silently
 * truncate at the API default row limit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT =
  process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "ldpwajisioljyjtojvfx";
const supabaseUrl = String(
  process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
).trim();
const serviceRoleKey = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "",
).trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Authoritative Supabase URL and service-role key are required",
  );
}

let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("APP_SUPABASE_URL/SUPABASE_URL must be a valid URL");
}

if (parsedUrl.protocol !== "https:") {
  throw new Error("Refusing source-certification census over a non-HTTPS Supabase URL");
}

const expectedHost = `${EXPECTED_PROJECT}.supabase.co`;
if (parsedUrl.hostname !== expectedHost) {
  throw new Error(
    `Refusing census against Supabase project ${parsedUrl.hostname || "unknown"}; expected ${expectedHost}`,
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table, select = "*") {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to read ${table}: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

async function fetchSingle(table) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`);
  }

  return data ?? null;
}

const [sourcesRaw, certRaw, queueRaw, readiness, launch] = await Promise.all([
  fetchAll("live_external_sources"),
  fetchAll("live_source_certification_records"),
  fetchAll("live_source_certification_queue"),
  fetchSingle("live_source_network_100_status"),
  fetchSingle("live_source_network_launch_status"),
]);

const certById = new Map(certRaw.map((row) => [row.source_id, row]));
const categoryBySource = new Map(
  sourcesRaw.map((row) => [row.source_id, row.category]),
);

const sources = sourcesRaw
  .map((source) => {
    const certification = certById.get(source.source_id) ?? {};

    return {
      source_id: source.source_id,
      source_name: source.source_name,
      provider_name: source.provider_name,
      category: source.category,
      registry_rights: source.commercial_usage_status,
      enabled_for_ingestion: source.enabled_for_ingestion,
      enabled_for_commercial_signals: source.enabled_for_commercial_signals,
      certification_state:
        certification.certification_state ?? "NOT_STARTED",
      endpoint_status: certification.endpoint_status ?? "UNTESTED",
      rights_status:
        certification.rights_status ??
        source.commercial_usage_status ??
        "UNREVIEWED",
      schema_status: certification.schema_status ?? "UNTESTED",
      freshness_status: certification.freshness_status ?? "UNTESTED",
      provenance_status: certification.provenance_status ?? "UNTESTED",
      independence_status: certification.independence_status ?? "UNTESTED",
      adapter_status: certification.adapter_status ?? "UNMAPPED",
      runtime_status: certification.runtime_status ?? "UNTESTED",
      fallback_status: certification.fallback_status ?? "UNTESTED",
      endpoint_disposition:
        certification.endpoint_disposition ?? "UNCLASSIFIED",
    };
  })
  .sort(
    (a, b) =>
      String(a.category ?? "").localeCompare(String(b.category ?? "")) ||
      String(a.source_id ?? "").localeCompare(String(b.source_id ?? "")),
  );

function disposition(source) {
  if (source.certification_state === "CERTIFIED") return "CERTIFIED";

  if (
    [
      "PERMISSION_REQUIRED",
      "INTERNAL_RESEARCH_ONLY",
      "REVIEW_REQUIRED",
      "UNREVIEWED",
    ].includes(source.rights_status)
  ) {
    return "REVIEW_REQUIRED";
  }

  if (
    source.enabled_for_ingestion === true &&
    source.enabled_for_commercial_signals !== true
  ) {
    return "INGESTION_ONLY";
  }

  if (["COMMERCIAL_OK", "DERIVED_ONLY"].includes(source.rights_status)) {
    return "RIGHTS_OK_BUT_NOT_CERTIFIED";
  }

  return "BLOCKED";
}

for (const source of sources) {
  source.disposition = disposition(source);
}

const paths = queueRaw
  .map((queuePath) => ({
    ...queuePath,
    category:
      categoryBySource.get(queuePath.source_id) ?? "UNKNOWN",
  }))
  .sort(
    (a, b) =>
      String(a.category ?? "").localeCompare(String(b.category ?? "")) ||
      String(a.scope_type ?? "").localeCompare(String(b.scope_type ?? "")) ||
      String(a.scope_code ?? "").localeCompare(String(b.scope_code ?? "")) ||
      String(a.source_id ?? "").localeCompare(String(b.source_id ?? "")),
  );

const categories = [
  "GEOPOLITICS",
  "MACRO",
  "CRITICAL_MINERALS",
  "MULTI_DOMAIN",
];

const categorySummary = Object.fromEntries(
  categories.map((category) => {
    const categorySources = sources.filter(
      (source) => source.category === category,
    );
    const dispositionCounts = {};

    for (const source of categorySources) {
      dispositionCounts[source.disposition] =
        (dispositionCounts[source.disposition] ?? 0) + 1;
    }

    return [
      category,
      {
        source_count: categorySources.length,
        disposition_counts: dispositionCounts,
      },
    ];
  }),
);

const pathSummary = {};
for (const queuePath of paths) {
  const key = String(queuePath.category ?? "UNKNOWN");
  pathSummary[key] ??= {
    path_count: 0,
    certified: 0,
    incomplete: 0,
    fail_closed: 0,
  };

  pathSummary[key].path_count += 1;

  const pathCertified =
    queuePath.certification_state === "CERTIFIED" &&
    queuePath.fail_closed === false &&
    queuePath.endpoint_check === "PASS" &&
    ["COMMERCIAL_OK", "DERIVED_ONLY"].includes(queuePath.rights_check) &&
    queuePath.schema_check === "PASS" &&
    queuePath.freshness_check === "PASS" &&
    queuePath.independence_check === "PASS";

  if (pathCertified) {
    pathSummary[key].certified += 1;
  } else {
    pathSummary[key].incomplete += 1;
  }

  if (queuePath.fail_closed === true) {
    pathSummary[key].fail_closed += 1;
  }
}

const report = {
  schema_version: "geomacro-source-certification-census-1.1",
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: EXPECTED_PROJECT,
  source_network_100_complete:
    readiness?.source_network_100_complete === true,
  source_network_launch_complete:
    launch?.source_network_launch_complete === true,
  source_count: sources.length,
  certification_record_count: certRaw.length,
  required_path_count: paths.length,
  categories: categorySummary,
  path_summary: pathSummary,
  rule:
    "CERTIFIED requires endpoint, rights, schema, freshness, provenance, independence, adapter/runtime and fallback evidence. Registry rights alone never imply certification.",
  pagination: {
    page_size: 1000,
    sources_complete: true,
    certification_records_complete: true,
    certification_queue_complete: true,
  },
  writes_performed: false,
};

const outDir = path.join(
  process.cwd(),
  "artifacts",
  "source-certification-census",
);
await fs.mkdir(outDir, { recursive: true });

await fs.writeFile(
  path.join(outDir, "sources.json"),
  JSON.stringify(sources, null, 2) + "\n",
  "utf8",
);
await fs.writeFile(
  path.join(outDir, "paths.json"),
  JSON.stringify(paths, null, 2) + "\n",
  "utf8",
);
await fs.writeFile(
  path.join(outDir, "summary.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8",
);

console.log(JSON.stringify(report, null, 2));

if (
  process.argv.includes("--strict") &&
  (!report.source_network_100_complete ||
    !report.source_network_launch_complete)
) {
  process.exit(1);
}
