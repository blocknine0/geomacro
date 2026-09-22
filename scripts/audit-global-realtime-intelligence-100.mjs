#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT = process.env.EXPECTED_SUPABASE_PROJECT_REF || "ldpwajisioljyjtojvfx";
const OUTPUT = process.env.GLOBAL_REALTIME_100_OUTPUT || "artifacts/global-realtime-intelligence-100/gate.json";
const CATEGORIES = ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];
const RAW_WINDOWS = { GEOPOLITICS: 1800, MACRO: 7200, CRITICAL_MINERALS: 14400 };
const TASK_WINDOWS = {
  gdelt_gal: 1800,
  gdelt_v2: 1800,
  open_realtime_mesh: 1800,
  country_raw_mesh: 3600,
  rss_live: 3600,
  realtime_fanout: 1800,
  production_readiness: 14400,
  source_evidence: 86400,
};

function refOf(url) {
  try { return new URL(url).hostname.split(".")[0] || ""; } catch { return ""; }
}
function age(value, now) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return Infinity;
  return Math.max(0, (now - ts) / 1000);
}
function fresh(value, maxAge, now) {
  const a = age(value, now);
  return Number.isFinite(a) && a <= maxAge;
}
function bool(v) {
  return v === true || v === "true";
}
async function all(db, table, select, configure) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = db.from(table).select(select).range(from, from + size - 1);
    if (configure) q = configure(q);
    const result = await q;
    if (result.error) throw new Error(table + ": " + result.error.message);
    out.push(...(result.data || []));
    if ((result.data || []).length < size) break;
  }
  return out;
}
async function one(db, view) {
  const result = await db.from(view).select("*").maybeSingle();
  if (result.error) throw new Error(view + ": " + result.error.message);
  return result.data || null;
}

const url = String(process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) throw new Error("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
if (refOf(url) !== PROJECT) throw new Error("NON_AUTHORITATIVE_SUPABASE_PROJECT");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const nowIso = new Date().toISOString();
const now = Date.parse(nowIso);

const data = await Promise.all([
  one(db, "live_global_source_inventory_100_status"),
  one(db, "live_source_network_100_status"),
  one(db, "live_source_network_launch_status"),
  one(db, "live_raw_source_coverage_100_status"),
  one(db, "live_raw_source_runtime_100_status"),
  one(db, "live_realtime_scope_100_status"),
  all(db, "live_country_registry", "iso3,enabled", q => q.eq("enabled", true)),
  all(db, "live_raw_source_targets", "target_id,country_iso3,category,transport,source_id,enabled,last_success_at,last_attempt_at,discovery_state,consecutive_failures", q => q.eq("enabled", true)),
  all(db, "live_realtime_scope_targets", "target_id,scope_type,scope_code,category,transport,source_id,enabled,activation_mode,last_success_at,last_attempt_at,discovery_state,consecutive_failures", q => q.eq("enabled", true)),
  all(db, "live_ingestion_cursors", "source_key,stream_key,status,last_success_at,last_item_at,consecutive_failures,updated_at"),
  all(db, "live_source_certification_records", "source_id,certification_state,endpoint_status,rights_status,schema_status,freshness_status,provenance_status,independence_status,adapter_status,runtime_status,fallback_status,certification_hash,certified_at"),
  all(db, "live_source_certification_queue", "queue_key,source_id,scope_type,scope_code,certification_state,fail_closed,endpoint_check,rights_check,schema_check,freshness_check,independence_check"),
  all(db, "live_global_source_universe", "universe_id,scope_type,scope_code,source_role,source_id,required"),
]);

const inventory = data[0];
const sourceNetwork = data[1];
const sourceLaunch = data[2];
const rawCoverage = data[3];
const rawRuntime = data[4];
const scopeStatus = data[5];
const countries = data[6];
const rawTargets = data[7];
const scopeTargets = data[8];
const cursors = data[9];
const certRecords = data[10];
const certQueue = data[11];
const sourceUniverse = data[12];

const enabledCountries = countries.map(r => String(r.iso3 || "").toUpperCase()).filter(Boolean);
const countrySet = new Set(enabledCountries);

const cells = new Map();
for (const country of enabledCountries) {
  for (const category of CATEGORIES) {
    cells.set(country + "::" + category, { country_iso3: country, category, configured: [], fresh: [], fresh_non_gdelt: [] });
  }
}
for (const row of rawTargets) {
  const keyCell = String(row.country_iso3 || "").toUpperCase() + "::" + String(row.category || "");
  const cell = cells.get(keyCell);
  if (!cell || !countrySet.has(cell.country_iso3)) continue;
  cell.configured.push(row);
  if (fresh(row.last_success_at, RAW_WINDOWS[cell.category], now)) {
    cell.fresh.push(row);
    if (!/gdelt/i.test(String(row.source_id || ""))) cell.fresh_non_gdelt.push(row);
  }
}

const rawMissing = Array.from(cells.values()).filter(c => c.fresh.length === 0);
const nonGdeltMissing = Array.from(cells.values()).filter(c => c.fresh_non_gdelt.length === 0);
const rawStructuralMissing = Array.from(cells.values()).filter(c => c.configured.length === 0);

const gdelt = cursors.find(r => r.source_key === "gdelt_gal" && r.stream_key === "global-relevant") || null;
const gdeltPass = Boolean(gdelt) &&
  gdelt.status === "healthy" &&
  Number(gdelt.consecutive_failures || 0) === 0 &&
  fresh(gdelt.last_success_at, 1800, now);

const orchestratorRows = new Map(
  cursors.filter(r => r.source_key === "geomacro_intelligence_orchestrator")
    .map(r => [String(r.stream_key || "").replace(/^orchestrator:/, ""), r])
);
const orchestratorChecks = Object.entries(TASK_WINDOWS).map(([task, maxAge]) => {
  const row = orchestratorRows.get(task) || null;
  const a = age(row && row.last_success_at, now);
  const pass = Boolean(row) && row.status === "healthy" &&
    Number(row.consecutive_failures || 0) === 0 &&
    Number.isFinite(a) && a <= maxAge;
  return {
    task, pass, status: row ? row.status : null,
    last_success_at: row ? row.last_success_at : null,
    age_seconds: Number.isFinite(a) ? Math.round(a) : null,
    max_age_seconds: maxAge,
    consecutive_failures: row ? Number(row.consecutive_failures || 0) : null,
  };
});
const orchestratorFailed = orchestratorChecks.filter(r => !r.pass);

const burstTargets = scopeTargets.filter(r => r.transport === "GDELT_BURST");
const directTargets = scopeTargets.filter(r => r.transport === "WEB_DIRECT");
const corridorIds = Array.from(new Set(burstTargets.filter(r => r.scope_type === "CORRIDOR").map(r => String(r.scope_code))));
const hotTopicIds = Array.from(new Set(burstTargets.filter(r => r.scope_type === "HOT_TOPIC").map(r => String(r.scope_code))));
const missingBurst = [];
for (const item of [
  { type: "CORRIDOR", scopes: corridorIds },
  { type: "HOT_TOPIC", scopes: hotTopicIds },
]) {
  for (const scope of item.scopes) {
    for (const category of CATEGORIES) {
      if (!burstTargets.some(r => r.scope_type === item.type && r.scope_code === scope && r.category === category)) {
        missingBurst.push({ scope_type: item.type, scope_code: scope, category });
      }
    }
  }
}
const staleDirect = directTargets.map(row => {
  const maxAge = row.activation_mode === "CONTINUOUS" ? 1200 : 1800;
  const a = age(row.last_success_at, now);
  const pass = fresh(row.last_success_at, maxAge, now) &&
    row.discovery_state !== "UNREACHABLE" &&
    row.discovery_state !== "STALE" &&
    Number(row.consecutive_failures || 0) === 0;
  return {
    target_id: row.target_id,
    source_id: row.source_id,
    scope_type: row.scope_type,
    scope_code: row.scope_code,
    category: row.category,
    pass,
    last_success_at: row.last_success_at || null,
    age_seconds: Number.isFinite(a) ? Math.round(a) : null,
    max_age_seconds: maxAge,
    discovery_state: row.discovery_state || null,
    consecutive_failures: Number(row.consecutive_failures || 0),
  };
}).filter(r => !r.pass);

const requiredSourceIds = Array.from(new Set(
  sourceUniverse.filter(r => bool(r.required)).map(r => String(r.source_id || "")).filter(Boolean)
));
const certById = new Map(certRecords.map(r => [String(r.source_id), r]));
const missingCert = requiredSourceIds.filter(id => !certById.has(id));
const blockedCert = requiredSourceIds.map(id => certById.get(id)).filter(Boolean).filter(r =>
  !(r.certification_state === "CERTIFIED" &&
    r.endpoint_status === "PASS" &&
    ["COMMERCIAL_OK", "DERIVED_ONLY"].includes(r.rights_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(r.schema_status) &&
    ["FRESH", "VARIABLE", "NOT_APPLICABLE"].includes(r.freshness_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(r.provenance_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(r.independence_status) &&
    ["TESTED", "NOT_APPLICABLE"].includes(r.adapter_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(r.runtime_status) &&
    ["READY", "NOT_REQUIRED"].includes(r.fallback_status) &&
    Boolean(r.certification_hash) &&
    Boolean(r.certified_at)
  )
);
const blockedQueue = certQueue.filter(q =>
  q.fail_closed === true ||
  q.certification_state !== "CERTIFIED" ||
  q.endpoint_check !== "PASS" ||
  !["COMMERCIAL_OK", "DERIVED_ONLY"].includes(q.rights_check) ||
  q.schema_check !== "PASS" ||
  q.freshness_check !== "PASS" ||
  q.independence_check !== "PASS"
);

const gates = [
  {
    serial: 1, gate: "CANONICAL_195_COUNTRIES",
    pass: enabledCountries.length === 195 && cells.size === 585,
    evidence: { enabled_country_count: enabledCountries.length, country_category_cells: cells.size, expected_country_category_cells: 585 }
  },
  {
    serial: 2, gate: "RAW_SOURCE_MATRIX_195x3",
    pass: bool(rawCoverage && rawCoverage.raw_source_coverage_100_complete) && rawStructuralMissing.length === 0,
    evidence: { view: rawCoverage, structural_missing_cells: rawStructuralMissing.map(c => ({ country_iso3: c.country_iso3, category: c.category })) }
  },
  {
    serial: 3, gate: "RAW_RUNTIME_FRESH_195x3",
    pass: bool(rawRuntime && rawRuntime.raw_runtime_100_complete) && rawMissing.length === 0,
    evidence: { view: rawRuntime, missing_fresh_cells: rawMissing.map(c => ({ country_iso3: c.country_iso3, category: c.category, configured_targets: c.configured.length })) }
  },
  {
    serial: 4, gate: "NON_GDELT_RUNTIME_INDEPENDENCE_195x3",
    pass: nonGdeltMissing.length === 0,
    evidence: { cells: 585, fresh_non_gdelt_cells: 585 - nonGdeltMissing.length, missing_cells: nonGdeltMissing.map(c => ({ country_iso3: c.country_iso3, category: c.category })) }
  },
  {
    serial: 5, gate: "GDELT_FIRST_BREAK_FRESH",
    pass: gdeltPass,
    evidence: { status: gdelt ? gdelt.status : null, last_success_at: gdelt ? gdelt.last_success_at : null, age_seconds: gdelt ? Math.round(age(gdelt.last_success_at, now)) : null, max_age_seconds: 1800 }
  },
  {
    serial: 6, gate: "CORRIDOR_AND_HOT_TOPIC_FANOUT",
    pass: bool(scopeStatus && scopeStatus.realtime_scope_contract_100_complete) && missingBurst.length === 0,
    evidence: {
      view: scopeStatus,
      corridor_count: corridorIds.length,
      corridor_burst_target_count: burstTargets.filter(r => r.scope_type === "CORRIDOR").length,
      hot_topic_count: hotTopicIds.length,
      hot_topic_burst_target_count: burstTargets.filter(r => r.scope_type === "HOT_TOPIC").length,
      missing_targets: missingBurst
    }
  },
  {
    serial: 7, gate: "DIRECT_OPERATIONAL_SOURCES_100_FRESH",
    pass: staleDirect.length === 0,
    evidence: { direct_target_count: directTargets.length, stale_or_failed_targets: staleDirect }
  },
  {
    serial: 8, gate: "SOURCE_CERTIFICATION_10_DIMENSIONS",
    pass: bool(sourceNetwork && sourceNetwork.source_network_100_complete) &&
      bool(sourceLaunch && sourceLaunch.source_network_launch_complete) &&
      missingCert.length === 0 &&
      blockedCert.length === 0 &&
      blockedQueue.length === 0,
    evidence: {
      source_network_100_complete: bool(sourceNetwork && sourceNetwork.source_network_100_complete),
      source_network_launch_complete: bool(sourceLaunch && sourceLaunch.source_network_launch_complete),
      required_source_count: requiredSourceIds.length,
      missing_certification_records: missingCert,
      blocked_certification_records: blockedCert.map(r => ({
        source_id: r.source_id,
        certification_state: r.certification_state,
        endpoint_status: r.endpoint_status,
        rights_status: r.rights_status,
        schema_status: r.schema_status,
        freshness_status: r.freshness_status,
        provenance_status: r.provenance_status,
        independence_status: r.independence_status,
        adapter_status: r.adapter_status,
        runtime_status: r.runtime_status,
        fallback_status: r.fallback_status,
      })),
      blocked_queue_paths: blockedQueue.map(r => ({
        queue_key: r.queue_key,
        source_id: r.source_id,
        scope_type: r.scope_type,
        scope_code: r.scope_code,
        certification_state: r.certification_state,
        fail_closed: r.fail_closed,
        endpoint_check: r.endpoint_check,
        rights_check: r.rights_check,
        schema_check: r.schema_check,
        freshness_check: r.freshness_check,
        independence_check: r.independence_check,
      })),
    }
  },
  {
    serial: 9, gate: "REALTIME_ORCHESTRATOR_CONTINUITY",
    pass: orchestratorFailed.length === 0,
    evidence: { checks: orchestratorChecks, failed_tasks: orchestratorFailed.map(r => r.task) }
  }
];

const result = {
  schema_version: "geomacro-global-realtime-intelligence-100-gate-1.0",
  generated_at: nowIso,
  authoritative_project_ref: PROJECT,
  overall_pass: gates.every(g => g.pass),
  ready_for_commercial_realtime_intelligence: gates.every(g => g.pass),
  gate_count: gates.length,
  passed_gate_count: gates.filter(g => g.pass).length,
  failed_gate_count: gates.filter(g => !g.pass).length,
  gates,
  summary: {
    enabled_countries: enabledCountries.length,
    raw_cells: cells.size,
    raw_runtime_missing_cells: rawMissing.length,
    fresh_non_gdelt_missing_cells: nonGdeltMissing.length,
    gdelt_fresh: gdeltPass,
    direct_targets: directTargets.length,
    direct_stale_or_failed: staleDirect.length,
    required_sources: requiredSourceIds.length,
    certification_missing: missingCert.length,
    certification_blocked: blockedCert.length,
    queue_blocked: blockedQueue.length,
    orchestrator_failed_tasks: orchestratorFailed.length,
  },
  claim_boundary: {
    governed_machine_checked_coverage_only: true,
    not_a_guarantee_of_observing_every_real_world_event: true,
    source_rights_are_source_specific: true,
    stale_or_unverified_evidence_is_not_deliverable: true,
    telegram_is_not_automatic_truth: true,
    gate_is_read_only: true,
    payment_is_not_enabled_by_this_gate: true,
  },
  writes_performed: false,
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

if (process.argv.includes("--strict") && !result.overall_pass) process.exit(1);
