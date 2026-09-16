import { createHash } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertCommercialEligibilityAllowed } from "./commercial-source-policy.mjs";

const WRITE = process.argv.includes("--write");
const OUTPUT = process.env.WDI_PPG_INGEST_OUTPUT ?? "wdi-ppg-debt-service-ingest.json";
const SOURCE_ID = "world_bank_indicators";
const WORLD_BANK_API_SOURCE_ID = "2";
const DATASET = "World Development Indicators";
const DATASET_LICENCE = "CC BY 4.0";
const DATASET_TERMS_URL = "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets";
const INDICATOR_ID = "DT.TDS.DPPG.GN.ZS";
const METRIC = "public_guaranteed_debt_service_pct_gni";
const UNIT = "percent_of_gni";
const MAX_AGE_DAYS = 800;
const MIN_PEERS = 20;

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
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function ageDays(observedAt, asOf) {
  const observed = new Date(observedAt);
  const evaluation = new Date(asOf);
  if (Number.isNaN(observed.getTime()) || Number.isNaN(evaluation.getTime())) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (evaluation.getTime() - observed.getTime()) / 86_400_000);
}

async function main() {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? process.env.APP_SUPABASE_URL ?? "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase server credentials are required");

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sourceState = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals")
    .eq("source_id", SOURCE_ID)
    .maybeSingle();
  if (sourceState.error) throw sourceState.error;
  if (
    !sourceState.data ||
    sourceState.data.commercial_usage_status !== "COMMERCIAL_OK" ||
    sourceState.data.enabled_for_ingestion !== true ||
    sourceState.data.enabled_for_commercial_signals !== true
  ) {
    throw new Error("World Bank WDI source is not active for verified commercial ingestion");
  }

  const registry = await db.from("live_country_registry").select("iso3,country_name").eq("enabled", true);
  if (registry.error) throw registry.error;
  const registryIso3 = new Set((registry.data ?? []).map((row) => String(row.iso3 ?? "").trim().toUpperCase()));

  const countriesResponse = await fetch(
    `https://api.worldbank.org/v2/country?format=json&source=${WORLD_BANK_API_SOURCE_ID}&per_page=500`,
    { headers: { accept: "application/json", "user-agent": "Geomacro-WDI-PPG-Ingest/1.0 (+https://geomacro.live)" } },
  );
  if (!countriesResponse.ok) throw new Error(`World Bank country request failed: ${countriesResponse.status}`);
  const countriesJson = await countriesResponse.json();
  const iso2ToIso3 = new Map();
  for (const country of Array.isArray(countriesJson) ? countriesJson[1] ?? [] : []) {
    const iso2 = String(country?.iso2Code ?? "").trim().toUpperCase();
    const iso3 = String(country?.id ?? "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(iso2) && /^[A-Z]{3}$/.test(iso3)) iso2ToIso3.set(iso2, iso3);
  }

  const url =
    `https://api.worldbank.org/v2/country/all/indicator/${INDICATOR_ID}` +
    `?format=json&source=${WORLD_BANK_API_SOURCE_ID}&per_page=20000&mrnev=1`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Geomacro-WDI-PPG-Ingest/1.0 (+https://geomacro.live)" },
  });
  if (!response.ok) throw new Error(`World Bank PPG debt-service request failed: ${response.status}`);
  const rawText = await response.text();
  const json = JSON.parse(rawText);
  if (!Array.isArray(json) || !Array.isArray(json[1])) throw new Error("World Bank PPG debt-service response shape invalid");

  const retrievedAt = new Date().toISOString();
  const observations = [];
  let skipped = 0;
  for (const row of json[1]) {
    if (row?.value == null || !Number.isFinite(Number(row.value))) {
      skipped += 1;
      continue;
    }
    const iso3 = iso2ToIso3.get(String(row?.country?.id ?? "").trim().toUpperCase());
    if (!iso3 || !registryIso3.has(iso3)) {
      skipped += 1;
      continue;
    }
    const year = String(row?.date ?? "");
    if (!/^\d{4}$/.test(year)) {
      skipped += 1;
      continue;
    }
    const observedAt = `${year}-12-31T00:00:00.000Z`;
    const canonical = {
      source_id: SOURCE_ID,
      source_record_id: `${WORLD_BANK_API_SOURCE_ID}:${INDICATOR_ID}:${iso3}:${year}`,
      category: "MACRO",
      country_iso3: iso3,
      observed_at: observedAt,
      published_at: observedAt,
      metric: METRIC,
      value_numeric: Number(row.value),
      unit: UNIT,
      source_url: url,
      provenance: {
        provider: "World Bank",
        dataset: DATASET,
        world_bank_api_source_id: WORLD_BANK_API_SOURCE_ID,
        indicator_id: INDICATOR_ID,
        indicator_name: row?.indicator?.value ?? null,
        country_name: row?.country?.value ?? null,
        measurement_concept: "Public and publicly guaranteed external debt service as percent of GNI",
        concept_boundary: "This is a public external debt-service burden measure, not central-government debt stock and not total external debt stock.",
        licence: DATASET_LICENCE,
        licence_reference: DATASET_TERMS_URL,
      },
    };
    const normalizedHash = sha256(canonical);
    observations.push({
      observation_id: `wb_${normalizedHash.slice(0, 32)}`,
      ...canonical,
      provenance: { ...canonical.provenance, retrieved_at: retrievedAt },
      raw_payload: row,
      raw_hash: sha256(row),
      normalized_hash: normalizedHash,
      quality_status: "VERIFIED",
      commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS,
    });
  }

  if (WRITE) {
    for (let index = 0; index < observations.length; index += 250) {
      const batch = observations.slice(index, index + 250);
      const result = await db
        .from("live_external_observations")
        .upsert(batch, { onConflict: "source_id,normalized_hash", ignoreDuplicates: true });
      if (result.error) throw result.error;
    }
  }

  const persisted = await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at")
    .eq("metric", METRIC)
    .limit(1000);
  if (persisted.error) throw persisted.error;

  const now = new Date().toISOString();
  const persistedFresh = (persisted.data ?? []).filter(
    (row) => row.observed_at && ageDays(String(row.observed_at), now) <= MAX_AGE_DAYS,
  );
  const fetchedFresh = observations.filter(
    (row) => ageDays(row.observed_at, now) <= MAX_AGE_DAYS,
  );

  const report = {
    schema_version: "geomacro-wdi-ppg-debt-service-ingest-1.0",
    generated_at: now,
    write_requested: WRITE,
    writes_performed: WRITE,
    authoritative_project_ref: projectRef(supabaseUrl),
    source: {
      source_id: SOURCE_ID,
      world_bank_api_source_id: WORLD_BANK_API_SOURCE_ID,
      dataset: DATASET,
      licence: DATASET_LICENCE,
      indicator_id: INDICATOR_ID,
      metric: METRIC,
      response_sha256: createHash("sha256").update(rawText, "utf8").digest("hex"),
    },
    fetched: {
      normalized_observation_count: observations.length,
      fresh_or_aging_country_count: new Set(fetchedFresh.map((row) => row.country_iso3)).size,
      skipped,
    },
    persisted: {
      latest_country_count: new Set((persisted.data ?? []).map((row) => row.country_iso3)).size,
      fresh_or_aging_country_count: new Set(persistedFresh.map((row) => row.country_iso3)).size,
      minimum_peer_gate_met: new Set(persistedFresh.map((row) => row.country_iso3)).size >= MIN_PEERS,
    },
    methodology_boundary: {
      public_external_debt_service_is_not_central_government_debt_stock: true,
      raw_cross_concept_pooling_allowed: false,
      metric_is_source_specific: true,
      production_risk_gate_activation_changed_by_this_script: false,
    },
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`WDI_PPG_INGEST_OUTPUT=${OUTPUT}`);
  console.log(
    WRITE
      ? "PASS: WDI PPG DEBT-SERVICE INGESTION COMPLETE"
      : "PASS: WDI PPG DEBT-SERVICE DRY RUN COMPLETE - DATABASE UNCHANGED",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
