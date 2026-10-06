#!/usr/bin/env node

import { createGriDbClient } from "../lib/gri-db-client.mjs";

const host = String(process.env.GEOMACRO_LIVE_HOST ?? "https://geomacro.live").replace(/\/$/, "");
const endpoint = `${host}/api/x402/risk/availability`;
const BATCH_SIZE = 25;
const BASELINE_COUNTRY_COUNT = 195;
const EXPECTED_PRICE_USDC = "0.05";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function canonicalBaseline() {
  const db = createGriDbClient();
  const directoryResult = await db
    .from("live_country_primary_source_directory")
    .select("country_iso2")
    .order("country_iso2", { ascending: true });
  if (directoryResult.error) throw new Error(`COUNTRY_BASELINE_DIRECTORY_READ_FAILED:${directoryResult.error.message}`);

  const registryResult = await db
    .from("live_country_registry")
    .select("iso2,iso3,enabled")
    .eq("enabled", true)
    .order("iso3", { ascending: true });
  if (registryResult.error) throw new Error(`COUNTRY_REGISTRY_READ_FAILED:${registryResult.error.message}`);

  const byIso2 = new Map(
    (registryResult.data ?? []).map((row) => [String(row.iso2 ?? "").toUpperCase(), String(row.iso3 ?? "").toUpperCase()]),
  );
  const iso3 = [...new Set(
    (directoryResult.data ?? [])
      .map((row) => byIso2.get(String(row.country_iso2 ?? "").toUpperCase()) ?? null)
      .filter((value) => typeof value === "string" && /^[A-Z]{3}$/.test(value)),
  )].sort();

  assert(iso3.length === BASELINE_COUNTRY_COUNT, `CANONICAL_195_COUNTRY_BASELINE_INVALID:${iso3.length}`);

  const corridorResult = await db
    .from("live_commercial_corridor_registry_status")
    .select("enabled_country_count,supported_directed_pair_count,invalid_enabled_iso3_rows,commercial_corridor_registry_complete,composition_method,route_modeling_status,corridor_score_status")
    .single();
  if (corridorResult.error) throw new Error(`CORRIDOR_REGISTRY_STATUS_READ_FAILED:${corridorResult.error.message}`);
  const corridor = corridorResult.data ?? {};
  assert(corridor.commercial_corridor_registry_complete === true, "COMMERCIAL_CORRIDOR_REGISTRY_INCOMPLETE");
  assert(Number(corridor.invalid_enabled_iso3_rows ?? -1) === 0, "COMMERCIAL_CORRIDOR_REGISTRY_INVALID_ISO3");
  assert(Number(corridor.enabled_country_count ?? 0) >= BASELINE_COUNTRY_COUNT, "COMMERCIAL_CORRIDOR_COUNTRY_FLOOR_NOT_MET");
  assert(Number(corridor.supported_directed_pair_count ?? 0) >= BASELINE_COUNTRY_COUNT * (BASELINE_COUNTRY_COUNT - 1), "COMMERCIAL_CORRIDOR_PAIR_FLOOR_NOT_MET");

  return { iso3, corridor };
}

async function availability(id, subjects, topics, expectedModules) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "cache-control": "no-cache",
    },
    body: JSON.stringify({
      schema_version: "geomacro.agent-query.v1",
      subjects,
      topics,
      evidence: "required",
      detail: "compact",
    }),
  });

  const payload = await response.json().catch(() => null);
  if (response.status !== 200) {
    throw new Error(`${id}:HTTP_${response.status}:${JSON.stringify({
      code: payload?.availability?.code ?? payload?.error?.code ?? null,
      missing_modules: payload?.availability?.missing_modules ?? null,
      stale_modules: payload?.availability?.stale_modules ?? null,
    })}`);
  }

  assert(payload?.ok === true, `${id}:OK_FALSE`);
  assert(payload?.chargeable === true, `${id}:NOT_CHARGEABLE`);
  assert(payload?.availability?.deliverable === true, `${id}:NOT_DELIVERABLE`);
  assert(payload?.payment_required_now === false, `${id}:PAYMENT_BOUNDARY_VIOLATION`);
  assert(payload?.execution_authorized === false, `${id}:EXECUTION_BOUNDARY_VIOLATION`);
  assert(String(payload?.exact_price?.amount_usdc ?? "") === EXPECTED_PRICE_USDC, `${id}:PRICE_MISMATCH`);
  assert(payload?.product === "geomacro_adaptive_risk_intelligence_v1", `${id}:PRODUCT_MISMATCH`);
  assert(/^[0-9a-f]{64}$/.test(String(payload?.query_plan_hash ?? "")), `${id}:QUERY_PLAN_HASH_INVALID`);

  const rows = Array.isArray(payload?.availability?.subjects) ? payload.availability.subjects : [];
  assert(rows.length === subjects.length, `${id}:SUBJECT_EVIDENCE_COUNT_MISMATCH:${rows.length}/${subjects.length}`);

  for (const row of rows) {
    const modules = Array.isArray(row?.available_modules) ? row.available_modules : [];
    for (const moduleName of expectedModules) {
      assert(modules.includes(moduleName), `${id}:REQUIRED_MODULE_MISSING:${moduleName}`);
    }
  }

  return {
    id,
    subject_count: subjects.length,
    topics,
    expected_modules: expectedModules,
    query_plan_hash: payload.query_plan_hash,
    amount_usdc: payload.exact_price.amount_usdc,
    network: payload.exact_price.network ?? null,
  };
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

const { iso3, corridor } = await canonicalBaseline();
const results = [];

for (const [index, batch] of chunks(iso3, BATCH_SIZE).entries()) {
  results.push(await availability(
    `country-geopolitics-${index + 1}`,
    batch.map((country_iso3) => ({ type: "country", country_iso3 })),
    ["conflict_geopolitics"],
    ["geopolitical_security"],
  ));
}

results.push(await availability(
  "macro-fx-india",
  [{ type: "country", country_iso3: "IND" }],
  ["macro_risk", "fx_external_risk"],
  ["macro_monetary", "sovereign_fiscal", "external_fx"],
));

results.push(await availability(
  "critical-minerals-china",
  [{ type: "country", country_iso3: "CHN" }],
  ["critical_minerals"],
  ["critical_minerals"],
));

// Exhaustive pair probing would be 37,830 requests for the 195-country floor and
// is intentionally rejected as a free-tier anti-pattern. The registry census
// proves the deterministic all-pairs contract; this ring makes every baseline
// country participate once as origin and once as destination in live x402
// availability proof using only eight bounded requests.
const corridorRing = iso3.map((origin_country_iso3, index) => ({
  type: "corridor",
  origin_country_iso3,
  destination_country_iso3: iso3[(index + 1) % iso3.length],
}));
for (const [index, batch] of chunks(corridorRing, BATCH_SIZE).entries()) {
  results.push(await availability(
    `corridor-ring-${index + 1}`,
    batch,
    ["trade_corridor"],
    ["trade_corridor"],
  ));
}

const proof = {
  schema_version: "geomacro.x402-global-zero-fund-coverage.v1",
  checked_at: new Date().toISOString(),
  host,
  ok: true,
  real_payment_performed: false,
  settlement_attempted: false,
  production_activation_changed: false,
  exact_price_usdc: EXPECTED_PRICE_USDC,
  canonical_country_baseline_count: iso3.length,
  country_geopolitics_subjects_proven: iso3.length,
  macro_paid_product_contract_proven: true,
  critical_minerals_paid_product_contract_proven: true,
  corridor_registry_complete: corridor.commercial_corridor_registry_complete,
  corridor_enabled_country_count: Number(corridor.enabled_country_count),
  corridor_supported_directed_pair_count: Number(corridor.supported_directed_pair_count),
  corridor_live_probe_subject_count: corridorRing.length,
  corridor_live_probe_strategy: "all_baseline_countries_directional_ring_plus_registry_census",
  corridor_route_modeling_status: corridor.route_modeling_status ?? null,
  corridor_score_status: corridor.corridor_score_status ?? null,
  request_count: results.length,
  results,
};
console.log(JSON.stringify(proof, null, 2));
