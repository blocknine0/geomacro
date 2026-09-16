import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertCommercialEligibilityAllowed } from "./commercial-source-policy.mjs";

const SOURCE_ID = "world_bank_indicators";
const WORLD_BANK_API_SOURCE_ID = "2";
const DERIVED_METRIC = "ppg_external_debt_stock_pct_gni";
const DERIVED_UNIT = "percent_of_gni";
const SEMANTIC_BOUNDARY =
  "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT";
const MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1";
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_PPG_PRODUCTION_MAX_AGE_DAYS ?? 800);
const AS_OF = new Date(process.env.WORLD_BANK_PPG_PRODUCTION_AS_OF ?? Date.now());

const PPG = {
  id: "DT.DOD.DPPG.CD",
  label: "External debt stocks, public and publicly guaranteed (PPG) (DOD, current US$)",
};
const GNI = {
  id: "NY.GNP.MKTP.CD",
  label: "GNI (current US$)",
};

const db = createClient(
  process.env.SUPABASE_URL ?? process.env.APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const COMMERCIAL_ELIGIBILITY_STATUS = assertCommercialEligibilityAllowed(
  SOURCE_ID,
  "VERIFIED",
);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sha256(value) {
  const body = typeof value === "string" ? value : JSON.stringify(canonicalize(value));
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function observedAt(year) {
  if (!/^\d{4}$/.test(String(year))) return null;
  return new Date(Date.UTC(Number(year), 11, 31, 23, 59, 59, 999));
}

function ageDays(date) {
  return Math.max(0, (AS_OF.getTime() - date.getTime()) / 86_400_000);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Geomacro-World-Bank-PPG-Production-Ingest/1.0 (+https://geomacro.live)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const text = await response.text();
  return { parsed: JSON.parse(text), response_sha256: sha256(text), url };
}

async function assertSourceRegistration() {
  const result = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name")
    .eq("source_id", SOURCE_ID)
    .maybeSingle();
  if (result.error) throw result.error;
  const source = result.data;
  if (!source) throw new Error("World Bank source is not registered");
  if (
    source.commercial_usage_status !== "COMMERCIAL_OK" ||
    source.enabled_for_ingestion !== true ||
    source.enabled_for_commercial_signals !== true
  ) {
    throw new Error("World Bank source is not enabled for governed commercial ingestion");
  }
  return source;
}

async function loadRegistry() {
  const result = await db
    .from("live_country_registry")
    .select("iso3")
    .eq("enabled", true);
  if (result.error) throw result.error;
  return new Set(
    (result.data ?? [])
      .map((row) => String(row.iso3 ?? "").trim().toUpperCase())
      .filter((iso3) => /^[A-Z]{3}$/.test(iso3)),
  );
}

async function fetchIndicator(indicator, registry) {
  const startYear = Math.max(1960, AS_OF.getUTCFullYear() - 5);
  const endYear = AS_OF.getUTCFullYear();
  const params = new URLSearchParams({
    format: "json",
    source: WORLD_BANK_API_SOURCE_ID,
    per_page: "20000",
    date: `${startYear}:${endYear}`,
  });
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator.id}?${params.toString()}`;
  const result = await fetchJson(url);
  if (!Array.isArray(result.parsed) || !Array.isArray(result.parsed[1])) {
    throw new Error(`World Bank ${indicator.id} response shape invalid`);
  }

  const labels = new Set();
  const byCountryYear = new Map();
  for (const raw of result.parsed[1]) {
    const iso3 = String(raw?.countryiso3code ?? "").trim().toUpperCase();
    const year = String(raw?.date ?? "").trim();
    const date = observedAt(year);
    const value = raw?.value == null ? null : Number(raw.value);
    const label = String(raw?.indicator?.value ?? "").trim();
    if (label) labels.add(label);
    if (
      !registry.has(iso3) ||
      !date ||
      date > AS_OF ||
      !Number.isFinite(value)
    ) {
      continue;
    }
    byCountryYear.set(`${iso3}:${year}`, { iso3, year, date, value, raw });
  }
  if (labels.size !== 1 || !labels.has(indicator.label)) {
    throw new Error(
      `Unexpected World Bank ${indicator.id} label: ${[...labels].join(" | ") || "none"}`,
    );
  }
  return {
    ...indicator,
    response_sha256: result.response_sha256,
    url,
    byCountryYear,
    raw_row_count: result.parsed[1].length,
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid WORLD_BANK_PPG_PRODUCTION_AS_OF");
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("WORLD_BANK_PPG_PRODUCTION_MAX_AGE_DAYS must be positive");
  }

  const source = await assertSourceRegistration();
  const registry = await loadRegistry();
  const [ppg, gni] = await Promise.all([
    fetchIndicator(PPG, registry),
    fetchIndicator(GNI, registry),
  ]);

  const latestByCountry = new Map();
  for (const [key, debtRow] of ppg.byCountryYear.entries()) {
    const gniRow = gni.byCountryYear.get(key);
    if (!gniRow || !Number.isFinite(gniRow.value) || gniRow.value <= 0 || debtRow.value < 0) {
      continue;
    }
    const ratio = (debtRow.value / gniRow.value) * 100;
    if (!Number.isFinite(ratio)) continue;
    const candidate = {
      iso3: debtRow.iso3,
      year: debtRow.year,
      observed_at: debtRow.date.toISOString(),
      age_days: ageDays(debtRow.date),
      numerator_usd: debtRow.value,
      denominator_gni_usd: gniRow.value,
      ratio_percent_gni: ratio,
      numerator_raw: debtRow.raw,
      denominator_raw: gniRow.raw,
    };
    const current = latestByCountry.get(candidate.iso3);
    if (!current || candidate.year > current.year) latestByCountry.set(candidate.iso3, candidate);
  }

  const latest = [...latestByCountry.values()]
    .filter((row) => row.age_days <= MAX_AGE_DAYS)
    .sort((a, b) => a.iso3.localeCompare(b.iso3));
  if (latest.length < 20) {
    throw new Error(`World Bank PPG production peer universe ${latest.length} is below fixed minimum 20`);
  }

  const retrievedAt = new Date().toISOString();
  const observations = latest.map((row) => {
    const canonical = {
      source_id: SOURCE_ID,
      source_record_id:
        `${WORLD_BANK_API_SOURCE_ID}:derived:${PPG.id}:${GNI.id}:${row.iso3}:${row.year}`,
      category: "MACRO",
      country_iso3: row.iso3,
      observed_at: row.observed_at,
      published_at: row.observed_at,
      metric: DERIVED_METRIC,
      value_numeric: row.ratio_percent_gni,
      unit: DERIVED_UNIT,
      source_url: ppg.url,
      provenance: {
        provider: "World Bank",
        world_bank_api_source_id: WORLD_BANK_API_SOURCE_ID,
        derived_metric: DERIVED_METRIC,
        formula: `${PPG.id} / ${GNI.id} * 100`,
        numerator_indicator: PPG.id,
        numerator_label: PPG.label,
        numerator_response_sha256: ppg.response_sha256,
        denominator_indicator: GNI.id,
        denominator_label: GNI.label,
        denominator_response_sha256: gni.response_sha256,
        same_country_same_year_join_required: true,
        semantic_boundary: SEMANTIC_BOUNDARY,
        licence: "CC BY 4.0",
        licence_reference: "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets",
      },
    };
    const rawInputs = {
      numerator: row.numerator_raw,
      denominator: row.denominator_raw,
    };
    const normalizedHash = sha256(canonical);
    return {
      observation_id: `wb_ppg_${normalizedHash.slice(0, 32)}`,
      ...canonical,
      provenance: { ...canonical.provenance, retrieved_at: retrievedAt },
      raw_payload: rawInputs,
      raw_hash: sha256(rawInputs),
      normalized_hash: normalizedHash,
      quality_status: "VERIFIED",
      commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS,
    };
  });

  let persisted = 0;
  for (let index = 0; index < observations.length; index += 250) {
    const batch = observations.slice(index, index + 250);
    const result = await db.from("live_external_observations").upsert(batch, {
      onConflict: "source_id,normalized_hash",
      ignoreDuplicates: true,
    });
    if (result.error) throw result.error;
    persisted += batch.length;
  }

  const coverageStart = observations
    .map((row) => row.observed_at)
    .sort()[0] ?? null;
  const coverageEnd = observations
    .map((row) => row.observed_at)
    .sort()
    .at(-1) ?? null;
  const manifestSeed = {
    kind: MANIFEST_KIND,
    source_id: SOURCE_ID,
    metric: DERIVED_METRIC,
    numerator_indicator: PPG.id,
    denominator_indicator: GNI.id,
    numerator_response_sha256: ppg.response_sha256,
    denominator_response_sha256: gni.response_sha256,
    normalized_hashes: observations.map((row) => row.normalized_hash).sort(),
    semantic_boundary: SEMANTIC_BOUNDARY,
  };
  const manifestHash = sha256(manifestSeed);
  const releaseId = `ppg-gni-v1-${manifestHash.slice(0, 24)}`;
  const manifest = {
    source_id: SOURCE_ID,
    release_id: releaseId,
    dataset_version: "world-bank-source-2-ppg-gni-derived-v1",
    retrieved_at: retrievedAt,
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    rows_downloaded: ppg.raw_row_count + gni.raw_row_count,
    rows_normalized: observations.length,
    verified_rows: observations.length,
    partial_rows: 0,
    rejected_rows: 0,
    unmapped_rows: 0,
    write_completed: true,
    manifest_hash: manifestHash,
    metadata: {
      kind: MANIFEST_KIND,
      metric: DERIVED_METRIC,
      formula: `${PPG.id} / ${GNI.id} * 100`,
      numerator_indicator: PPG.id,
      denominator_indicator: GNI.id,
      numerator_response_sha256: ppg.response_sha256,
      denominator_response_sha256: gni.response_sha256,
      same_country_same_year_join_required: true,
      semantic_boundary: SEMANTIC_BOUNDARY,
      max_age_days: MAX_AGE_DAYS,
      fixed_peer_minimum: 20,
      raw_cross_source_value_pooling_allowed: false,
      ppg_external_debt_relabelled_as_total_government_debt: false,
      licence: "CC BY 4.0",
    },
  };
  const manifestWrite = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" });
  if (manifestWrite.error) throw manifestWrite.error;

  const persistedRows = await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,observed_at")
    .eq("metric", DERIVED_METRIC)
    .limit(1000);
  if (persistedRows.error) throw persistedRows.error;
  const persistedCountries = new Set(
    (persistedRows.data ?? [])
      .map((row) => String(row.country_iso3 ?? ""))
      .filter((iso3) => /^[A-Z]{3}$/.test(iso3)),
  );
  if (persistedCountries.size < 20) {
    throw new Error(`Persisted PPG peer universe ${persistedCountries.size} is below fixed minimum 20`);
  }

  console.log(JSON.stringify({
    source_id: SOURCE_ID,
    source_licence_name: source.licence_name ?? null,
    metric: DERIVED_METRIC,
    fresh_source_country_count: latest.length,
    attempted_persisted_observation_count: persisted,
    persisted_latest_country_count: persistedCountries.size,
    release_id: releaseId,
    manifest_hash: manifestHash,
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    semantic_boundary: SEMANTIC_BOUNDARY,
    commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS,
    production_scoring_changed_by_ingest: false,
    base_mainnet_gate_changed: false,
  }, null, 2));
  console.log("PASS: WORLD BANK PPG GOVERNED PRODUCTION INGEST COMPLETE");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
