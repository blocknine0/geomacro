#!/usr/bin/env node
/**
 * Read-only GDELT dependency audit for the 195-country × 3-category raw-source mesh.
 *
 * Purpose:
 *   - quantify where GDELT is the only available path for a country/category
 *   - distinguish structural coverage from live/fresh non-GDELT coverage
 *   - identify country/category combinations that need source hardening
 *
 * This script never promotes, disables, rewires, or writes source state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT =
  process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "ldpwajisioljyjtojvfx";
const OUTPUT_DIR =
  process.env.GDELT_DEPENDENCY_AUDIT_OUTPUT ??
  path.join("artifacts", "gdelt-dependency-audit");

const CATEGORIES = ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];
const EXPECTED_CATEGORY_COUNT = CATEGORIES.length;

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function isGdeltSource(sourceId) {
  return /gdelt/i.test(String(sourceId ?? ""));
}

function isFresh(row, category, nowMs) {
  const raw = row.last_success_at ?? row.last_observed_at ?? null;
  if (!raw) return false;
  const timestamp = Date.parse(String(raw));
  if (!Number.isFinite(timestamp)) return false;

  const maxAgeSeconds =
    category === "GEOPOLITICS"
      ? 1800
      : category === "MACRO"
        ? 7200
        : 14400;

  return nowMs - timestamp <= maxAgeSeconds * 1000;
}

function key(country, category) {
  return country + "::" + category;
}

const url = String(
  process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
).trim();
const serviceKey = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "",
).trim();

if (!url || !serviceKey) {
  throw new Error(
    "Authoritative Supabase credentials are required: APP_SUPABASE_URL/SUPABASE_URL and APP_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY",
  );
}

const actualProject = projectRef(url);
if (actualProject !== EXPECTED_PROJECT) {
  throw new Error(
    `Refusing audit against Supabase project ${actualProject || "unknown"}; expected ${EXPECTED_PROJECT}`,
  );
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table, select, configure) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = db.from(table).select(select).range(from, from + pageSize - 1);
    if (configure) query = configure(query);

    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);

    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

const generatedAt = new Date().toISOString();
const nowMs = Date.parse(generatedAt);

const [countries, targets] = await Promise.all([
  fetchAll(
    "live_country_registry",
    "iso3,enabled",
    q => q.eq("enabled", true),
  ),
  fetchAll(
    "live_raw_source_targets",
    [
      "country_iso3",
      "category",
      "transport",
      "source_id",
      "target_url",
      "telegram_query",
      "enabled",
      "discovery_state",
      "last_attempt_at",
      "last_success_at",
      "last_observed_at",
      "consecutive_failures",
      "last_error",
    ].join(","),
    q => q.eq("enabled", true),
  ),
]);

const enabledCountries = countries
  .map(row => String(row.iso3 ?? "").trim().toUpperCase())
  .filter(Boolean)
  .sort();

const validTargets = targets.filter(row =>
  enabledCountries.includes(String(row.country_iso3 ?? "").toUpperCase()) &&
  CATEGORIES.includes(String(row.category ?? "")),
);

const byCell = new Map();

for (const country of enabledCountries) {
  for (const category of CATEGORIES) {
    byCell.set(key(country, category), {
      country_iso3: country,
      category,
      total_enabled_targets: 0,
      gdelt_targets: 0,
      non_gdelt_targets: 0,
      fresh_non_gdelt_targets: 0,
      fresh_gdelt_targets: 0,
      non_gdelt_source_ids: [],
      gdelt_source_ids: [],
      target_details: [],
    });
  }
}

for (const row of validTargets) {
  const country = String(row.country_iso3 ?? "").toUpperCase();
  const category = String(row.category ?? "");
  const cell = byCell.get(key(country, category));
  if (!cell) continue;

  const sourceId = String(row.source_id ?? "");
  const gdelt = isGdeltSource(sourceId);
  const fresh = isFresh(row, category, nowMs);

  cell.total_enabled_targets += 1;
  if (gdelt) {
    cell.gdelt_targets += 1;
    if (fresh) cell.fresh_gdelt_targets += 1;
    if (sourceId && !cell.gdelt_source_ids.includes(sourceId)) {
      cell.gdelt_source_ids.push(sourceId);
    }
  } else {
    cell.non_gdelt_targets += 1;
    if (fresh) cell.fresh_non_gdelt_targets += 1;
    if (sourceId && !cell.non_gdelt_source_ids.includes(sourceId)) {
      cell.non_gdelt_source_ids.push(sourceId);
    }
  }

  cell.target_details.push({
    source_id: sourceId || null,
    transport: row.transport ?? null,
    discovery_state: row.discovery_state ?? null,
    last_success_at: row.last_success_at ?? null,
    last_observed_at: row.last_observed_at ?? null,
    consecutive_failures: row.consecutive_failures ?? null,
    gdelt,
    fresh,
    endpoint: row.target_url ?? row.telegram_query ?? null,
  });
}

for (const cell of byCell.values()) {
  cell.non_gdelt_source_ids.sort();
  cell.gdelt_source_ids.sort();

  /*
   * A cell is structurally GDELT-independent when it has at least one
   * enabled non-GDELT target. It is runtime-independent when at least one
   * non-GDELT target is currently fresh under the category-specific gate.
   */
  cell.has_non_gdelt_path = cell.non_gdelt_targets > 0;
  cell.has_fresh_non_gdelt_path = cell.fresh_non_gdelt_targets > 0;

  /*
   * GDELT-only means no enabled non-GDELT target exists. This is the
   * highest-priority hardening class because disabling GDELT would remove
   * the only configured path for that country/category.
   */
  cell.gdelt_only = !cell.has_non_gdelt_path && cell.gdelt_targets > 0;
  cell.no_configured_path =
    cell.total_enabled_targets === 0;
}

const cells = [...byCell.values()];
const cellsByCategory = Object.fromEntries(
  CATEGORIES.map(category => {
    const rows = cells.filter(row => row.category === category);
    return [
      category,
      {
        country_count: enabledCountries.length,
        cells: rows.length,
        structurally_independent: rows.filter(r => r.has_non_gdelt_path).length,
        runtime_independent: rows.filter(r => r.has_fresh_non_gdelt_path).length,
        gdelt_only: rows.filter(r => r.gdelt_only).length,
        no_configured_path: rows.filter(r => r.no_configured_path).length,
        gdelt_configured: rows.filter(r => r.gdelt_targets > 0).length,
        non_gdelt_configured: rows.filter(r => r.non_gdelt_targets > 0).length,
      },
    ];
  }),
);

const gdeltOnlyCells = cells
  .filter(row => row.gdelt_only)
  .map(row => ({
    country_iso3: row.country_iso3,
    category: row.category,
    gdelt_source_ids: row.gdelt_source_ids,
    gdelt_target_count: row.gdelt_targets,
  }));

const runtimeGapCells = cells
  .filter(row => row.has_non_gdelt_path && !row.has_fresh_non_gdelt_path)
  .map(row => ({
    country_iso3: row.country_iso3,
    category: row.category,
    non_gdelt_source_ids: row.non_gdelt_source_ids,
    non_gdelt_target_count: row.non_gdelt_targets,
    fresh_non_gdelt_target_count: row.fresh_non_gdelt_targets,
  }));

const missingCells = cells
  .filter(row => row.no_configured_path)
  .map(row => ({
    country_iso3: row.country_iso3,
    category: row.category,
  }));

const structuralIndependent = cells.filter(r => r.has_non_gdelt_path).length;
const runtimeIndependent = cells.filter(r => r.has_fresh_non_gdelt_path).length;

const result = {
  schema_version: "geomacro-gdelt-dependency-audit-1.0",
  generated_at: generatedAt,
  authoritative_project_ref: EXPECTED_PROJECT,
  scope: {
    enabled_country_count: enabledCountries.length,
    expected_country_count: 195,
    categories: CATEGORIES,
    expected_category_count: EXPECTED_CATEGORY_COUNT,
    country_category_cells: cells.length,
    expected_country_category_cells:
      enabledCountries.length * EXPECTED_CATEGORY_COUNT,
  },
  summary: {
    enabled_target_count: validTargets.length,
    gdelt_target_count: validTargets.filter(r => isGdeltSource(r.source_id)).length,
    non_gdelt_target_count: validTargets.filter(r => !isGdeltSource(r.source_id)).length,
    structurally_gdelt_independent_cells: structuralIndependent,
    structurally_gdelt_independent_percent:
      cells.length === 0 ? 0 : Number(((structuralIndependent / cells.length) * 100).toFixed(2)),
    runtime_gdelt_independent_cells: runtimeIndependent,
    runtime_gdelt_independent_percent:
      cells.length === 0 ? 0 : Number(((runtimeIndependent / cells.length) * 100).toFixed(2)),
    gdelt_only_cells: gdeltOnlyCells.length,
    missing_cells: missingCells.length,
    runtime_non_gdelt_gaps: runtimeGapCells.length,
  },
  by_category: cellsByCategory,
  hardening_required: {
    gdelt_only: gdeltOnlyCells,
    missing_paths: missingCells,
    stale_or_failed_non_gdelt_paths: runtimeGapCells,
  },
  cells,
  claim_boundary: {
    "structural_independence_means_at_least_one_enabled_non_gdelt_target": true,
    "runtime_independence_requires_one_fresh_non_gdelt_target": true,
    "this_audit_does_not_validate_source_rights": true,
    "this_audit_does_not_validate_adapter_schema": true,
    "this_audit_does_not_promote_or_disable_sources": true,
    "gdelt_usage_is_not_itself_a_failure": true,
  },
  writes_performed: false,
};

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(
  path.join(OUTPUT_DIR, "audit.json"),
  JSON.stringify(result, null, 2) + "\n",
  "utf8",
);

const tsv = [
  "country_iso3\tcategory\ttotal_enabled_targets\tgdelt_targets\tnon_gdelt_targets\tfresh_non_gdelt_targets\thas_non_gdelt_path\thas_fresh_non_gdelt_path\tgdelt_only",
  ...cells.map(row =>
    [
      row.country_iso3,
      row.category,
      row.total_enabled_targets,
      row.gdelt_targets,
      row.non_gdelt_targets,
      row.fresh_non_gdelt_targets,
      row.has_non_gdelt_path,
      row.has_fresh_non_gdelt_path,
      row.gdelt_only,
    ].join("\t"),
  ),
].join("\n") + "\n";

await fs.writeFile(
  path.join(OUTPUT_DIR, "country-category.tsv"),
  tsv,
  "utf8",
);

console.log(JSON.stringify({
  schema_version: result.schema_version,
  generated_at: generatedAt,
  scope: result.scope,
  summary: result.summary,
  by_category: result.by_category,
  hardening_counts: {
    gdelt_only: gdeltOnlyCells.length,
    missing_paths: missingCells.length,
    stale_or_failed_non_gdelt_paths: runtimeGapCells.length,
  },
  artifacts: {
    json: path.join(OUTPUT_DIR, "audit.json"),
    country_category_tsv: path.join(OUTPUT_DIR, "country-category.tsv"),
  },
}, null, 2));

if (process.argv.includes("--strict") && (
  enabledCountries.length !== 195 ||
  cells.length !== enabledCountries.length * EXPECTED_CATEGORY_COUNT ||
  missingCells.length > 0
)) {
  console.error(
    "GDELT dependency strict gate failed: expected 195 enabled countries with a configured target in each of the 3 categories.",
  );
  process.exit(1);
}
