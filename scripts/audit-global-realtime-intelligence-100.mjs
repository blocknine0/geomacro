#!/usr/bin/env node
/**
 * Strict Global Realtime Intelligence 100 gate.
 *
 * Read-only. Uses the authoritative production Supabase project only.
 * Commercial source certification remains a separate fail-closed boundary:
 * uncertified/review-required sources may exist, but cannot be marked as
 * commercially enabled without complete certification evidence.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const CATEGORIES = ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];
const WINDOWS_SECONDS = {
  GEOPOLITICS: 1800,
  MACRO: 7200,
  CRITICAL_MINERALS: 14400,
};
const ORCHESTRATOR_TASKS = [
  "gdelt_gal",
  "gdelt_v2",
  "open_realtime_mesh",
  "rss_live",
  "realtime_fanout",
  "production_readiness",
];

const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const key = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
).trim();
if (!url || !key) throw new Error("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
if (new URL(url).hostname.split(".")[0] !== PROJECT_REF) {
  throw new Error("NON_AUTHORITATIVE_SUPABASE_PROJECT");
}

const db = createClient(url, key, {
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
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchSingle(table, select, configure) {
  let query = db.from(table).select(select).limit(1);
  if (configure) query = configure(query);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? null;
}

function ageSeconds(timestamp, nowMs) {
  const parsed = Date.parse(String(timestamp ?? ""));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / 1000);
}

function bool(value) {
  return value === true;
}

const nowMs = Date.now();
const evaluatedAt = new Date(nowMs).toISOString();

const [
  directory,
  registry,
  targets,
  scopeStatus,
  corridors,
  shocks,
  scopeTargets,
  gdeltCursor,
  orchestratorRows,
  sources,
  certificationRecords,
] = await Promise.all([
  fetchAll("live_country_primary_source_directory", "country_iso2", q => q.order("country_iso2")),
  fetchAll("live_country_registry", "iso3,iso2,enabled", q => q.eq("enabled", true).order("iso3")),
  fetchAll(
    "live_raw_source_targets",
    "target_id,country_iso3,category,source_id,transport,last_success_at,discovery_state",
    q => q.eq("enabled", true).order("target_id"),
  ),
  fetchSingle("live_realtime_scope_100_status", "*"),
  fetchAll("live_strategic_corridor_catalog", "corridor_id"),
  fetchAll("live_global_shock_taxonomy", "shock_id", q => q.eq("required", true)),
  fetchAll(
    "live_realtime_scope_targets",
    "target_id,scope_type,scope_code,category,transport,activation_mode,last_success_at,discovery_state,consecutive_failures,live_external_sources!inner(enabled_for_ingestion)",
    q => q.eq("enabled", true).eq("live_external_sources.enabled_for_ingestion", true),
  ),
  fetchSingle(
    "live_ingestion_cursors",
    "source_key,stream_key,status,last_success_at,last_item_at,consecutive_failures",
    q => q.eq("source_key", "gdelt_gal").eq("stream_key", "global-relevant"),
  ),
  fetchAll(
    "live_ingestion_cursors",
    "stream_key,status,last_success_at,last_attempt_at,consecutive_failures",
    q => q.eq("source_key", "geomacro_intelligence_orchestrator").like("stream_key", "orchestrator:%"),
  ),
  fetchAll(
    "live_external_sources",
    "source_id,enabled_for_ingestion,enabled_for_commercial_signals,commercial_usage_status",
  ),
  fetchAll(
    "live_source_certification_records",
    "source_id,certification_state,endpoint_status,rights_status,schema_status,freshness_status,provenance_status,independence_status,adapter_status,runtime_status,fallback_status",
  ),
]);

const registryByIso2 = new Map(
  registry.map(r => [String(r.iso2 ?? "").toUpperCase(), String(r.iso3 ?? "").toUpperCase()]),
);
const canonicalIso3 = [...new Set(
  directory
    .map(r => registryByIso2.get(String(r.country_iso2 ?? "").toUpperCase()))
    .filter(Boolean),
)].sort();
const canonicalSet = new Set(canonicalIso3);

const meshTargets = targets.filter(t => canonicalSet.has(String(t.country_iso3 ?? "").toUpperCase()));
const cells = [];
for (const iso of canonicalIso3) {
  for (const category of CATEGORIES) {
    const rows = meshTargets.filter(
      t => String(t.country_iso3 ?? "").toUpperCase() === iso && String(t.category ?? "") === category,
    );
    const nonTelegram = rows.filter(t => String(t.transport ?? "") !== "TELEGRAM_DISCOVERY");
    const nonGdelt = nonTelegram.filter(t => !/gdelt/i.test(String(t.source_id ?? "")));
    const freshRaw = nonTelegram.some(t => ageSeconds(t.last_success_at, nowMs) <= WINDOWS_SECONDS[category]);
    const freshNonGdelt = nonGdelt.some(t => ageSeconds(t.last_success_at, nowMs) <= WINDOWS_SECONDS[category]);
    cells.push({ iso, category, target_count: rows.length, fresh_raw: freshRaw, fresh_non_gdelt: freshNonGdelt });
  }
}

const freshRawCells = cells.filter(c => c.fresh_raw).length;
const freshNonGdeltCells = cells.filter(c => c.fresh_non_gdelt).length;
const rawMissingCells = cells.filter(c => !c.fresh_raw);
const nonGdeltMissingCells = cells.filter(c => !c.fresh_non_gdelt);

const corridorCount = corridors.length;
const hotTopicCount = shocks.length;
const burstTargets = scopeTargets.filter(t => t.transport === "GDELT_BURST");
const directTargets = scopeTargets.filter(t => t.transport === "WEB_DIRECT");
const missingCorridorTargets = [];
for (const row of corridors) {
  const code = String(row.corridor_id ?? "");
  for (const category of CATEGORIES) {
    if (!burstTargets.some(t => t.scope_type === "CORRIDOR" && t.scope_code === code && t.category === category)) {
      missingCorridorTargets.push({ scope_type: "CORRIDOR", scope_code: code, category });
    }
  }
}
const missingHotTargets = [];
for (const row of shocks) {
  const code = String(row.shock_id ?? "");
  for (const category of CATEGORIES) {
    if (!burstTargets.some(t => t.scope_type === "HOT_TOPIC" && t.scope_code === code && t.category === category)) {
      missingHotTargets.push({ scope_type: "HOT_TOPIC", scope_code: code, category });
    }
  }
}
const staleDirectTargets = directTargets
  .map(t => ({
    target_id: t.target_id,
    last_success_at: t.last_success_at,
    age_seconds: Number.isFinite(ageSeconds(t.last_success_at, nowMs))
      ? Math.round(ageSeconds(t.last_success_at, nowMs))
      : null,
    discovery_state: t.discovery_state,
    consecutive_failures: Number(t.consecutive_failures ?? 0),
  }))
  .filter(t => t.age_seconds === null || t.age_seconds > 20 * 60);

const gdeltLag = ageSeconds(gdeltCursor?.last_success_at, nowMs);
const gdeltFresh =
  Boolean(gdeltCursor?.last_success_at) &&
  gdeltLag <= 1800 &&
  ["healthy", "degraded"].includes(String(gdeltCursor?.status ?? ""));

const orchestratorByTask = new Map(
  orchestratorRows.map(r => [String(r.stream_key ?? "").replace(/^orchestrator:/, ""), r]),
);
const missingOrchestratorTasks = [];
const degradedOrchestratorTasks = [];
for (const task of ORCHESTRATOR_TASKS) {
  const row = orchestratorByTask.get(task);
  if (!row) {
    missingOrchestratorTasks.push(task);
    continue;
  }
  if (String(row.status ?? "") !== "healthy" || Number(row.consecutive_failures ?? 0) !== 0) {
    degradedOrchestratorTasks.push({
      task,
      status: row.status ?? null,
      consecutive_failures: Number(row.consecutive_failures ?? 0),
      last_success_at: row.last_success_at ?? null,
    });
  }
}

const certById = new Map(certificationRecords.map(r => [String(r.source_id), r]));
const commercialSourceFailures = [];
for (const source of sources.filter(s => s.enabled_for_commercial_signals === true)) {
  const cert = certById.get(String(source.source_id));
  const checksOk =
    cert &&
    cert.certification_state === "CERTIFIED" &&
    cert.endpoint_status === "PASS" &&
    ["COMMERCIAL_OK", "DERIVED_ONLY"].includes(String(cert.rights_status ?? "")) &&
    ["PASS", "NOT_APPLICABLE"].includes(String(cert.schema_status ?? "")) &&
    ["FRESH", "VARIABLE", "NOT_APPLICABLE"].includes(String(cert.freshness_status ?? "")) &&
    ["PASS", "NOT_APPLICABLE"].includes(String(cert.provenance_status ?? "")) &&
    ["PASS", "NOT_APPLICABLE"].includes(String(cert.independence_status ?? "")) &&
    ["TESTED", "NOT_APPLICABLE"].includes(String(cert.adapter_status ?? "")) &&
    ["PASS", "NOT_APPLICABLE"].includes(String(cert.runtime_status ?? "")) &&
    ["READY", "NOT_REQUIRED"].includes(String(cert.fallback_status ?? ""));
  if (!checksOk) {
    commercialSourceFailures.push({
      source_id: source.source_id,
      certification_state: cert?.certification_state ?? null,
      endpoint_status: cert?.endpoint_status ?? null,
      rights_status: cert?.rights_status ?? null,
      schema_status: cert?.schema_status ?? null,
      freshness_status: cert?.freshness_status ?? null,
      provenance_status: cert?.provenance_status ?? null,
      independence_status: cert?.independence_status ?? null,
      adapter_status: cert?.adapter_status ?? null,
      runtime_status: cert?.runtime_status ?? null,
      fallback_status: cert?.fallback_status ?? null,
    });
  }
}

const gates = {
  canonical_195:
    canonicalIso3.length === 195 &&
    registry.length === 195,
  country_category_cells_585:
    cells.length === 585 &&
    cells.every(c => c.target_count > 0),
  fresh_raw_runtime_585:
    freshRawCells === 585,
  fresh_non_gdelt_runtime_585:
    freshNonGdeltCells === 585,
  gdelt_first_break_fresh:
    gdeltFresh,
  corridor_fanout_complete:
    bool(scopeStatus?.realtime_scope_contract_100_complete) &&
    missingCorridorTargets.length === 0,
  hot_topic_fanout_complete:
    bool(scopeStatus?.realtime_scope_contract_100_complete) &&
    missingHotTargets.length === 0,
  direct_operational_sources_fresh:
    directTargets.length > 0 &&
    staleDirectTargets.length === 0,
  source_certification_fail_closed:
    commercialSourceFailures.length === 0,
  orchestrator_continuity_green:
    missingOrchestratorTasks.length === 0 &&
    degradedOrchestratorTasks.length === 0,
};

const result = {
  schema_version: "geomacro-global-realtime-intelligence-100.v1",
  evaluated_at: evaluatedAt,
  authoritative_project_ref: PROJECT_REF,
  verdict: Object.values(gates).every(Boolean) ? "GREEN" : "RED",
  gates,
  metrics: {
    canonical_countries: canonicalIso3.length,
    country_category_cells: cells.length,
    fresh_raw_runtime_cells: freshRawCells,
    fresh_non_gdelt_runtime_cells: freshNonGdeltCells,
    raw_runtime_missing_cells: rawMissingCells.slice(0, 100),
    non_gdelt_missing_cells: nonGdeltMissingCells.slice(0, 100),
    corridors: corridorCount,
    corridor_burst_targets: burstTargets.filter(t => t.scope_type === "CORRIDOR").length,
    corridor_expected_burst_targets: corridorCount * 3,
    missing_corridor_targets: missingCorridorTargets,
    required_hot_topics: hotTopicCount,
    hot_topic_burst_targets: burstTargets.filter(t => t.scope_type === "HOT_TOPIC").length,
    hot_topic_expected_burst_targets: hotTopicCount * 3,
    missing_hot_topic_targets: missingHotTargets,
    gdelt_lag_seconds: Number.isFinite(gdeltLag) ? Math.round(gdeltLag) : null,
    direct_operational_target_count: directTargets.length,
    stale_direct_operational_targets: staleDirectTargets,
    orchestrator_tasks_expected: ORCHESTRATOR_TASKS.length,
    orchestrator_tasks_found: ORCHESTRATOR_TASKS.filter(t => orchestratorByTask.has(t)).length,
    missing_orchestrator_tasks: missingOrchestratorTasks,
    degraded_orchestrator_tasks: degradedOrchestratorTasks,
    commercial_enabled_source_count: sources.filter(s => s.enabled_for_commercial_signals === true).length,
    commercial_source_failures: commercialSourceFailures,
  },
  claim_boundary: {
    telegram_discovery_is_not_runtime_truth: true,
    commercial_rights_are_source_specific: true,
    uncertified_or_review_required_sources_cannot_be_commercially_enabled: true,
    paid_production_activation_is_separate: true,
  },
  writes_performed: false,
};

const outDir = path.join("artifacts", "global-realtime-intelligence-100");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

if (result.verdict !== "GREEN") process.exit(1);
