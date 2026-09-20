#!/usr/bin/env node
/**
 * Authoritative global-coverage production gate.
 *
 * Read-only. This is the permanent machine gate for the requested scope:
 *   GEOPOLITICS + MACRO + CRITICAL_MINERALS
 *   country + corridor + global shock/hot-topic coverage
 *   source certification + realtime pipeline freshness
 *
 * It never promotes a source and never charges/enables a product.
 * Unsupported, stale, uncertified or commercially ineligible coverage remains
 * fail-closed and must be reported as unavailable.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT =
  process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "ldpwajisioljyjtojvfx";
const OUTPUT =
  process.env.GLOBAL_COVERAGE_AUDIT_OUTPUT ??
  "artifacts/global-production-coverage/coverage.json";

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function bool(v) {
  return v === true || v === "true";
}

async function fetchAll(db, table, select, configure) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = db.from(table).select(select).range(from, from + pageSize - 1);
    if (configure) q = configure(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function fetchSingle(db, view) {
  const { data, error } = await db.from(view).select("*").maybeSingle();
  if (error) throw new Error(`${view}: ${error.message}`);
  return data ?? null;
}

const url = String(
  process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
).trim();
const key = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "",
).trim();

if (!url || !key) {
  throw new Error("Authoritative Supabase credentials are required");
}
if (projectRef(url) !== EXPECTED_PROJECT) {
  throw new Error(
    `Refusing audit against Supabase project ${projectRef(url) || "unknown"}; expected ${EXPECTED_PROJECT}`,
  );
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const generatedAt = new Date().toISOString();

const [
  inventory,
  network,
  launch,
  countries,
  countryModules,
  regions,
  regionModules,
  corridors,
  corridorModules,
  shocks,
  shockModules,
  criticalMineralShocks,
  criticalMineralPaths,
  cursors,
] = await Promise.all([
  fetchSingle(db, "live_global_source_inventory_100_status"),
  fetchSingle(db, "live_source_network_100_status"),
  fetchSingle(db, "live_source_network_launch_status"),
  fetchAll(db, "live_country_registry", "iso3,enabled", q => q.eq("enabled", true)),
  fetchAll(db, "live_country_module_coverage_targets", "country_iso3,module_id,certification_state,coverage_state"),
  fetchAll(db, "live_region_zone_catalog", "zone_id"),
  fetchAll(db, "live_region_zone_module_coverage_targets", "zone_id,module_id,certification_state"),
  fetchAll(db, "live_strategic_corridor_catalog", "corridor_id"),
  fetchAll(db, "live_corridor_module_coverage_targets", "corridor_id,module_id,certification_state"),
  fetchAll(db, "live_global_shock_taxonomy", "shock_id,required", q => q.eq("required", true)),
  fetchAll(db, "live_global_shock_module_map", "shock_id,module_id"),
  fetchAll(db, "live_critical_mineral_shock_catalog", "shock_id,required", q => q.eq("required", true)),
  fetchAll(db, "live_global_source_universe", "universe_id,scope_type,scope_code,source_role,source_id,required"),
  fetchAll(db, "live_ingestion_cursors", "source_key,stream_key,status,last_success_at,last_item_at,consecutive_failures"),
]);

const enabledCountries = countries.filter(r => bool(r.enabled));
const unique = (rows, key) => new Set(rows.map(r => String(r[key] ?? ""))).size;
const certified = rows => rows.filter(r => String(r.certification_state ?? "") === "CERTIFIED").length;

const countryExpected = enabledCountries.length * 16;
const regionExpected = regions.length * 16;
const corridorExpected = corridors.length * 16;
const shockExpected = shocks.length * 16;
const criticalShockExpected = criticalMineralShocks.length * 3;

const countryMatrixComplete =
  countryModules.length === countryExpected &&
  countryModules.every(r => r.country_iso3 && r.module_id);
const regionMatrixComplete =
  regionModules.length === regionExpected &&
  regionModules.every(r => r.zone_id && r.module_id);
const corridorMatrixComplete =
  corridorModules.length === corridorExpected &&
  corridorModules.every(r => r.corridor_id && r.module_id);
const shockMatrixComplete =
  shockModules.length === shockExpected;
const criticalMineralMatrixComplete =
  criticalMineralPaths.length === criticalShockExpected;

const realtime = cursors.find(
  r => String(r.source_key) === "gdelt_gal" &&
       String(r.stream_key) === "global-relevant",
) ?? null;
const lastSuccessMs = realtime?.last_success_at
  ? Date.parse(String(realtime.last_success_at))
  : NaN;
const realtimeLagSeconds = Number.isFinite(lastSuccessMs)
  ? Math.max(0, Math.floor((Date.now() - lastSuccessMs) / 1000))
  : null;
const realtimeHealthy =
  realtime?.status === "healthy" &&
  realtimeLagSeconds !== null &&
  realtimeLagSeconds <= 1800;

const sourceUniverseRequired = new Set(
  sourceUniverse.filter(r => bool(r.required)).map(r => String(r.universe_id)),
).size;

const result = {
  schema_version: "geomacro-global-production-coverage-gate-1.0",
  generated_at: generatedAt,
  authoritative_project_ref: EXPECTED_PROJECT,
  requested_scope: {
    categories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"],
    geographic_layers: ["COUNTRY", "CORRIDOR", "GLOBAL_SHOCK", "HOT_TOPIC"],
    realtime_backbone: "gdelt_gal/global-relevant",
  },
  structural: {
    inventory_100: bool(inventory?.source_inventory_100_complete),
    source_network_100: bool(network?.source_network_100_complete),
    source_network_launch: bool(launch?.source_network_launch_complete),
    enabled_country_count: enabledCountries.length,
    country_module_expected: countryExpected,
    country_module_actual: countryModules.length,
    country_matrix_complete: countryMatrixComplete,
    country_module_certified: certified(countryModules),
    region_count: regions.length,
    region_module_expected: regionExpected,
    region_module_actual: regionModules.length,
    region_matrix_complete: regionMatrixComplete,
    corridor_count: corridors.length,
    corridor_module_expected: corridorExpected,
    corridor_module_actual: corridorModules.length,
    corridor_matrix_complete: corridorMatrixComplete,
    broad_shock_count: shocks.length,
    broad_shock_module_expected: shockExpected,
    broad_shock_module_actual: shockModules.length,
    broad_shock_matrix_complete: shockMatrixComplete,
    critical_mineral_shock_count: criticalMineralShocks.length,
    critical_mineral_shock_path_expected: criticalShockExpected,
    critical_mineral_shock_path_actual: criticalMineralPaths.length,
    critical_mineral_shock_paths_complete: criticalMineralMatrixComplete,
    required_source_universe_rows: sourceUniverseRequired,
  },
  realtime: {
    source_key: realtime?.source_key ?? null,
    stream_key: realtime?.stream_key ?? null,
    status: realtime?.status ?? null,
    last_success_at: realtime?.last_success_at ?? null,
    last_item_at: realtime?.last_item_at ?? null,
    consecutive_failures: realtime?.consecutive_failures ?? null,
    lag_seconds: realtimeLagSeconds,
    max_lag_seconds: 1800,
    healthy: realtimeHealthy,
  },
  claim_boundary: {
    "100_percent_inventory_is_not_100_percent_live_events": true,
    "no_current_signal_is_not_zero_risk": true,
    "stale_or_unverified_source_is_not_deliverable": true,
    "commercial_rights_are_source_specific": true,
    "corridor_matrix_does_not_claim_vessel_level_or_route_path_modeling": true,
    "hot_topic_detection_does_not_claim_all_internet_events_are_observed": true,
    "unsupported_subjects_must_fail_closed": true,
    "no_payment_or_settlement_is_enabled_by_this_audit": true,
  },
  writes_performed: false,
};

result.ready_for_global_production_claim =
  result.structural.inventory_100 &&
  result.structural.source_network_100 &&
  result.structural.source_network_launch &&
  result.structural.country_matrix_complete &&
  result.structural.region_matrix_complete &&
  result.structural.corridor_matrix_complete &&
  result.structural.broad_shock_matrix_complete &&
  result.structural.critical_mineral_shock_paths_complete &&
  result.realtime.healthy;

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

if (process.argv.includes("--strict") && !result.ready_for_global_production_claim) {
  process.exit(1);
}
