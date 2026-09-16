import fs from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertCommercialEligibilityAllowed } from "./commercial-source-policy.mjs";

const SOURCE_ID = "world_bank_qpsd";
const BULK_CSV = process.env.WORLD_BANK_QPSD_BULK_CSV ?? "qpsd-bulk/QPSDCSV.csv";
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_QPSD_PRODUCTION_MAX_AGE_DAYS ?? 550);
const AS_OF = new Date(process.env.WORLD_BANK_QPSD_PRODUCTION_AS_OF ?? Date.now());
const PARSER_VERSION = "world-bank-qpsd-bulk-v0.1.0";
const MANIFEST_KIND = "WORLD_BANK_QPSD_SOVEREIGN_FISCAL_V1";
const FIXED_PEER_MINIMUM = 20;

const SERIES = Object.freeze([
  {
    id: "DP.DOD.DECT.CR.GG.Z1",
    label: "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP",
    metric: "qpsd_general_government_gross_debt_pct_gdp",
    government_sector: "GENERAL_GOVERNMENT",
  },
  {
    id: "DP.DOD.DECT.CR.CG.Z1",
    label: "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP",
    metric: "qpsd_central_government_gross_debt_pct_gdp",
    government_sector: "CENTRAL_GOVERNMENT",
  },
]);

const db = createClient(
  process.env.SUPABASE_URL ?? process.env.APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const COMMERCIAL_ELIGIBILITY_STATUS = assertCommercialEligibilityAllowed(
  SOURCE_ID,
  "VERIFIED",
);

function sha256(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(body).digest("hex");
}

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

function hashJson(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseQuarterEnd(value) {
  const match = /^(\d{4})Q([1-4])$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0, 23, 59, 59, 999));
}

function ageDays(date) {
  return Math.max(0, (AS_OF.getTime() - date.getTime()) / 86_400_000);
}

async function assertSourceRegistration() {
  const result = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name")
    .eq("source_id", SOURCE_ID)
    .maybeSingle();
  if (result.error) throw result.error;
  const source = result.data;
  if (!source) throw new Error("World Bank QPSD source is not registered; apply migration 938 first");
  if (
    source.commercial_usage_status !== "COMMERCIAL_OK" ||
    source.enabled_for_ingestion !== true ||
    source.licence_name !== "CC BY 4.0"
  ) {
    throw new Error("World Bank QPSD source-state mismatch for governed ingestion");
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

function parseBulk(registry) {
  if (!fs.existsSync(BULK_CSV)) throw new Error(`QPSD bulk CSV missing: ${BULK_CSV}`);
  const bytes = fs.readFileSync(BULK_CSV);
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("QPSD bulk CSV is empty");
  const header = parseCsvLine(lines[0]);
  if (header.slice(0, 4).join("|") !== "Country Name|Country Code|Indicator Name|Indicator Code") {
    throw new Error(`Unexpected QPSD bulk header: ${header.slice(0, 4).join(" | ")}`);
  }
  const quarterColumns = header
    .map((period, index) => ({ period, index, date: parseQuarterEnd(period) }))
    .filter((item) => item.date && item.date <= AS_OF);
  if (quarterColumns.length === 0) throw new Error("QPSD bulk CSV has no usable quarterly columns");

  const bySeries = new Map(SERIES.map((series) => [series.id, []]));
  const labels = new Map(SERIES.map((series) => [series.id, new Set()]));
  let unmappedRows = 0;

  for (let lineNo = 1; lineNo < lines.length; lineNo += 1) {
    if (!lines[lineNo].includes("DP.DOD.DECT.CR.")) continue;
    const fields = parseCsvLine(lines[lineNo]);
    const iso3 = String(fields[1] ?? "").trim().toUpperCase();
    const label = String(fields[2] ?? "").trim();
    const seriesId = String(fields[3] ?? "").trim();
    const target = SERIES.find((series) => series.id === seriesId);
    if (!target) continue;
    labels.get(seriesId).add(label);
    if (!registry.has(iso3)) {
      if (/^[A-Z]{3}$/.test(iso3)) unmappedRows += 1;
      continue;
    }
    let latest = null;
    for (let index = quarterColumns.length - 1; index >= 0; index -= 1) {
      const column = quarterColumns[index];
      const raw = String(fields[column.index] ?? "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) continue;
      latest = {
        iso3,
        country_name: String(fields[0] ?? "").trim(),
        period: column.period,
        observed_at: column.date.toISOString(),
        value,
        age_days: ageDays(column.date),
      };
      break;
    }
    if (latest && latest.age_days <= MAX_AGE_DAYS) bySeries.get(seriesId).push(latest);
  }

  for (const series of SERIES) {
    const observed = [...labels.get(series.id)];
    if (observed.length !== 1 || observed[0] !== series.label) {
      throw new Error(`QPSD ${series.id} label mismatch: ${observed.join(" | ") || "none"}`);
    }
  }

  return {
    bytes,
    file_sha256: sha256(bytes),
    rows_downloaded: lines.length - 1,
    first_quarter: quarterColumns[0].period,
    last_quarter: quarterColumns.at(-1).period,
    unmapped_rows: unmappedRows,
    bySeries,
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid WORLD_BANK_QPSD_PRODUCTION_AS_OF");
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("WORLD_BANK_QPSD_PRODUCTION_MAX_AGE_DAYS must be positive");
  }

  const source = await assertSourceRegistration();
  const registry = await loadRegistry();
  const bulk = parseBulk(registry);
  const retrievedAt = new Date().toISOString();
  const allObservations = [];
  const coverage = {};

  for (const series of SERIES) {
    const rows = bulk.bySeries.get(series.id).sort((a, b) => a.iso3.localeCompare(b.iso3));
    coverage[series.metric] = {
      series_id: series.id,
      government_sector: series.government_sector,
      fresh_country_count: rows.length,
      peer_universe_eligible: rows.length >= FIXED_PEER_MINIMUM,
      iso3: rows.map((row) => row.iso3),
    };
    if (rows.length < FIXED_PEER_MINIMUM) continue;

    for (const row of rows) {
      const canonical = {
        source_id: SOURCE_ID,
        source_record_id: `3009:${series.id}:${row.iso3}:${row.period}`,
        category: "MACRO",
        country_iso3: row.iso3,
        observed_at: row.observed_at,
        published_at: row.observed_at,
        metric: series.metric,
        value_numeric: row.value,
        unit: "% of GDP",
        source_url: "https://databank.worldbank.org/data/download/QPSD_CSV.zip",
        provenance: {
          provider: "World Bank",
          dataset: "Quarterly Public Sector Debt",
          databank_source_id: "3009",
          dataset_catalog_id: "0037906",
          series_id: series.id,
          exact_label: series.label,
          government_sector: series.government_sector,
          period: row.period,
          bulk_file_sha256: bulk.file_sha256,
          parser_version: PARSER_VERSION,
          licence: "CC BY 4.0",
          licence_reference: "https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt",
          cross_concept_pooling_allowed: false,
          raw_cross_source_pooling_allowed: false,
        },
      };
      const normalizedHash = hashJson(canonical);
      allObservations.push({
        observation_id: `wb_qpsd_${normalizedHash.slice(0, 32)}`,
        ...canonical,
        provenance: { ...canonical.provenance, retrieved_at: retrievedAt },
        raw_payload: null,
        raw_hash: hashJson({
          series_id: series.id,
          iso3: row.iso3,
          period: row.period,
          value: row.value,
          bulk_file_sha256: bulk.file_sha256,
        }),
        normalized_hash: normalizedHash,
        quality_status: "VERIFIED",
        commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS,
      });
    }
  }

  if (allObservations.length === 0) {
    throw new Error("No QPSD series met the fixed >=20 peer minimum");
  }

  for (let index = 0; index < allObservations.length; index += 250) {
    const result = await db.from("live_external_observations").upsert(
      allObservations.slice(index, index + 250),
      { onConflict: "source_id,normalized_hash", ignoreDuplicates: true },
    );
    if (result.error) throw result.error;
  }

  const union = new Set();
  for (const item of Object.values(coverage)) {
    if (item.peer_universe_eligible) for (const iso3 of item.iso3) union.add(iso3);
  }

  const manifestSeed = {
    kind: MANIFEST_KIND,
    source_id: SOURCE_ID,
    bulk_file_sha256: bulk.file_sha256,
    parser_version: PARSER_VERSION,
    coverage,
  };
  const manifestHash = hashJson(manifestSeed);
  const releaseId = `qpsd-v1-${manifestHash.slice(0, 24)}`;
  const observedTimes = allObservations.map((row) => row.observed_at).sort();
  const manifest = {
    source_id: SOURCE_ID,
    release_id: releaseId,
    dataset_version: `qpsd-source-3009-${bulk.last_quarter}`,
    retrieved_at: retrievedAt,
    coverage_start: observedTimes[0] ?? null,
    coverage_end: observedTimes.at(-1) ?? null,
    rows_downloaded: bulk.rows_downloaded,
    rows_normalized: allObservations.length,
    verified_rows: allObservations.length,
    partial_rows: 0,
    rejected_rows: 0,
    unmapped_rows: bulk.unmapped_rows,
    write_completed: true,
    manifest_hash: manifestHash,
    metadata: {
      ...manifestSeed,
      first_quarter: bulk.first_quarter,
      last_quarter: bulk.last_quarter,
      max_age_days: MAX_AGE_DAYS,
      fixed_peer_minimum: FIXED_PEER_MINIMUM,
      source_specific_union_country_count: union.size,
      source_specific_union_iso3: [...union].sort(),
      raw_cross_source_value_pooling_allowed: false,
      cross_concept_peer_pooling_allowed: false,
      customer_delivery_mode: "DERIVED_INTELLIGENCE_WITH_PROVENANCE",
    },
  };
  const manifestWrite = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" });
  if (manifestWrite.error) throw manifestWrite.error;

  // Validate persistence directly from the governed observation store. The
  // customer-facing latest view intentionally stays empty while commercial
  // scoring is locked, so first-promotion ingest can finish before activation.
  const persisted = await db
    .from("live_external_observations")
    .select("country_iso3,metric")
    .eq("source_id", SOURCE_ID)
    .eq("quality_status", "VERIFIED")
    .eq("commercial_eligibility_status", COMMERCIAL_ELIGIBILITY_STATUS)
    .in("metric", SERIES.map((series) => series.metric))
    .limit(1000);
  if (persisted.error) throw persisted.error;
  const persistedByMetric = Object.fromEntries(
    SERIES.map((series) => [
      series.metric,
      new Set(
        (persisted.data ?? [])
          .filter((row) => row.metric === series.metric)
          .map((row) => String(row.country_iso3 ?? ""))
          .filter((iso3) => /^[A-Z]{3}$/.test(iso3)),
      ).size,
    ]),
  );

  for (const series of SERIES) {
    const expected = coverage[series.metric]?.peer_universe_eligible
      ? coverage[series.metric].fresh_country_count
      : 0;
    if (expected >= FIXED_PEER_MINIMUM && persistedByMetric[series.metric] < FIXED_PEER_MINIMUM) {
      throw new Error(
        `Persisted QPSD peer universe for ${series.metric} is below fixed minimum ${FIXED_PEER_MINIMUM}`,
      );
    }
  }

  console.log(JSON.stringify({
    source_id: SOURCE_ID,
    source_licence_name: source.licence_name ?? null,
    source_commercial_signals_enabled_during_ingest:
      source.enabled_for_commercial_signals === true,
    bulk_file_sha256: bulk.file_sha256,
    last_quarter: bulk.last_quarter,
    coverage,
    source_specific_union_country_count: union.size,
    persisted_latest_country_count_by_metric: persistedByMetric,
    release_id: releaseId,
    manifest_hash: manifestHash,
    commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS,
    production_scoring_changed_by_ingest: false,
    base_mainnet_gate_changed: false,
  }, null, 2));
  console.log("PASS: WORLD BANK QPSD GOVERNED PRODUCTION INGEST COMPLETE");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
